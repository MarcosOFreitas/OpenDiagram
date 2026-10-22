// Retakes the pictures of the documentation site (web/src/docsite/img/*.jpg) with headless Chrome (CDP, no dependencies).
//
// It builds its own fixtures (accounts, a sample diagram, a shared connection, versions, presence), so run it against a
// THROW-AWAY instance, never against one that holds real diagrams or accounts (the pictures must not show anyone's data):
//   docker build -t opendiagram-shots . && docker run -d --name shots-app --network opendiagram_default -p 3100:3000 -e APP_SECRET=$(openssl rand -hex 24) opendiagram-shots
//   docker exec shots-app node src/cli.js create-admin docs@example.com 'docs-shots-password-1'
//   BASE=http://localhost:3100 SHOTS_EMAIL=docs@example.com SHOTS_PASSWORD=docs-shots-password-1 node web/docshots.mjs [only-name ...]
// The demo PostgreSQL (`demo-pg`, docker compose up -d) must be reachable from the app container.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';
import { Api, seedTeam } from './fixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'src/docsite/img');
const BASE = process.env.BASE || 'http://localhost:3100';
const EMAIL = process.env.SHOTS_EMAIL, PASS = process.env.SHOTS_PASSWORD;
const W = 1100, H = 700, ONLY = process.argv.slice(2);
if (!EMAIL || !PASS) { console.error('set SHOTS_EMAIL and SHOTS_PASSWORD (an administrator of the throw-away instance)'); process.exit(2); }
if (/localhost:3000/.test(BASE)) { console.error('refusing to run against :3000 (your working instance); use a throw-away one, see the header'); process.exit(2); }
const { TEMPLATES } = await import('./src/templates.js');
const SAMPLE = TEMPLATES[0].dbml;

// ---------- fixtures (API)
const admin = new Api(BASE);
await admin.call('POST', '/api/auth/login', { email: EMAIL, password: PASS });
const me = (await admin.call('GET', '/api/auth/me')).user;
if (me.role !== 'admin') throw new Error('the account must be an administrator');
if ((await admin.call('GET', '/api/admin/users')).length > 1 || (await admin.call('GET', '/api/diagrams')).length) console.warn('warning: the instance is not empty; the pictures may show other data');
await admin.call('PATCH', `/api/admin/users/${me.id}`, { name: 'Alex Morgan' }).catch(() => {});
const base = SAMPLE.replace('  phone varchar(30)\n', '  phone varchar(30)\n  birth_date date\n');
const { maya, shop, lin } = await seedTeam({ base: BASE, admin, sample: SAMPLE, mayaPass: 'Maya-shots-pass-1',
  lineageExtra: "\n\nNote note_1 {\n  'Views are drawn with dashed arrows from the tables they read.'\n}\n", // a sticky note for the lineage picture
  versions: [[base, 'Added customer birth date'], [base.replace('  is_default boolean', '  country char(2)\n  is_default boolean'), 'Country on addresses']] });
await admin.call('POST', `/api/diagrams/${shop}/shares`, { access: 'view' });
await admin.call('PUT', '/api/admin/settings', { allowAgents: true });
const bot = await admin.call('POST', '/api/admin/agents', { name: 'Claude of the data team' }); // for the Agents picture: one agent with a token and a share
await admin.call('POST', `/api/admin/agents/${bot.id}/tokens`, { name: 'laptop', expiresInDays: 90 });
await admin.call('POST', `/api/diagrams/${shop}/access`, { type: 'user', subjectId: bot.id, access: 'comment' });
console.log(`fixtures ready (diagrams ${shop.slice(0, 8)}, ${lin.slice(0, 8)})`);

// ---------- Chrome over CDP
const B = await launch({ port: 9333, width: W, height: H, focus: false });
const { cdp, ev } = B;

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
  if (want('detail-levels')) { await go('/', { ...dg, tablesPanel: '1', panelTab: 'display' }); await ev(`(async () => { const b = H.btn('Keys', document.querySelector('.tpn-display')); b && b.click(); await H.w(500); })()`); await shot('detail-levels'); }
  if (want('docs-view')) { await go('/', dg); await ev(`H.click('Docs', document.querySelector('.mode'))`); await sleep(1000); await shot('docs-view'); }
  if (want('docs-changelog')) {
    await go('/', dg); await ev(`H.click('Docs', document.querySelector('.mode'))`); await sleep(800);
    await ev(`(async () => { await H.click('Changelog', document.querySelector('.dx-nav')); await H.w(700); })()`);
    await shot('docs-changelog');
  }
  if (want('share-panel')) { await go('/', dg); await ev(`H.click('Share', document.querySelector('header.top'))`); await sleep(500); await shot('share-panel'); }
  if (want('history-drawer')) { await go('/', dg); await ev(`H.more('History')`); await sleep(900); await shot('history-drawer'); }
  if (want('history-compare')) { // the oldest version against now: the structure (columns added) above the text diff
    await go('/', dg); await ev(`(async () => { await H.more('History'); await H.w(600); const b = [...document.querySelector('.drawer.open').querySelectorAll('button')].filter((x) => x.textContent === 'Compare').pop(); b.click(); await H.w(900); })()`); await shot('history-compare');
  }
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
      await ev(`(async () => { await H.click('Sign-ins', document.querySelector('.admin-head .dtabs')); await H.w(700); const s = document.querySelector('.audit-bar select[aria-label="Type of operation"]'); H.set(s, 'connection'); await H.w(900); })()`);
      await shot('admin-audit');
    }
  }
  if (want('account-panel')) { await go('/', dg); await ev(`(async () => { const m = [...document.querySelectorAll('header.top .menu > .tbtn')].pop(); m.click(); await H.w(300); await H.click('Account', document.querySelector('.menu-pop')); await H.w(1200); })()`); await shot('account-panel'); }
  if (want('admin-groups') || want('admin-agents') || want('admin-settings')) {
    await go('/', dg);
    await ev(`(async () => { document.querySelector('.menu .tbtn.user, header.top .menu:last-child .tbtn').click(); await H.w(300); await H.click('Administration', document.querySelector('.menu-pop')); await H.w(500); })()`);
    for (const [name, tab] of [['admin-groups', 'Groups'], ['admin-agents', 'Agents'], ['admin-settings', 'Settings']]) if (want(name)) { await ev(`H.click(${JSON.stringify(tab)}, document.querySelector('.admin-head .dtabs'))`); await sleep(1100); await shot(name); }
  }
  if (want('lineage-notes-presence')) {
    await go('/', { lastDiagram: lin, tablesPanel: '0' }); await wide();
    const beat = setInterval(() => pulse(lin, { sel: 'shop.customers' }), 4000); await pulse(lin, { sel: 'shop.customers' });
    await sleep(5500);
    await shot('lineage-notes-presence'); clearInterval(beat);
  }
} finally {
  await B.close();
}
console.log('done; review every picture before committing (no personal data, nothing cut off)');
process.exit(0);
