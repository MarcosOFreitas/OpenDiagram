// Retakes the pictures of the documentation site (web/src/docsite/img/*.jpg) with headless Chrome (CDP, no dependencies).
//
// It builds its own fixtures (accounts, a sample diagram, a shared connection, versions, presence), so run it against a
// THROW-AWAY instance, never against one that holds real diagrams or accounts (the pictures must not show anyone's data):
//   docker run -d --name shots-app --network rea_dbdiagram_default -p 3100:3000 -e APP_SECRET=$(openssl rand -hex 24) rea_dbdiagram-app
//   docker exec shots-app node src/cli.js create-admin docs@example.com 'docs-shots-password-1'
//   BASE=http://localhost:3100 SHOTS_EMAIL=docs@example.com SHOTS_PASSWORD=docs-shots-password-1 node web/docshots.mjs [only-name ...]
// The demo PostgreSQL (`demo-pg`, docker compose up -d) must be reachable from the app container.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'src/docsite/img');
const BASE = process.env.BASE || 'http://localhost:3100';
const EMAIL = process.env.SHOTS_EMAIL, PASS = process.env.SHOTS_PASSWORD;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => { try { return spawn(p, ['--version']).pid > 0; } catch { return false; } });
const W = 1100, H = 700, ONLY = process.argv.slice(2);
if (!EMAIL || !PASS) { console.error('set SHOTS_EMAIL and SHOTS_PASSWORD (an administrator of the throw-away instance)'); process.exit(2); }
if (/localhost:3000/.test(BASE)) { console.error('refusing to run against :3000 (your working instance); use a throw-away one, see the header'); process.exit(2); }
const { TEMPLATES } = await import('./src/templates.js');
const SAMPLE = TEMPLATES[0].dbml;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- API (fixtures)
class Api {
  cookie = '';
  async call(method, path, body) {
    const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', origin: BASE, ...(this.cookie ? { cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get('set-cookie'); if (set) this.cookie = set.split(';')[0];
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${j.error || ''}`);
    return j;
  }
}
const admin = new Api(), maya = new Api();
await admin.call('POST', '/api/auth/login', { email: EMAIL, password: PASS });
const me = (await admin.call('GET', '/api/auth/me')).user;
if (me.role !== 'admin') throw new Error('the account must be an administrator');
const users = await admin.call('GET', '/api/admin/users');
if (users.length > 1 || (await admin.call('GET', '/api/diagrams')).length) console.warn('warning: the instance is not empty; the pictures may show other data');
await admin.call('PATCH', `/api/admin/users/${me.id}`, { name: 'Alex Morgan' }).catch(() => {});

const MAYA_PASS = 'Maya-shots-pass-1';
let mayaUser = users.find((u) => u.email === 'maya@example.com');
if (!mayaUser) { await admin.call('POST', '/api/admin/users', { email: 'maya@example.com', name: 'Maya Santos', password: 'Maya-temp-pass-0' }); mayaUser = (await admin.call('GET', '/api/admin/users')).find((u) => u.email === 'maya@example.com'); }
await maya.call('POST', '/api/auth/login', { email: 'maya@example.com', password: 'Maya-temp-pass-0' }).catch(() => maya.call('POST', '/api/auth/login', { email: 'maya@example.com', password: MAYA_PASS }));
await maya.call('POST', '/api/auth/password', { current: 'Maya-temp-pass-0', next: MAYA_PASS }).catch(() => {});
const groupId = (await admin.call('POST', '/api/admin/groups', { name: 'Analytics' })).id;
await admin.call('PUT', `/api/admin/groups/${groupId}/members/${mayaUser.id}`, {}).catch(() => {});

const DB = { host: 'demo-pg', port: 5432, database: 'demo', user: 'reader', password: 'reader' };
const shared = await admin.call('POST', '/api/admin/connections', { type: 'postgres', name: 'Demo shop (read-only)', ...DB, tls: 'off' });
await admin.call('PUT', `/api/admin/connections/${shared.id}/access`, { groups: [groupId], users: [] });
// use it as Maya so the audit log has a real story
await maya.call('POST', '/api/schemas', { id: shared.id });
const imp = await maya.call('POST', '/api/import', { id: shared.id, schemas: ['shop'] });
const lineageDbml = imp.dbml + '\n\nNote note_1 {\n  \'Views are drawn with dashed arrows from the tables they read.\'\n}\n';

const shop = (await admin.call('POST', '/api/diagrams', { title: 'Online store - sample', dbml: SAMPLE })).id;
const lin = (await admin.call('POST', '/api/diagrams', { title: 'Shop (PostgreSQL)', dbml: lineageDbml })).id;
// versions for History and the changelog
const edits = [
  [SAMPLE.replace('  phone varchar(30)\n', '  phone varchar(30)\n  birth_date date\n'), 'Added customer birth date'],
  [SAMPLE.replace('  phone varchar(30)\n', '  phone varchar(30)\n  birth_date date\n').replace('  is_default boolean', '  country char(2)\n  is_default boolean'), 'Country on addresses'],
];
for (const [dbml, label] of edits) { await admin.call('PUT', `/api/diagrams/${shop}`, { dbml }); await admin.call('POST', `/api/diagrams/${shop}/versions`, { label }); await sleep(1100); }
await admin.call('POST', `/api/diagrams/${shop}/access`, { type: 'user', subjectId: mayaUser.id, access: 'edit' });
await admin.call('POST', `/api/diagrams/${lin}/access`, { type: 'user', subjectId: mayaUser.id, access: 'edit' });
await admin.call('POST', `/api/diagrams/${shop}/shares`, { access: 'view' });
const audit = (await admin.call('GET', '/api/admin/audit?limit=500')).length;
console.log(`fixtures ready (diagrams ${shop.slice(0, 8)}, ${lin.slice(0, 8)}; audit rows ${audit})`);

// ---------- Chrome over CDP
const profile = mkdtempSync(join(tmpdir(), 'docshots-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--disable-gpu', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) { await sleep(300); try { wsUrl = (await (await fetch('http://127.0.0.1:9333/json')).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ } }
if (!wsUrl) throw new Error('Chrome did not start');
const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r));
let seq = 0; const waiting = new Map(); const events = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } else events.push(d.method); });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; waiting.set(id, (d) => (d.error ? rej(new Error(`${method}: ${d.error.message}`)) : res(d.result))); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

// helpers that live in the page
const HELP = `window.H = {
  w: (ms) => new Promise((r) => setTimeout(r, ms)),
  btn: (t, root = document) => [...root.querySelectorAll('button,a,summary')].find((x) => x.textContent.trim().startsWith(t)),
  click: async (t, root = document) => { const b = window.H.btn(t, root); if (!b) throw new Error('no button: ' + t); b.click(); await window.H.w(400); },
  set: (el, v) => { const p = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); },
  more: async (item) => { await window.H.click('More', document.querySelector('header.top')); await window.H.click(item, document.querySelector('.menu-pop')); await window.H.w(500); },
  close: async () => { for (const s of ['.admin .x', '.admin-card .x', '.drawer.open .x', '.tpn-x']) document.querySelector(s)?.click(); document.querySelector('.menu-pop') && document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await window.H.w(350); },
};`;
const go = async (path, local = {}) => {
  await cdp('Page.navigate', { url: BASE + '/' });
  await sleep(600);
  await ev(`(async () => { const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(EMAIL)}, password: ${JSON.stringify(PASS)} }) }); if (!r.ok) throw new Error('login ' + r.status); localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(local)})) localStorage.setItem(k, v); })()`);
  await cdp('Page.navigate', { url: BASE + path });
  await sleep(2500);
  await ev(HELP);
};
const shot = async (name) => {
  await sleep(700);
  const { data } = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(join(OUT, `${name}.jpg`), Buffer.from(data, 'base64'));
  console.log(`  ${name}.jpg`);
};
const want = (n) => !ONLY.length || ONLY.includes(n);
const pulse = (id, state = {}) => maya.call('POST', `/api/diagrams/${id}/presence`, { tab: 'shots-maya-tab', ...state }).catch(() => {});
const view = { view: JSON.stringify({ theme: 'light', grid: true }) };
// editor closed and the diagram fitted: the canvas gets the whole width
const wide = () => ev(`(async () => { document.querySelector('.edge-toggle')?.click(); await H.w(500); H.btn('', document.querySelector('.dock'));  document.querySelector('.dock button[title="Fit to screen"]')?.click(); await H.w(600); })()`);

try {
  const dg = { lastDiagram: shop, tablesPanel: '0' };
  if (want('diagram-overview')) { await go('/', dg); await wide(); await shot('diagram-overview'); }
  if (want('arrange-menu')) { await go('/', dg); await wide(); await ev(`document.querySelector('.algo-toggle').click(); H.w(300)`); await shot('arrange-menu'); }
  if (want('tables-panel')) {
    await go('/', { ...dg, tablesPanel: '1' }); await wide();
    await ev(`(async () => { const i = document.querySelector('.tpn input[placeholder^="Search"]'); H.set(i, 'order'); await H.w(500); })()`);
    await shot('tables-panel');
  }
  if (want('detail-levels')) { await go('/', dg); await ev(`(async () => { await H.more('View'); const b = H.btn('Keys', document.querySelector('.drawer')); b && b.click(); await H.w(500); })()`); await shot('detail-levels'); }
  if (want('docs-view')) { await go('/', dg); await ev(`H.click('Docs', document.querySelector('.mode'))`); await sleep(1000); await shot('docs-view'); }
  if (want('docs-changelog')) {
    await go('/', dg); await ev(`H.click('Docs', document.querySelector('.mode'))`); await sleep(800);
    await ev(`(async () => { await H.click('Changelog', document.querySelector('.dx-nav')); await H.w(700); })()`);
    await shot('docs-changelog');
  }
  if (want('share-panel')) { await go('/', dg); await ev(`H.click('Share', document.querySelector('header.top'))`); await sleep(500); await shot('share-panel'); }
  if (want('history-drawer')) { await go('/', dg); await ev(`H.more('History')`); await sleep(900); await shot('history-drawer'); }
  if (want('connection-form') || want('table-picker') || want('table-picker-groups')) {
    await go('/', dg);
    await ev(`(async () => { await H.more('Database'); const f = (p) => document.querySelector('.drawer [placeholder^="' + p + '"]');
      H.set(f('Host'), 'demo-pg'); H.set(f('Port'), '5432'); H.set(f('Database'), 'demo'); H.set(f('User'), 'reader'); H.set(f('Password'), 'reader'); await H.w(200);
      await H.click('Test connection', document.querySelector('.drawer')); await H.w(2500);
      const c = [...document.querySelectorAll('.drawer .schemas input[type=checkbox]')].find((x) => /shop/.test(x.closest('label,div').textContent)); c && c.click(); await H.w(300); })()`);
    if (want('connection-form')) { await ev(`document.querySelector('.drawer .schemas')?.scrollIntoView({ block: 'center' }); H.w(300)`); await shot('connection-form'); }
    await ev(`(async () => { await H.click('All tables', document.querySelector('.drawer')); await H.w(1500); const i = document.querySelector('.admin-card.tp .tp-bar input'); if (i) { H.set(i, '*order*'); await H.w(500); } })()`);
    if (want('table-picker')) await shot('table-picker');
    if (want('table-picker-groups')) { await ev(`H.click('Groups', document.querySelector('.admin-card.tp .dtabs'))`); await sleep(800); await shot('table-picker-groups'); }
  }
  if (want('admin-connections') || want('admin-audit')) {
    await go('/', dg);
    await ev(`(async () => { document.querySelector('.menu .tbtn.user, header.top .menu:last-child .tbtn').click(); await H.w(300); await H.click('Administration', document.querySelector('.menu-pop')); await H.w(500); })()`);
    if (want('admin-connections')) { await ev(`H.click('Connections', document.querySelector('.admin-head .dtabs'))`); await sleep(900); await shot('admin-connections'); }
    if (want('admin-audit')) {
      await ev(`(async () => { await H.click('Audit', document.querySelector('.admin-head .dtabs')); await H.w(700); const s = document.querySelector('.audit-bar select'); H.set(s, 'connection'); await H.w(900); })()`);
      await shot('admin-audit');
    }
  }
  if (want('lineage-notes-presence')) {
    await go('/', { lastDiagram: lin, tablesPanel: '0' }); await wide();
    const beat = setInterval(() => pulse(lin, { sel: 'shop.customers' }), 4000); await pulse(lin, { sel: 'shop.customers' });
    await sleep(5500);
    await shot('lineage-notes-presence'); clearInterval(beat);
  }
} finally {
  ws.close(); chrome.kill(); await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold the profile */ }
}
console.log('done; review every picture before committing (no personal data, nothing cut off)');
process.exit(0);
