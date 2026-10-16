// UI audit: opens every screen, drawer, menu and dialog of the app in headless Chrome and reports what breaks the rules in
// .specs/11-ui-review.md: control without an accessible name, pointer target < 24px, field without a label, text contrast < 4.5:1,
// horizontal overflow, dialog without role/focus handling, keyboard focus that is invisible or lost. Light and dark theme,
// desktop / tablet / phone. Fixtures are created through the API, so run it against a THROW-AWAY instance (it refuses :3000):
//   docker run -d --name audit-app --network rea_dbdiagram_default -p 3100:3000 -e APP_SECRET=$(openssl rand -hex 24) rea_dbdiagram-app
//   docker exec audit-app node src/cli.js create-admin audit@example.com 'audit-password-123'
//   (AUDIT_CONTAINER=<name> if the container is not called audit-app: the audit writes one row of scheduler state into its database)
//   BASE=http://localhost:3100 AUDIT_EMAIL=audit@example.com AUDIT_PASSWORD=audit-password-123 node web/uiaudit.mjs [screen-name ...]
// The first-run screen needs an EMPTY instance on :3101: run it on its own, BASE_EMPTY=http://localhost:3101 node web/uiaudit.mjs first-run
import { readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './cdp.mjs';
import { Api, seedTeam } from './fixtures.mjs';

const BASE = process.env.BASE || 'http://localhost:3100', EMPTY = process.env.BASE_EMPTY;
const EMAIL = process.env.AUDIT_EMAIL, PASS = process.env.AUDIT_PASSWORD;
const ONLY = process.argv.slice(2);
if (!EMAIL || !PASS) { console.error('set AUDIT_EMAIL and AUDIT_PASSWORD (administrator of the throw-away instance)'); process.exit(2); }
if (/localhost:3000/.test(BASE)) { console.error('refusing to run against :3000; use a throw-away instance, see the header'); process.exit(2); }
const { TEMPLATES } = await import('./src/templates.js');
const SAMPLE = TEMPLATES[0].dbml;

// ---------- fixtures (API)
const admin = new Api(BASE);
await admin.call('POST', '/api/auth/login', { email: EMAIL, password: PASS });
await admin.call('POST', '/api/admin/users', { email: 'temp@example.com', name: 'Temp User', password: 'Temp-pass-0000' }); // stays "must change password"
const versions = ['First', 'Second'].map((label, i) => [SAMPLE.replace('  phone varchar(30)\n', `  phone varchar(30)\n  extra_${i} int\n`), `${label} version`]);
const { maya, shop, lin } = await seedTeam({ base: BASE, admin, sample: SAMPLE, mayaPass: 'Maya-audit-pass-1', sampleExtra: "\n\nNote note_1 {\n  'A sticky note'\n}\n", versions });
const open = await admin.call('POST', `/api/diagrams/${shop}/shares`, { access: 'view' });
const locked = await admin.call('POST', `/api/diagrams/${shop}/shares`, { access: 'view', password: 'link-secret-1' });
await maya.call('POST', `/api/diagrams/${shop}/comments`, { body: 'A comment from Maya', target: 'table:customers' }).catch(() => {});
// a person who closed their account: their diagram waits for an administrator (Administration -> Users), and the sign-in log has entries
const leaver = new Api(BASE);
await admin.call('POST', '/api/admin/users', { email: 'leaver@example.com', name: 'Lea Vitor', password: 'Leaver-temp-pass-0' });
await leaver.call('POST', '/api/auth/login', { email: 'leaver@example.com', password: 'Leaver-temp-pass-0' });
await leaver.call('POST', '/api/auth/password', { current: 'Leaver-temp-pass-0', next: 'Leaver-audit-pass-1' });
await leaver.call('POST', '/api/diagrams', { title: 'Quarterly reporting model', dbml: SAMPLE });
await leaver.call('DELETE', '/api/auth/account', { password: 'Leaver-audit-pass-1' });
await new Api(BASE).call('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'wrong-password-1' }).catch(() => {}); // a failed sign-in for the log
// a diagram linked to a connection whose scheduled refresh failed 5 times (there is no API for that state: it is written into the instance's database)
const conn = await admin.call('POST', '/api/connections', { name: 'audit-db', type: 'postgres', host: 'demo-pg', port: 5432, database: 'demo', user: 'reader', password: 'reader', tls: 'off', refreshMinutes: 5 });
const failing = (await admin.call('POST', '/api/diagrams', { title: 'Refresh error' })).id;
await admin.call('PUT', `/api/diagrams/${failing}`, { dbml: SAMPLE, source: { connId: conn.id, schemas: ['shop'], tables: null, at: Date.now(), gen: 'x' } });
execSync(`docker exec -i ${process.env.AUDIT_CONTAINER || 'audit-app'} node -`, { input: `const { DatabaseSync } = require('node:sqlite'); new DatabaseSync('/data/app.db').prepare("insert into refresh_state (diagram_id, last_run, last_error, failures, paused) values (?, ?, ?, 5, 1)").run('${failing}', Math.floor(Date.now() / 1000), 'connect ECONNREFUSED demo-pg:5432');` });
console.log('fixtures ready');

// ---------- Chrome
const B = await launch({ width: 1280, height: 800 });
const { ev, cdp, key, viewport } = B;
const AUDIT = `window.__audit = () => {
  const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const rgb = (s) => { const v = (s.match(/[\d.]+/g) || [0, 0, 0, 0]).map(Number); return s.startsWith('color(') ? v.map((x, j) => (j < 3 ? x * 255 : x)) : v; }; // color-mix() comes back as color(srgb 0..1)
  const bgOf = (e) => { while (e) { const m = rgb(getComputedStyle(e).backgroundColor); if (m.length < 4 || m[3] > .5) return m; e = e.parentElement; } return [255, 255, 255]; };
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[inert]'); };
  const out = { noName: [], small: [], noLabel: [], lowContrast: [], overflow: [] };
  const nm = (e) => (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.title || e.textContent || '').trim();
  const id = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ').filter(Boolean)[0] : '');
  document.querySelectorAll('button,a[href],[role=button],[role=tab],[role=menuitem]').forEach((e) => {
    if (!vis(e) || e.closest('.react-flow__attribution,.dx-body,.dx-table,.dx-nav,td,p,li,.ds-md,.ds-content')) return;
    if (!nm(e)) out.noName.push(id(e));
    if (e.closest('.react-flow__viewport')) return; // sizes inside the canvas depend on the zoom
    const r = e.getBoundingClientRect(); if (r.width < 24 || r.height < 24) out.small.push(id(e) + ':' + Math.round(r.width) + 'x' + Math.round(r.height) + ':' + nm(e).slice(0, 14));
  });
  document.querySelectorAll('input:not([type=hidden]),select,textarea').forEach((e) => {
    if (!vis(e) || e.closest('.cm-editor,.react-flow')) return;
    if (!(e.getAttribute('aria-label') || e.title || e.closest('label') || (e.id && document.querySelector('label[for="' + e.id + '"]')))) out.noLabel.push(id(e) + (e.placeholder ? '(' + e.placeholder.slice(0, 14) + ')' : ''));
  });
  const seen = new Set();
  document.querySelectorAll('body *').forEach((e) => {
    if (!vis(e) || e.closest('.react-flow__attribution,.cm-editor,svg,.cm-gutters')) return;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    const s = getComputedStyle(e); if (+s.opacity < 1 || e.closest('.tbl.dim')) return;
    const L1 = lum(rgb(s.color)), L2 = lum(bgOf(e)), cr = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const big = parseFloat(s.fontSize) >= 18.66 || (parseFloat(s.fontSize) >= 14 && +s.fontWeight >= 700);
    if (cr < (big ? 3 : 4.5)) { const k = id(e) + ' ' + cr.toFixed(1); if (!seen.has(k)) { seen.add(k); out.lowContrast.push(k + ' "' + e.textContent.trim().slice(0, 16) + '"'); } }
  });
  if (document.documentElement.scrollWidth > innerWidth + 1) out.overflow.push('page ' + document.documentElement.scrollWidth + '>' + innerWidth);
  document.querySelectorAll('.admin-card,.drawer.open,.menu-pop,.algo-pop,.tpn').forEach((e) => { const r = e.getBoundingClientRect(); if (r.width && (r.right > innerWidth + 1 || r.left < -1)) out.overflow.push(id(e) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); });
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v.length));
};
window.H = {
  w: (ms) => new Promise((r) => setTimeout(r, ms)),
  btn: (t, root = document) => [...root.querySelectorAll('button,a,summary,label')].find((x) => x.textContent.trim().startsWith(t)),
  click: async (t, root = document) => { const b = window.H.btn(t, root); if (!b) throw new Error('no button: ' + t); b.click(); await window.H.w(450); },
  set: (el, v) => { const p = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); },
  q: (s) => document.querySelector(s),
  more: async (item) => { await window.H.click('More', document.querySelector('header.top')); await window.H.click(item, document.querySelector('.menu-pop')); await window.H.w(500); },
  account: async (item) => { const m = [...document.querySelectorAll('header.top .menu > .tbtn')].pop(); m.click(); await window.H.w(300); await window.H.click(item, document.querySelector('.menu-pop')); await window.H.w(500); },
  close: async () => { for (const s of ['.admin .x', '.admin-card .x', '.drawer.open .x', '.tpn-x']) document.querySelector(s)?.click(); document.querySelector('.menu-pop') && document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await window.H.w(350); },
};`;
const NAMES = (js) => ev(js);
let theme = 'light';
const go = async (path, { as = 'admin', local = {}, base = BASE } = {}) => {
  await cdp('Network.clearBrowserCookies');
  await cdp('Page.navigate', { url: base + '/' }); await sleep(500);
  const who = { admin: [EMAIL, PASS], maya: ['maya@example.com', 'Maya-audit-pass-1'], temp: ['temp@example.com', 'Temp-pass-0000'] }[as];
  await ev(`(async () => { localStorage.clear(); ${who ? `const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(who[0])}, password: ${JSON.stringify(who[1])} }) }); if (!r.ok) throw new Error('login ' + r.status);` : ''} localStorage.setItem('view', JSON.stringify({ theme: ${JSON.stringify(theme)}, grid: true })); for (const [k, v] of Object.entries(${JSON.stringify(local)})) localStorage.setItem(k, v); })()`);
  await cdp('Page.navigate', { url: base + path }); await sleep(2200);
  await ev(AUDIT);
};
const D = { lastDiagram: shop, tablesPanel: '0' };

// keyboard walk: Tab through the screen; every focused control must be visible and show a focus indicator
const KB = `(() => { const e = document.activeElement; if (!e || e === document.body) return null; const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none');
  const inView = e instanceof SVGElement || (r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight); // SVG groups report no box
  return { id: e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '') + ':' + (e.getAttribute('aria-label') || e.title || e.textContent || e.placeholder || '').trim().slice(0, 16), ring, inView, cm: !!e.closest('.cm-editor'), inert: !!e.closest('[inert]') }; })()`;
async function walk(n = 45) {
  const bad = new Set(); const seen = [];
  await ev(`document.activeElement?.blur(); window.scrollTo(0, 0)`);
  for (let i = 0; i < n; i++) {
    await key('Tab'); await sleep(40);
    const f = await ev(KB); if (!f) continue;
    if (seen.includes(f.id) && seen.length > 3 && f.id === seen[0]) break;
    seen.push(f.id);
    if (f.inert) bad.add(`focus reached an inert element: ${f.id}`);
    if (!f.cm && !f.ring) bad.add(`no visible focus indicator: ${f.id}`);
    if (!f.inView) bad.add(`focus is off screen: ${f.id}`);
  }
  return [...bad];
}
// dialog: role/name, focus inside, Tab and Shift+Tab stay inside
async function dialogChecks(sel = '.admin-card') {
  const bad = [];
  const info = await ev(`(() => { const c = document.querySelector(${JSON.stringify(sel)}); if (!c) return null; return { role: c.getAttribute('role'), modal: c.getAttribute('aria-modal'), name: !!(c.getAttribute('aria-label') || c.getAttribute('aria-labelledby')), inside: c.contains(document.activeElement) }; })()`);
  if (!info) return ['dialog not found'];
  if (info.role !== 'dialog') bad.push('dialog without role=dialog'); if (info.modal !== 'true') bad.push('dialog without aria-modal'); if (!info.name) bad.push('dialog without a name'); if (!info.inside) bad.push('focus did not move into the dialog');
  let out = 0;
  for (let i = 0; i < 12; i++) { await key('Tab'); await sleep(30); if (!(await ev(`!!document.querySelector(${JSON.stringify(sel)})?.contains(document.activeElement)`))) out++; }
  for (let i = 0; i < 4; i++) { await key('Tab', 8); await sleep(30); if (!(await ev(`!!document.querySelector(${JSON.stringify(sel)})?.contains(document.activeElement)`))) out++; }
  if (out) bad.push(`Tab left the dialog ${out} time(s)`);
  return bad;
}

// ---------- screens: [name, setup, options]
const results = {}; // key -> Set of findings
const note = (screen, vpName, findings) => { for (const [cat, arr] of Object.entries(findings)) for (const f of [].concat(arr)) { const k = `${cat}: ${f}`; ((results[k] ||= new Map()).get(screen) ? 0 : results[k].set(screen, new Set())); results[k].get(screen).add(`${theme}/${vpName}`); } };
const VP = { desktop: [1280, 800], phone: [375, 812] }; // tablet (768px) is deliberately not covered
async function run(name, setup, { vps = ['desktop'], themes = ['light', 'dark'], dialog, kb = false, after } = {}) {
  if (ONLY.length && !ONLY.includes(name)) return;
  for (const t of themes) for (const v of vps) {
    theme = t; await viewport(...VP[v], v === 'phone');
    try {
      await setup();
      await sleep(700);
      const f = await ev('window.__audit()');
      if (dialog) { const d = await dialogChecks(dialog); if (d.length) f.dialog = d; }
      if (kb) { const w = await walk(); if (w.length) f.keyboard = w; }
      if (after) await after();
      note(name, v, f);
      console.log(`  ${name} [${t}/${v}] ${Object.keys(f).length ? Object.entries(f).map(([k, a]) => k + ':' + a.length).join(' ') : 'ok'}`);
    } catch (e) { note(name, v, { error: `${e.message.split('\n')[0]}` }); console.log(`  ${name} [${t}/${v}] ERROR ${e.message.split('\n')[0]}`); }
  }
}
const adminOverlay = async (tab) => { await ev(`(async () => { await H.account('Administration'); ${tab ? `await H.click(${JSON.stringify(tab)}, H.q('.admin-head .dtabs')); await H.w(700);` : ''} })()`); };
const fillConn = (extra = '') => ev(`(async () => { await H.more('Database'); const f = (p) => H.q('.drawer [placeholder^="' + p + '"]'); H.set(f('Host'), 'demo-pg'); H.set(f('Port'), '5432'); H.set(f('Database'), 'demo'); H.set(f('User'), ${JSON.stringify('reader')}); H.set(f('Password'), 'reader'); await H.w(200); ${extra} })()`);

// 1. signed out / first run / forced password change
await run('login', () => go('/', { as: null }), { vps: ['desktop', 'phone'], kb: true });
await run('login-recover', async () => { await go('/', { as: null }); await ev(`H.click('Forgot your password?')`); }, { vps: ['desktop', 'phone'], kb: true });
if (EMPTY && ONLY.includes('first-run')) await run('first-run', () => go('/', { as: null, base: EMPTY }), { vps: ['desktop', 'phone'], kb: true });
await run('forced-password-change', () => go('/', { as: 'temp' }), { vps: ['desktop', 'phone'], kb: true });
// 2. main screen, menus
await run('main', () => go('/', { local: D }), { vps: ['desktop', 'phone'], kb: true });
await run('menu-export', async () => { await go('/', { local: D }); await ev(`H.click('Export', H.q('header.top'))`); }, { vps: ['desktop', 'phone'] });
await run('menu-more', async () => { await go('/', { local: D }); await ev(`H.click('More', H.q('header.top'))`); }, { vps: ['desktop', 'phone'] });
await run('menu-account', async () => { await go('/', { local: D }); await ev(`(async () => { [...document.querySelectorAll('header.top .menu > .tbtn')].pop().click(); await H.w(300); })()`); }, { vps: ['desktop', 'phone'] });
await run('account-recovery-key', async () => { await go('/', { local: D }); await ev(`(async () => { await H.account('Account'); await H.click('Generate', H.q('.drawer')); H.set(H.q('.drawer input[aria-label="Your password, to make the key"]'), '${PASS}'); await H.w(200); await H.click('Generate', H.q('.drawer')); await H.w(700); })()`); }, { vps: ['desktop', 'phone'], kb: true });
await run('account-delete-form', async () => { await go('/', { local: D }); await ev(`(async () => { await H.account('Account'); await H.click('Delete my account', H.q('.drawer')); })()`); }, { vps: ['desktop', 'phone'], kb: true });
await run('account-password-form', async () => { await go('/', { local: D }); await ev(`H.account('Account')`); }, { vps: ['desktop', 'phone'], kb: true });
// 3. drawers
for (const d of ['Diagrams', 'Import', 'History', 'View']) await run(`drawer-${d.toLowerCase()}`, async () => { await go('/', { local: D }); await ev(`H.more(${JSON.stringify(d)})`); }, { vps: ['desktop', 'phone'], kb: d === 'View' });
await run('drawer-import-pasted', async () => { await go('/', { local: D }); await ev(`(async () => { await H.more('Import'); const s = H.q('.drawer select'); s && H.set(s, s.options[1]?.value ?? s.value); H.set(H.q('.drawer textarea'), 'CREATE TABLE t (id int);'); await H.w(300); })()`); }, { vps: ['desktop'] });
await run('drawer-history-compare', async () => { await go('/', { local: D }); await ev(`(async () => { await H.more('History'); await H.click('Compare', H.q('.drawer')); await H.w(700); })()`); }, { vps: ['desktop', 'phone'], dialog: '.admin-card', kb: false });
await run('drawer-database', () => go('/', { local: D }).then(() => fillConn()), { vps: ['desktop', 'phone'], kb: true });
await run('drawer-database-tested', () => go('/', { local: D }).then(() => fillConn(`await H.click('Test connection', H.q('.drawer')); await H.w(2500); const c = [...document.querySelectorAll('.drawer .schemas input[type=checkbox]')].find((x) => /shop/.test(x.closest('label,div').textContent)); c && c.click(); await H.w(300);`)), { vps: ['desktop', 'phone'] });
await run('drawer-database-tls-verify', () => go('/', { local: D }).then(() => fillConn(`const s = [...document.querySelectorAll('.drawer select')].find((x) => /TLS/.test(x.textContent)); s && H.set(s, 'verify'); await H.w(400);`)), { vps: ['desktop'] });
await run('drawer-database-oracle', () => go('/', { local: D }).then(() => fillConn(`await H.click('Oracle', H.q('.drawer .seg')); await H.w(400);`)), { vps: ['desktop'] });
await run('drawer-database-write-warning', async () => { await go('/', { local: D }); await ev(`(async () => { await H.more('Database'); const f = (p) => H.q('.drawer [placeholder^="' + p + '"]'); H.set(f('Host'), 'demo-pg'); H.set(f('Port'), '5432'); H.set(f('Database'), 'demo'); H.set(f('User'), 'writer'); H.set(f('Password'), 'writer'); await H.w(200); await H.click('Test connection', H.q('.drawer')); await H.w(2500); })()`); }, { vps: ['desktop'] });
await run('drawer-database-refresh-timer', () => go('/', { local: D }).then(() => fillConn(`const s = [...document.querySelectorAll('.drawer select')].find((x) => /manual/.test(x.textContent)); if (s) { H.set(s, s.options[2].value); await H.w(300); }`)), { vps: ['desktop'] });
await run('drawer-database-refresh-error', async () => { await go('/', { local: { ...D, lastDiagram: failing } }); await ev(`H.more('Database')`); }, { vps: ['desktop', 'phone'], kb: true });
await run('toast-error', async () => { await go('/', { local: D }); await ev(`(async () => { await H.more('Database'); const f = (p) => H.q('.drawer [placeholder^="' + p + '"]'); H.set(f('Host'), 'does-not-exist.invalid'); H.set(f('Port'), '5432'); H.set(f('Database'), 'x'); H.set(f('User'), 'x'); H.set(f('Password'), 'x'); await H.click('Test connection', H.q('.drawer')); await H.w(1500); })()`); }, { vps: ['desktop', 'phone'], after: async () => { const t = await ev(`H.q('.toast')?.getAttribute('role')`); if (!t) note('toast-error', 'desktop', { toast: 'no toast shown or no role' }); } });
await run('table-picker', () => go('/', { local: D }).then(() => fillConn(`await H.click('Test connection', H.q('.drawer')); await H.w(2500); const c = [...document.querySelectorAll('.drawer .schemas input[type=checkbox]')].find((x) => /shop/.test(x.closest('label,div').textContent)); c && c.click(); await H.w(300); await H.click('All tables', H.q('.drawer')); await H.w(1500);`)), { vps: ['desktop', 'phone'], dialog: '.admin-card.tp' });
await run('table-picker-full-ddl', () => go('/', { local: D }).then(() => fillConn(`await H.click('Test connection', H.q('.drawer')); await H.w(2500); const c = [...document.querySelectorAll('.drawer .schemas input[type=checkbox]')].find((x) => /shop/.test(x.closest('label,div').textContent)); c && c.click(); await H.w(300); await H.click('All tables', H.q('.drawer')); await H.w(1500); H.q('.admin-card.tp .tp-foot input[type=checkbox]').click(); await H.click('Use all tables', H.q('.admin-card.tp')); await H.w(500);`)), { vps: ['desktop', 'phone'] });
await run('table-picker-groups', () => go('/', { local: D }).then(() => fillConn(`await H.click('Test connection', H.q('.drawer')); await H.w(2500); const c = [...document.querySelectorAll('.drawer .schemas input[type=checkbox]')].find((x) => /shop/.test(x.closest('label,div').textContent)); c && c.click(); await H.w(300); await H.click('All tables', H.q('.drawer')); await H.w(1500); await H.click('Groups', H.q('.admin-card.tp .dtabs')); await H.w(600);`)), { vps: ['desktop'], dialog: '.admin-card.tp' });
// 4. sharing
await run('share-person', async () => { await go('/', { local: D }); await ev(`H.click('Share', H.q('header.top'))`); }, { vps: ['desktop', 'phone'], kb: true });
await run('share-group', async () => { await go('/', { local: D }); await ev(`(async () => { await H.click('Share', H.q('header.top')); await H.click('Group', H.q('.drawer .seg')); })()`); }, { vps: ['desktop'] });
await run('share-link-with-password', async () => { await go('/', { local: D }); await ev(`(async () => { await H.click('Share', H.q('header.top')); const p = H.q('.drawer input[placeholder^="Password"]'); H.set(p, 'secret-pass-1'); await H.click('Create link', H.q('.drawer')); await H.w(800); })()`); }, { vps: ['desktop'] });
await run('shared-link-open', () => go(`/s/${open.token}`, { as: null }), { vps: ['desktop', 'phone'], kb: true });
await run('shared-link-logged-in', () => go(`/s/${open.token}`), { vps: ['desktop'] });
await run('shared-link-password-prompt', () => go(`/s/${locked.token}`, { as: null }), { vps: ['desktop', 'phone'], kb: true });
// 5. canvas
await run('tables-panel', () => go('/', { local: { ...D, tablesPanel: '1' } }), { vps: ['desktop', 'phone'], kb: false });
await run('tables-panel-filters', async () => { await go('/', { local: { ...D, tablesPanel: '1' } }); await ev(`(async () => { const b = H.q('.tpn .tpn-bar .tpn-ic:nth-of-type(1), .tpn .tpn-ic'); [...document.querySelectorAll('.tpn .tpn-ic')].find((x) => /filter/i.test(x.title || x.getAttribute('aria-label') || ''))?.click(); await H.w(400); })()`); }, { vps: ['desktop'] });
await run('arrange-popover', async () => { await go('/', { local: D }); await ev(`H.q('.algo-toggle').click(); H.w(300)`); }, { vps: ['desktop', 'phone'], kb: false });
await run('canvas-lineage', () => go('/', { local: { lastDiagram: lin, tablesPanel: '0' } }), { vps: ['desktop'] });
await run('canvas-highlight-and-collapse', async () => { await go('/', { local: D }); await ev(`(async () => { document.querySelector('.dock button[title^="Highlight"]')?.click(); document.querySelector('.dock button[title^="Collapse all"]')?.click(); await H.w(600); })()`); }, { vps: ['desktop'] });
await run('canvas-sticky-note', async () => { await go('/', { local: D }); await ev(`(async () => { document.querySelector('.dock button[title^="Add a sticky"]')?.click(); await H.w(800); })()`); }, { vps: ['desktop'] });
await run('canvas-table-selected', async () => { await go('/', { local: D }); await ev(`(async () => { document.querySelector('.react-flow__node-table')?.click(); await H.w(500); })()`); }, { vps: ['desktop'] });
await run('newer-version-bar', async () => { await go('/', { local: D }); await ev(`H.w(500)`); await admin.call('PUT', `/api/diagrams/${shop}`, { dbml: SAMPLE + '\n// edited elsewhere\n' }); await sleep(9000); }, { vps: ['desktop'] });
// 6. docs view
await run('docs-view', async () => { await go('/', { local: D }); await ev(`H.click('Docs', H.q('.mode'))`); }, { vps: ['desktop', 'phone'], kb: false });
await run('docs-view-changelog-comments', async () => { await go('/', { local: D }); await ev(`(async () => { await H.click('Docs', H.q('.mode')); await H.w(700); await H.click('Changelog', H.q('.dx-nav')); await H.w(600); const c = H.q('.dx-main .cmt-in, .dx-main [class*="cmt"] textarea, .dx-main .cmt'); c?.click(); await H.w(400); })()`); }, { vps: ['desktop'] });
await run('docs-view-collapsed', async () => { await go('/', { local: D }); await ev(`(async () => { await H.click('Docs', H.q('.mode')); await H.w(700); await H.click('Collapse all', H.q('.dx-nav')); await H.w(400); })()`); }, { vps: ['desktop'] });
// 7. administration
for (const t of ['Users', 'Groups', 'Connections', 'Audit', 'Sign-ins', 'Settings']) await run(`admin-${t.toLowerCase()}`, async () => { await go('/', { local: D }); await adminOverlay(t); }, { vps: ['desktop', 'phone'], dialog: t === 'Users' ? '.admin-card' : undefined });
await run('admin-audit-filters', async () => { await go('/', { local: D }); await adminOverlay('Sign-ins'); await ev(`(async () => { const sel = (l) => document.querySelector('.audit-bar select[aria-label="' + l + '"]'); H.set(sel('Type of operation'), 'connection.import'); H.set(sel('Done by'), sel('Done by').options[1].value); await H.w(900); })()`); }, { vps: ['desktop', 'phone'], kb: true });
await run('admin-register-connection-form', async () => { await go('/', { local: D }); await adminOverlay('Connections'); await ev(`H.click('+ Register', H.q('.admin-body'))`); }, { vps: ['desktop', 'phone'] });
await run('admin-create-user-result', async () => { await go('/', { local: D }); await adminOverlay('Users'); await ev(`(async () => { const i = [...document.querySelectorAll('.admin-form input')]; H.set(i[0], 'new.person@example.com'); H.set(i[1], 'New Person'); await H.click('Add user', H.q('.admin-form')); await H.w(900); })()`); }, { vps: ['desktop'] });
await run('admin-reset-password', async () => { await go('/', { local: D }); await adminOverlay('Users'); await ev(`(async () => { const row = [...document.querySelectorAll('.admin-table tr')].find((r) => /Maya/.test(r.textContent)); const b = [...(row?.querySelectorAll('button') || [])].find((x) => /Reset password/.test(x.textContent)); if (!b) throw new Error('no Reset password button on the Maya row'); b.click(); await H.w(900); })()`); }, { vps: ['desktop'] });
await run('admin-group-members', async () => { await go('/', { local: D }); await adminOverlay('Groups'); }, { vps: ['desktop', 'phone'] });
// 8. documentation site (every page, light; search light + dark)
const pageIds = readdirSync(new URL('./src/docsite/pages/', import.meta.url)).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
for (const id of pageIds) await run(`docsite-${id}`, async () => { await go(`/docs/${id}`, { as: null }); }, { vps: ['desktop', 'phone'], themes: ['light'] });
await run('docsite-search', async () => { await go('/docs', { as: null }); await ev(`(async () => { const i = H.q('input[type=search], input'); i && H.set(i, 'share'); await H.w(600); })()`); }, { vps: ['desktop'], themes: ['light', 'dark'] });
// 9. the downloaded documentation (standalone HTML) opened straight from disk
const dl = mkdtempSync(join(tmpdir(), 'od-dl-'));
await run('docs-export-html-from-disk', async () => {
  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await go('/', { local: D });
  await ev(`(async () => { await H.click('Export', H.q('header.top')); await H.click('Documentation (HTML)', H.q('.menu-pop')); await H.w(1500); })()`);
  const f = readdirSync(dl).find((x) => x.endsWith('.html')); if (!f) throw new Error('the HTML export was not downloaded');
  await cdp('Page.navigate', { url: pathToFileURL(join(dl, f)).href }); await sleep(1200); await ev(AUDIT);
  if (!(await ev(`document.querySelectorAll('table').length > 0`))) throw new Error('the exported HTML shows no tables');
}, { vps: ['desktop', 'phone'], themes: ['light'] });
rmSync(dl, { recursive: true, force: true });

// ---------- report
console.log('\n===== FINDINGS (deduplicated) =====');
const keys = Object.keys(results).sort();
if (!keys.length) console.log('none');
for (const k of keys) console.log(`${k}\n    ${[...results[k]].map(([s, v]) => `${s} [${[...v].join(',')}]`).join('; ')}`);
await B.close();
process.exit(keys.length ? 1 : 0);
