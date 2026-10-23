// Visual regression for refactors: screenshots of static screens (no timestamps, no random ids), then a pixel comparison.
//   BASE=http://localhost:3110 SNAP_EMAIL=... SNAP_PASSWORD=... node tools/visualsnap.mjs snap <outDir>
//   node tools/visualsnap.mjs compare <dirA> <dirB>      # exit 1 when any screen differs
// Run `snap` against a THROW-AWAY instance (it creates a diagram), once on the old build and once on the new one, both on a
// fresh instance with the same administrator, so the screens are comparable. Motion is forced to "reduce" so nothing is mid-animation.
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const [mode, a, b] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://localhost:3110';

if (mode === 'compare') {
  const B = await launch({ port: 9561 });
  const files = readdirSync(a).filter((f) => f.endsWith('.png')).sort();
  let bad = 0;
  for (const f of files) {
    let other; try { other = readFileSync(join(b, f)); } catch { console.log(`MISSING ${f}`); bad++; continue; }
    const mine = readFileSync(join(a, f));
    if (Buffer.compare(mine, other) === 0) { console.log(`same      ${f}`); continue; }
    const n = await B.ev(`(async () => { const load = (b64) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });
      const [x, y] = await Promise.all([load(${JSON.stringify(mine.toString('base64'))}), load(${JSON.stringify(other.toString('base64'))})]);
      if (x.width !== y.width || x.height !== y.height) return -1;
      const c = (i) => { const k = document.createElement('canvas'); k.width = i.width; k.height = i.height; const g = k.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
      const p = c(x), q = c(y); let d = 0; for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 12) d++; return d; })()`);
    console.log(`DIFFERENT ${f}  ${n < 0 ? 'size changed' : n + ' pixels'}`); bad++;
  }
  await B.close();
  console.log(bad ? `${bad} screen(s) differ` : 'all screens identical');
  process.exit(bad ? 1 : 0);
}

const EMAIL = process.env.SNAP_EMAIL, PASS = process.env.SNAP_PASSWORD;
if (mode !== 'snap' || !a || !EMAIL || !PASS) { console.error('usage: see the header of the file'); process.exit(2); }
if (/localhost:3000/.test(BASE)) { console.error('refusing to run against :3000'); process.exit(2); }
mkdirSync(a, { recursive: true });
const { TEMPLATES } = await import('../web/src/templates.js');

let cookie = '';
const api = async (method, path, body) => { const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const s = r.headers.get('set-cookie'); if (s) cookie = s.split(';')[0]; const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}`); return j; };
await api('POST', '/api/auth/login', { email: EMAIL, password: PASS });
const id = (await api('POST', '/api/diagrams', { title: 'Online store - sample', dbml: TEMPLATES[0].dbml })).id;

const B = await launch({ port: 9562 });
const { ev, cdp, viewport } = B;
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs = []; addEventListener('error', (e) => __errs.push(e.message)); addEventListener('unhandledrejection', (e) => __errs.push('rejection: ' + e.reason)); const ce = console.error; console.error = (...x) => { __errs.push(x.map(String).join(' ').slice(0, 200)); ce(...x); };` }); // JavaScript errors of every screen are reported
let jsErrors = 0;
const HELP = `window.H = { w: (ms) => new Promise((r) => setTimeout(r, ms)),
  btn: (t, root = document) => [...root.querySelectorAll('button,a,summary')].find((x) => x.textContent.trim().startsWith(t)),
  click: async (t, root = document) => { const b = window.H.btn(t, root); if (!b) throw new Error('no button: ' + t); b.click(); await window.H.w(450); },
  more: async (item) => { await window.H.click('More', document.querySelector('header.top')); await window.H.click(item, document.querySelector('.menu-pop')); await window.H.w(500); },
  account: async (item) => { [...document.querySelectorAll('header.top .menu > .tbtn')].pop().click(); await window.H.w(300); await window.H.click(item, document.querySelector('.menu-pop')); await window.H.w(500); } };`;
const go = async (path, { auth = true, theme = 'light', local = {} } = {}) => {
  await cdp('Network.clearBrowserCookies'); await cdp('Page.navigate', { url: BASE + '/' }); await sleep(500);
  await ev(`(async () => { localStorage.clear(); ${auth ? `await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(EMAIL)}, password: ${JSON.stringify(PASS)} }) });` : ''} localStorage.setItem('view', JSON.stringify({ theme: ${JSON.stringify(theme)}, grid: true })); localStorage.setItem('lastDiagram', ${JSON.stringify(id)}); localStorage.setItem('tablesPanel', '0'); for (const [k, v] of Object.entries(${JSON.stringify(local)})) localStorage.setItem(k, v); })()`);
  await cdp('Page.navigate', { url: BASE + path }); await sleep(2600); await ev(HELP);
};
const shot = async (name) => { await sleep(500); const errs = await ev('window.__errs || []'); if (errs.length) { jsErrors++; console.log(`   !! ${name}: ${errs.length} JavaScript error(s): ${errs[0]}`); } await ev('document.activeElement && document.activeElement.blur()'); const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(a, `${name}.png`), Buffer.from(data, 'base64')); console.log('  ', name); };
const S = [
  ['login', () => go('/', { auth: false }), 'desktop'],
  ['main', () => go('/'), 'desktop'], ['main-dark', () => go('/', { theme: 'dark' }), 'desktop'], ['main-phone', () => go('/'), 'phone'],
  ['menu-more', async () => { await go('/'); await ev(`H.click('More', H.btn('More').closest('header'))`); }, 'desktop'],
  ['menu-export', async () => { await go('/'); await ev(`H.click('Export', document.querySelector('header.top'))`); }, 'desktop'],
  ['menu-account', async () => { await go('/'); await ev(`(async () => { [...document.querySelectorAll('header.top .menu > .tbtn')].pop().click(); await H.w(300); })()`); }, 'desktop'],
  ['drawer-view', async () => { await go('/'); await ev(`H.more('View')`); }, 'desktop'],
  ['drawer-import', async () => { await go('/'); await ev(`H.more('Import')`); }, 'desktop'],
  ['drawer-database', async () => { await go('/'); await ev(`H.more('Database')`); }, 'desktop'],
  ['share', async () => { await go('/'); await ev(`H.click('Share', document.querySelector('header.top'))`); }, 'desktop'],
  ['tables-panel', () => go('/', { local: { tablesPanel: '1' } }), 'desktop'],
  ['arrange-popover', async () => { await go('/'); await ev(`document.querySelector('.algo-toggle').click(); H.w(300)`); }, 'desktop'],
  ['docs-view', async () => { await go('/'); await ev(`H.click('Docs', document.querySelector('.mode'))`); }, 'desktop'],
  ['docs-view-dark', async () => { await go('/', { theme: 'dark' }); await ev(`H.click('Docs', document.querySelector('.mode'))`); }, 'desktop'],
  ['admin-users', async () => { await go('/'); await ev(`(async () => { await H.account('Administration'); })()`); }, 'desktop'],
  ['admin-settings', async () => { await go('/'); await ev(`(async () => { await H.account('Administration'); await H.click('Settings', document.querySelector('.admin-head .dtabs')); })()`); }, 'desktop'],
  ['admin-connections-form', async () => { await go('/'); await ev(`(async () => { await H.account('Administration'); await H.click('Connections', document.querySelector('.admin-head .dtabs')); await H.click('+ Register', document.querySelector('.admin-body')); })()`); }, 'desktop'],
  ['drawer-database-tested', async () => { await go('/'); await ev(`(async () => { await H.more('Database'); const f = (p) => document.querySelector('.drawer [placeholder^="' + p + '"]'); const set = (el, v) => { const pr = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(pr, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }; set(f('Host'), 'demo-pg'); set(f('Port'), '5432'); set(f('Database'), 'demo'); set(f('User'), 'reader'); set(f('Password'), 'reader'); await H.w(200); await H.click('Test connection', document.querySelector('.drawer')); await H.w(2500); const c = [...document.querySelectorAll('.drawer .schemas input[type=checkbox]')].find((x) => /shop/.test(x.closest('label,div').textContent)); c && c.click(); await H.w(300); })()`); }, 'desktop'],
  ['table-picker', async () => { await go('/'); await ev(`(async () => { await H.more('Database'); const f = (p) => document.querySelector('.drawer [placeholder^="' + p + '"]'); const set = (el, v) => { const pr = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(pr, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }; set(f('Host'), 'demo-pg'); set(f('Port'), '5432'); set(f('Database'), 'demo'); set(f('User'), 'reader'); set(f('Password'), 'reader'); await H.w(200); await H.click('Test connection', document.querySelector('.drawer')); await H.w(2500); const c = [...document.querySelectorAll('.drawer .schemas input[type=checkbox]')].find((x) => /shop/.test(x.closest('label,div').textContent)); c && c.click(); await H.w(300); await H.click('All tables', document.querySelector('.drawer')); await H.w(1500); })()`); }, 'desktop'],
  ['table-picker-groups', async () => { await go('/'); await ev(`(async () => { await H.more('Database'); const f = (p) => document.querySelector('.drawer [placeholder^="' + p + '"]'); const set = (el, v) => { const pr = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(pr, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }; set(f('Host'), 'demo-pg'); set(f('Port'), '5432'); set(f('Database'), 'demo'); set(f('User'), 'reader'); set(f('Password'), 'reader'); await H.w(200); await H.click('Test connection', document.querySelector('.drawer')); await H.w(2500); const c = [...document.querySelectorAll('.drawer .schemas input[type=checkbox]')].find((x) => /shop/.test(x.closest('label,div').textContent)); c && c.click(); await H.w(300); await H.click('All tables', document.querySelector('.drawer')); await H.w(1500); await H.click('Groups', document.querySelector('.admin-card.tp .dtabs')); await H.w(600); })()`); }, 'desktop'],
  ['tables-panel-filters', async () => { await go('/', { local: { tablesPanel: '1' } }); await ev(`(async () => { [...document.querySelectorAll('.tpn .tpn-ic')].find((x) => /filter/i.test(x.title || x.getAttribute('aria-label') || ''))?.click(); await H.w(400); })()`); }, 'desktop'],
  ['docsite', () => go('/docs/dbml', { auth: false }), 'desktop'],
];
for (const [name, fn, vp] of S) { await viewport(...(vp === 'phone' ? [375, 812, true] : [1280, 800])); await fn(); await shot(name); }
await B.close();
if (jsErrors) console.log(`${jsErrors} screen(s) with JavaScript errors`);
process.exit(jsErrors ? 1 : 0);
