// Browser-side cost of a diagram for the "Hosting requirements" page: time until every table is drawn and the JavaScript heap, for several sizes.
// Run it against a THROW-AWAY instance (it creates an account's diagrams), same setup as server/bench.mjs:
//   BASE=http://localhost:3200 BENCH_EMAIL=bench@example.com BENCH_PASSWORD=bench-password-123 node web/benchclient.mjs
import { launch, sleep } from './cdp.mjs';

const BASE = process.env.BASE || 'http://localhost:3200', EMAIL = process.env.BENCH_EMAIL, PASS = process.env.BENCH_PASSWORD;
if (!EMAIL || !PASS) { console.error('set BENCH_EMAIL and BENCH_PASSWORD'); process.exit(2); }
if (/:3000\b/.test(BASE)) { console.error('refusing to run against :3000'); process.exit(2); }

let cookie = '';
const api = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
  return r.json();
};
const dbml = (n) => Array.from({ length: n }, (_, i) => `Table shop.t_${i} {\n  id integer [pk, increment]\n${Array.from({ length: 10 }, (_, c) => `  col_${c} varchar(80)`).join('\n')}\n  parent_id integer\n}\n${i ? `Ref: shop.t_${i}.parent_id > shop.t_${i - 1}.id\n` : ''}`).join('\n');

await api('POST', '/api/auth/login', { email: EMAIL, password: PASS });
const B = await launch({ width: 1440, height: 900, port: 9455 });
const { cdp, ev } = B;
const rows = [];
for (const n of [38, 100, 200, 400]) {
  const id = (await api('POST', '/api/diagrams', { title: `client bench ${n}`, dbml: dbml(n) })).id;
  await cdp('Network.clearBrowserCookies');
  await cdp('Page.navigate', { url: BASE + '/' }); await sleep(600);
  await ev(`(async () => { await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(EMAIL)}, password: ${JSON.stringify(PASS)} }) }); localStorage.setItem('lastDiagram', ${JSON.stringify(id)}); localStorage.setItem('tablesPanel', '0'); })()`);
  const t0 = Date.now();
  await cdp('Page.navigate', { url: BASE + '/' });
  let nodes = 0, ms = null;
  for (let i = 0; i < 600 && ms === null; i++) { await sleep(100); try { nodes = await ev(`document.querySelectorAll('.react-flow__node').length`); } catch { nodes = 0; } if (nodes >= n || (nodes > 0 && i > 450)) ms = Date.now() - t0; }
  await sleep(1500); // let the layout and the measuring passes finish
  const heap = await ev(`Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576)`);
  // pan/zoom smoothness: frames drawn in 2 s while the viewport is zoomed in and out
  const fps = await ev(`(async () => { let f = 0; const t = performance.now(); const tick = () => { f++; if (performance.now() - t < 2000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); const z = document.querySelector('.react-flow__pane'); for (let i = 0; i < 20; i++) { z.dispatchEvent(new WheelEvent('wheel', { deltaY: i % 2 ? -120 : 120, ctrlKey: true, clientX: 700, clientY: 400, bubbles: true })); await new Promise((r) => setTimeout(r, 90)); } await new Promise((r) => setTimeout(r, 300)); return Math.round(f / 2); })()`);
  rows.push({ tables: n, columns: n * 12, drawnNodes: nodes, secondsToDraw: ms === null ? null : +(ms / 1000).toFixed(1), jsHeapMb: heap, framesPerSecondWhileZooming: fps });
  await api('DELETE', `/api/diagrams/${id}`);
}
await B.close();
console.log(JSON.stringify(rows, null, 1));
