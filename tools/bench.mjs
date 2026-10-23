// Performance measurements for the "Hosting requirements" page. Run it against a THROW-AWAY instance (it creates an account, diagrams and a database):
//   docker build -t opendiagram-bench . && docker run -d --name bench-app -p 3200:3000 --cpus 1 --memory 512m -e APP_SECRET=$(openssl rand -hex 24) -e COOKIE_SECURE=0 opendiagram-bench
//   docker exec bench-app node src/cli.js create-admin bench@example.com 'bench-password-123'
//   BASE=http://localhost:3200 BENCH_CONTAINER=bench-app BENCH_EMAIL=bench@example.com BENCH_PASSWORD=bench-password-123 node tools/bench.mjs
// It prints JSON: latencies (p50/p95/max, ms) of the main calls, the cost of N people with a diagram open (heartbeat every 4 s, an
// occasional save) and the container's CPU / memory while that runs. `docker stats` is read from BENCH_CONTAINER.
import { execSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:3200', C = process.env.BENCH_CONTAINER || 'bench-app';
const EMAIL = process.env.BENCH_EMAIL, PASS = process.env.BENCH_PASSWORD;
if (!EMAIL || !PASS) { console.error('set BENCH_EMAIL and BENCH_PASSWORD'); process.exit(2); }
if (/:3000\b/.test(BASE)) { console.error('refusing to run against :3000'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1) : null; };
const sum = (a) => ({ n: a.length, p50: pct(a, 0.5), p95: pct(a, 0.95), max: pct(a, 1) });
class Client {
  cookie = '';
  async call(method, path, body) {
    const t = performance.now();
    const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', origin: BASE, ...(this.cookie ? { cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get('set-cookie'); if (set) this.cookie = set.split(';')[0];
    const text = await r.text();
    return { ms: performance.now() - t, status: r.status, json: text ? JSON.parse(text) : null, bytes: text.length };
  }
}
// CPU and memory straight from the container's cgroup (docker stats needs two samples to show a CPU figure): cpu = microseconds used so far, peak = highest memory so far
const cg = (f) => execSync(`docker exec ${C} cat /sys/fs/cgroup/${f}`, { encoding: 'utf8' });
const stats = () => { try { const cpu = +/usage_usec (\d+)/.exec(cg('cpu.stat'))[1]; const mem = +cg('memory.current') / 1048576, peak = +cg('memory.peak') / 1048576; return { at: performance.now(), cpuUs: cpu, memMb: +mem.toFixed(1), peakMb: +peak.toFixed(1) }; } catch { return null; } };
const cpuPct = (a, b) => (a && b ? +(((b.cpuUs - a.cpuUs) / 1000) / (b.at - a.at) * 100).toFixed(1) : null); // percent of ONE core

// a synthetic model: `n` tables of 12 columns, every table but the first references the previous one
const dbml = (n) => Array.from({ length: n }, (_, i) => `Table shop.t_${i} {\n  id integer [pk, increment]\n${Array.from({ length: 10 }, (_, c) => `  col_${c} varchar(80) [note: 'column ${c} of table ${i}']`).join('\n')}\n  parent_id integer\n}\n${i ? `Ref: shop.t_${i}.parent_id > shop.t_${i - 1}.id\n` : ''}`).join('\n');

const out = { base: BASE, container: C };
const me = new Client();
let r = await me.call('POST', '/api/auth/login', { email: EMAIL, password: PASS });
if (r.status !== 200) { console.error('sign-in failed', r.json); process.exit(2); }

// ---- idle
await sleep(3000);
out.idle = stats();

// ---- single calls, sequential
const seq = async (name, n, fn) => { const a = []; for (let i = 0; i < n; i++) { const x = await fn(i); a.push(x.ms); if (x.status >= 400) throw new Error(`${name}: ${x.status} ${JSON.stringify(x.json)}`); } out[name] = sum(a); };
const sizes = { small: 38, medium: 200, large: 600 };
const ids = {};
for (const [k, n] of Object.entries(sizes)) { const text = dbml(n); r = await me.call('POST', '/api/diagrams', { title: `bench ${k}`, dbml: text }); ids[k] = r.json.id; out[`dbml_${k}`] = { tables: n, kb: Math.round(text.length / 1024) }; }
await seq('health', 100, () => me.call('GET', '/api/health'));
await seq('list_diagrams', 50, () => me.call('GET', '/api/diagrams'));
for (const k of Object.keys(sizes)) {
  await seq(`open_${k}`, 30, () => me.call('GET', `/api/diagrams/${ids[k]}`));
  let v = 0;
  await seq(`save_${k}`, 20, () => me.call('PUT', `/api/diagrams/${ids[k]}`, { dbml: dbml(sizes[k]) + `\n// edit ${v++}\n` }));
}
await seq('history_list', 30, () => me.call('GET', `/api/diagrams/${ids.small}/versions`));
await seq('presence', 100, (i) => me.call('POST', `/api/diagrams/${ids.small}/presence`, { tab: 'bench-solo', sel: null, editing: false }));
const logins = []; for (let i = 0; i < 10; i++) { const c = new Client(); const x = await c.call('POST', '/api/auth/login', { email: EMAIL, password: PASS }); logins.push(x.ms); } out.login_scrypt = sum(logins);

// ---- N people with the medium diagram open for 30 s: a heartbeat every 4 s each, a save by one in ten every 20 s
const crowd = async (people, seconds = 30) => {
  const lat = { presence: [], save: [], open: [] }, errors = [], samples = [];
  // everybody signs in at the same moment first (a "login storm": scrypt costs CPU), then the steady state is measured
  const clients = Array.from({ length: people }, () => new Client());
  const t0 = performance.now();
  await Promise.all(clients.map((c) => c.call('POST', '/api/auth/login', { email: EMAIL, password: PASS })));
  const loginBurstMs = Math.round(performance.now() - t0);
  const stop = Date.now() + seconds * 1000;
  const first = stats();
  const sampler = (async () => { while (Date.now() < stop) { const s = stats(); if (s) samples.push(s); await sleep(1000); } })();
  const one = async (c, i) => {
    const o = await c.call('GET', `/api/diagrams/${ids.medium}`); lat.open.push(o.ms);
    await sleep(Math.random() * 4000);
    let next = Date.now() + 20000 * Math.random();
    while (Date.now() < stop) {
      const p = await c.call('POST', `/api/diagrams/${ids.medium}/presence`, { tab: `bench-tab-${i}`, sel: i % 3 ? null : 'shop.t_5', editing: i % 10 === 0 });
      lat.presence.push(p.ms); if (p.status >= 400) errors.push(p.status);
      if (i % 10 === 0 && Date.now() > next) { const s = await c.call('PUT', `/api/diagrams/${ids.medium}`, { dbml: dbml(200) + `
// ${i} ${Date.now()}
` }); lat.save.push(s.ms); if (s.status >= 400 && s.status !== 409) errors.push(s.status); next = Date.now() + 20000; }
      await sleep(4000);
    }
  };
  await Promise.all([sampler, ...clients.map((c, i) => one(c, i))]);
  const last = stats();
  const win = samples.slice(1).map((s, i) => cpuPct(samples[i], s)).filter((x) => x !== null); // per-second figures inside the window
  return { people, loginBurstMs, presence: sum(lat.presence), save: sum(lat.save), open: sum(lat.open), errors: errors.length, cpuAvgPct: cpuPct(first, last), cpuMaxPct: Math.max(0, ...win), memPeakMb: last?.peakMb };
};
out.crowd = [];
for (const n of [10, 50, 150]) out.crowd.push(await crowd(n));
out.after = stats();

// ---- clean up what this run made
for (const id of Object.values(ids)) await me.call('DELETE', `/api/diagrams/${id}`);
console.log(JSON.stringify(out, null, 1));
