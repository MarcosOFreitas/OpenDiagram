// Browser-side cost of a diagram for the "Hosting requirements" page: time until every table is drawn and the JavaScript heap, for several sizes.
// Run it against a THROW-AWAY instance (it creates an account's diagrams), same setup as server/bench.mjs:
//   BASE=http://localhost:3200 BENCH_EMAIL=bench@example.com BENCH_PASSWORD=bench-password-123 node web/benchclient.mjs
// MODEL=stress SIZES=50,75,100,200 measures the realistic schema of stressdbml.mjs instead of the chain of plain tables (the default, the
// one the Hosting requirements page quotes), and adds opening the Docs view and (in Node, no browser) the parse and every Arrange algorithm.
import { launch, sleep } from './cdp.mjs';
import { stressDbml } from './stressdbml.mjs';
import { parse } from './src/diagramModel.js';
import { layout } from './src/layout.js';

const BASE = process.env.BASE || 'http://localhost:3200', EMAIL = process.env.BENCH_EMAIL, PASS = process.env.BENCH_PASSWORD;
if (!EMAIL || !PASS) { console.error('set BENCH_EMAIL and BENCH_PASSWORD'); process.exit(2); }
if (/:3000\b/.test(BASE)) { console.error('refusing to run against :3000'); process.exit(2); }

let cookie = '';
const api = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
  return r.json();
};
const STRESS = process.env.MODEL === 'stress';
const SIZES = (process.env.SIZES || '38,100,200,400').split(',').map(Number);
const chain = (n) => Array.from({ length: n }, (_, i) => `Table shop.t_${i} {\n  id integer [pk, increment]\n${Array.from({ length: 10 }, (_, c) => `  col_${c} varchar(80)`).join('\n')}\n  parent_id integer\n}\n${i ? `Ref: shop.t_${i}.parent_id > shop.t_${i - 1}.id\n` : ''}`).join('\n');

const dbml = (n) => (STRESS ? stressDbml(n) : chain(n));
const median = (f, times = 5) => { const a = []; for (let i = 0; i < times; i++) { const t = performance.now(); f(); a.push(performance.now() - t); } return +a.sort((x, y) => x - y)[times >> 1].toFixed(1); };

// ---- in Node: what the browser does on every change (parse) and on Arrange (each algorithm), without the rendering
const pure = SIZES.map((n) => {
  const text = dbml(n), p = parse(text);
  return { tables: n, kb: Math.round(text.length / 1024), parseMs: median(() => parse(text)), ...Object.fromEntries(['auto', 'lr', 'pipeline', 'snowflake', 'compact'].map((a) => [`arrange_${a}_ms`, median(() => layout(p.tables, p.refs, null, p.groups, a, p.lineage))])) };
});

await api('POST', '/api/auth/login', { email: EMAIL, password: PASS });
const B = await launch({ width: 1440, height: 900, port: 9455 });
const { cdp, ev } = B;
// React commits, counted through a minimal DevTools hook: an idle diagram must not keep rendering (a render loop once made 45 a second)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__commits = 0; window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; }, onCommitFiberRoot() { window.__commits++; }, onPostCommitFiberRoot() {}, onScheduleFiberRoot() {}, checkDCE() {} };' });
const rows = [];
for (const n of SIZES) {
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
  const c0 = await ev('window.__commits'); await sleep(2000); const idleCommits = ((await ev('window.__commits')) - c0) / 2; // nothing happens for 2 s
  // pan/zoom smoothness: frames drawn in 2 s while the viewport is zoomed in and out
  const fps = await ev(`(async () => { let f = 0; const t = performance.now(); const tick = () => { f++; if (performance.now() - t < 2000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); const z = document.querySelector('.react-flow__pane'); for (let i = 0; i < 20; i++) { z.dispatchEvent(new WheelEvent('wheel', { deltaY: i % 2 ? -120 : 120, ctrlKey: true, clientX: 700, clientY: 400, bubbles: true })); await new Promise((r) => setTimeout(r, 90)); } await new Promise((r) => setTimeout(r, 300)); return Math.round(f / 2); })()`);
  const row = { tables: n, columns: STRESS ? null : n * 12, drawnNodes: nodes, secondsToDraw: ms === null ? null : +(ms / 1000).toFixed(1), jsHeapMb: heap, idleReactCommitsPerSecond: idleCommits, framesPerSecondWhileZooming: fps };
  if (STRESS) {
    // (the delay from a keystroke to the diagram is not measured here: headless Chrome never commits the deferred parse; measure it in a
    // visible browser, see the stress results in .specs/14-release-v1.md)
    // the Docs view, until its last table is written
    row.openDocsMs = await ev(`(async () => { const t = performance.now(); [...document.querySelectorAll('.mode button')].find((b) => /Docs/.test(b.textContent)).click(); while (!document.querySelector('.dx-main')?.textContent.includes('_${n - 1}')) { if (performance.now() - t > 30000) return null; await new Promise((r) => requestAnimationFrame(r)); } return Math.round(performance.now() - t); })()`);
    row.jsHeapAfterMb = await ev(`Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576)`);
  }
  rows.push(row);
  await api('DELETE', `/api/diagrams/${id}`);
}
await B.close();
console.log(JSON.stringify({ node: pure, browser: rows }, null, 1));
