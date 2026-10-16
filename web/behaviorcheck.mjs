// Behaviour fingerprint of the interactive parts a refactor can break (menus, popovers, search, pickers, export list, copy).
// Prints one JSON object; run it against the old and the new build (fresh throw-away instances) and diff the outputs.
//   BASE=http://localhost:3110 SNAP_EMAIL=... SNAP_PASSWORD=... node web/behaviorcheck.mjs
import { launch, sleep } from './cdp.mjs';
const BASE = process.env.BASE, EMAIL = process.env.SNAP_EMAIL, PASS = process.env.SNAP_PASSWORD;
if (!BASE || !EMAIL || /localhost:3000/.test(BASE)) { console.error('set BASE (not :3000), SNAP_EMAIL, SNAP_PASSWORD'); process.exit(2); }
const { TEMPLATES } = await import('./src/templates.js');
let cookie = '';
const api = async (method, path, body) => { const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const s = r.headers.get('set-cookie'); if (s) cookie = s.split(';')[0]; return r.json().catch(() => ({})); };
await api('POST', '/api/auth/login', { email: EMAIL, password: PASS });
const id = (await api('POST', '/api/diagrams', { title: 'Online store - sample', dbml: TEMPLATES[0].dbml })).id;
const B = await launch({ port: 9571 });
const { ev, cdp } = B;
await cdp('Page.navigate', { url: BASE + '/' }); await sleep(600);
await ev(`(async () => { await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(EMAIL)}, password: ${JSON.stringify(PASS)} }) }); localStorage.clear(); localStorage.setItem('lastDiagram', ${JSON.stringify(id)}); localStorage.setItem('tablesPanel', '0'); })()`);
await cdp('Page.navigate', { url: BASE + '/' }); await sleep(2800);
await ev(`window.H = { w: (ms) => new Promise((r) => setTimeout(r, ms)), btn: (t, root = document) => [...root.querySelectorAll('button,a,summary')].find((x) => x.textContent.trim().startsWith(t)),
  click: async (t, root = document) => { const b = window.H.btn(t, root); if (!b) throw new Error('no button: ' + t); b.click(); await window.H.w(350); },
  set: (el, v) => { const p = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); } }`);
const out = {};
// 1. menus: open, press outside closes, press inside keeps, Escape closes
out.menu = await ev(`(async () => { const r = {}; const more = () => H.btn('More', document.querySelector('header.top')); const open = () => !!document.querySelector('.menu-pop');
  more().click(); await H.w(250); r.opened = open(); document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await H.w(250); r.outsideCloses = !open();
  more().click(); await H.w(250); document.querySelector('.menu-pop').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await H.w(250); r.insideKeeps = open();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await H.w(250); r.escapeCloses = !open(); return r; })()`);
out.exportMenu = await ev(`(async () => { H.btn('Export', document.querySelector('header.top')).click(); await H.w(250); const items = [...document.querySelectorAll('.menu-pop > *')].map((e) => e.tagName + ':' + e.textContent.replace(/\\s+/g, ' ').trim()); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await H.w(200); return items; })()`);
// 2. arrange popover
out.arrange = await ev(`(async () => { const r = {}; const pop = () => !!document.querySelector('.algo-pop'); document.querySelector('.algo-toggle').click(); await H.w(250); r.opened = pop();
  document.querySelector('.algo-pop').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await H.w(200); r.insideKeeps = pop();
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await H.w(250); r.outsideCloses = !pop();
  document.querySelector('.algo-toggle').click(); await H.w(250); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await H.w(250); r.escapeCloses = !pop(); return r; })()`);
// 3. Tables panel search and canvas dimming
out.search = await ev(`(async () => { const r = {}; document.querySelector('.tpn-toggle').click(); await H.w(500); const inp = document.querySelector('.tpn input[placeholder^="Search"]');
  const rows = () => [...document.querySelectorAll('.tpn-row .tpn-name')].map((e) => e.textContent).sort().join(','); const dim = () => document.querySelectorAll('.tbl.dim').length;
  r.all = rows(); H.set(inp, 'order'); await H.w(500); r.order = rows(); r.dimOrder = dim(); H.set(inp, 'Catalog'); await H.w(500); r.group = rows(); r.dimGroup = dim();
  H.set(inp, 'email'); await H.w(500); r.column = rows(); H.set(inp, '*_items'); await H.w(500); r.wildcard = rows(); H.set(inp, ''); await H.w(400); r.cleared = rows() === r.all && dim() === 0; return r; })()`);
// 4. icons present in the dock and the panel
out.icons = await ev(`JSON.stringify({ dock: [...document.querySelectorAll('.dock > button')].map((b) => b.title + ':' + b.querySelectorAll('svg').length), panelIc: [...document.querySelectorAll('.tpn .tpn-ic')].map((b) => (b.title || '') + ':' + b.querySelectorAll('svg').length) })`);
// 5. copy DBML: either message proves the path works
out.copy = await ev(`(async () => { H.btn('Export', document.querySelector('header.top')).click(); await H.w(250); await H.click('Copy DBML', document.querySelector('.menu-pop')); await H.w(400); return document.querySelector('.toast')?.textContent || null; })()`);
// 6. view defaults when the stored value is broken
await ev(`localStorage.setItem('view', '{broken')`); await cdp('Page.navigate', { url: BASE + '/' }); await sleep(2500);
await ev(`window.H = { w: (ms) => new Promise((r) => setTimeout(r, ms)), btn: (t, root = document) => [...root.querySelectorAll('button,a,summary')].find((x) => x.textContent.trim().startsWith(t)), click: async (t, root = document) => { const b = window.H.btn(t, root); if (!b) throw new Error('no button: ' + t); b.click(); await window.H.w(350); }, set: (el, v) => { const p = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); } }`);
out.brokenView = await ev(`(async () => { H.btn('More', document.querySelector('header.top')).click(); await H.w(250); await H.click('View', document.querySelector('.menu-pop')); await H.w(400); return [...document.querySelectorAll('.drawer .seg button.on')].map((b) => b.textContent).join('|'); })()`);
// 7. table picker (needs demo-pg): select shown / clear shown / toggle / clear all
out.picker = await ev(`(async () => { const r = {}; document.querySelector('.drawer .x')?.click(); await H.w(300); H.btn('More', document.querySelector('header.top')).click(); await H.w(250); await H.click('Database', document.querySelector('.menu-pop')); await H.w(400);
  const f = (p) => document.querySelector('.drawer [placeholder^="' + p + '"]'); H.set(f('Host'), 'demo-pg'); H.set(f('Port'), '5432'); H.set(f('Database'), 'demo'); H.set(f('User'), 'reader'); H.set(f('Password'), 'reader'); await H.w(200);
  await H.click('Test connection', document.querySelector('.drawer')); await H.w(2500); const c = [...document.querySelectorAll('.drawer .schemas input[type=checkbox]')].find((x) => /shop/.test(x.closest('label,div').textContent)); c && c.click(); await H.w(300);
  await H.click('All tables', document.querySelector('.drawer')); await H.w(1500); const on = () => document.querySelectorAll('.admin-card.tp .tp-card.on').length, cards = () => document.querySelectorAll('.admin-card.tp .tp-card').length;
  r.cards = cards(); r.start = on(); await H.click('Select shown', document.querySelector('.admin-card.tp')); r.afterSelectShown = on(); await H.click('Clear shown', document.querySelector('.admin-card.tp')); r.afterClearShown = on();
  document.querySelector('.admin-card.tp .tp-card input').click(); await H.w(200); r.afterOneClick = on(); await H.click('Clear all', document.querySelector('.admin-card.tp')); r.afterClearAll = on();
  await H.click('Groups', document.querySelector('.admin-card.tp .dtabs')); await H.w(600); r.groupCards = document.querySelectorAll('.admin-card.tp .tp-card').length; return r; })()`);
// 8. a shared connection registered while the page is open: it is listed, selecting it lists its schemas, and importing through it works (nothing is saved from the drawer)
const grp = await api('POST', '/api/admin/groups', { name: 'Analytics' });
const sc = await api('POST', '/api/admin/connections', { type: 'postgres', name: 'Shared demo', host: 'demo-pg', port: 5432, database: 'demo', user: 'reader', password: 'reader', tls: 'off' });
await api('PUT', `/api/admin/connections/${sc.id}/access`, { groups: [grp.id], users: [] });
out.shared = await ev(`(async () => { const r = {}; document.querySelector('.drawer .x')?.click(); await H.w(300); H.btn('More', document.querySelector('header.top')).click(); await H.w(250); await H.click('Database', document.querySelector('.menu-pop')); await H.w(500);
  const card = [...document.querySelectorAll('.drawer .card')].find((c) => /Shared demo/.test(c.textContent)); r.listed = !!card; card?.click(); await H.w(2500);
  r.schemasListedOnSelect = document.querySelectorAll('.drawer .schemas input[type=checkbox]').length; const c = [...document.querySelectorAll('.drawer .schemas input[type=checkbox]')].find((x) => /shop/.test(x.closest('label,div').textContent)); c && c.click(); await H.w(300);
  r.importEnabled = !H.btn('Import', document.querySelector('.drawer'))?.disabled; await H.click('Import', document.querySelector('.drawer')); await H.w(3500); r.imported = (document.querySelector('.cm-content')?.innerText || '').includes('shop.customers'); return r; })()`);
// 9. table picker on the shared connection: tables put in a group count as selected, and the Full DDL option reaches the diagram
const savedText = async () => { await sleep(3500); return ev(`(async () => { const id = localStorage.getItem('lastDiagram'); return (await fetch('/api/diagrams/' + id).then((r) => r.json())).dbml; })()`); };
// the diagram was just imported with all tables: the picker opens with every table ticked ("all" is visible), then the link is dropped so the next import starts from nothing ticked
out.allImported = await ev(`(async () => { const r = {}; await H.click('All tables', document.querySelector('.drawer')); await H.w(1500); const dlg = document.querySelector('.admin-card.tp'); r.cards = dlg.querySelectorAll('.tp-list .tp-card').length; r.ticked = dlg.querySelectorAll('.tp-card.on').length; r.footer = dlg.querySelector('.tp-foot .hint')?.textContent; await H.click('Cancel', dlg); await H.w(400); await H.click('Unlink', document.querySelector('.drawer')); await H.w(400); return r; })()`);
out.groupsCount = await ev(`(async () => { const r = {}; await H.click('All tables', document.querySelector('.drawer')); await H.w(1500); const dlg = document.querySelector('.admin-card.tp'); await H.click('Groups', dlg.querySelector('.dtabs')); await H.w(500);
  H.set(dlg.querySelector('.tp-new input[placeholder="Group name"]'), 'Core'); await H.w(200);
  for (const n of ['customers', 'orders', 'v_customer_orders']) { [...dlg.querySelectorAll('.tp-new .tp-card')].find((c) => c.querySelector('b')?.textContent === n).querySelector('input').click(); await H.w(150); }
  await H.click('Create group', dlg); await H.w(500); await H.click('Tables', dlg.querySelector('.dtabs')); await H.w(500);
  r.ticked = dlg.querySelectorAll('.tp-card.on').length; r.footer = dlg.querySelector('.tp-foot .hint')?.textContent; r.fullDdlBox = !!dlg.querySelector('.tp-foot input[type=checkbox]'); dlg.querySelector('.tp-foot input[type=checkbox]').click(); await H.click('Use', dlg); await H.w(500); return r; })()`);
await ev(`H.click('Import', document.querySelector('.drawer'))`);
const dd = await savedText();
out.groupsCount.importedTables = [...dd.matchAll(/^Table\s+(\S+)/gm)].map((m) => m[1]).sort().join(',');
out.fullDdl = { createView: /CREATE VIEW shop\.v_customer_orders AS/.test(dd) };
console.log(JSON.stringify(out, null, 1));
await B.close(); process.exit(0);
