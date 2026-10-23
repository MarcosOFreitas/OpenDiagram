// Docs view links: real mouse clicks on index entries (first, middle and last table, every enum, back to the first) and on a link inside
// the content, and where each target lands in the content pane. 16 = the right place; an entry near the end of the page stops where the
// page ends (marked "page end"). Use a big diagram (the sections far from the screen are laid out late, content-visibility): tools/stressdbml.mjs 200.
// Run it against a THROW-AWAY instance; CDP_GUI=1 for a real window. Exits 1 if a link lands anywhere else.
//   node tools/docsjump.mjs <base> <email> <password> <diagramId>
import { launch, sleep } from './cdp.mjs';

const [base, email, pass, id] = process.argv.slice(2);
const B = await launch({ width: 1440, height: 900, port: 9473 });
const { cdp, ev } = B;
await cdp('Page.navigate', { url: base + '/' }); await sleep(800);
await ev(`fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(pass)} }) }).then((r) => r.status)`);
await ev(`localStorage.setItem('lastDiagram', ${JSON.stringify(id)}); localStorage.setItem('tablesPanel', '0'); true`);
await cdp('Page.navigate', { url: base + '/' }); await sleep(5000);
await ev(`[...document.querySelectorAll('.mode button')].find((b) => /Docs/.test(b.textContent)).click(); true`); await sleep(2000);
const click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const picks = await ev(`(() => { const nav = [...document.querySelectorAll('.dx-nav a')].filter((a) => (a.getAttribute('href') || '').startsWith('#t_') && !/enum/.test(a.getAttribute('href'))); const en = [...document.querySelectorAll('.dx-nav a')].filter((a) => /enum/.test(a.getAttribute('href'))); return [['first table', nav[2]], ['middle table', nav[Math.floor(nav.length / 2)]], ['last table', nav[nav.length - 1]], ...en.map((a) => ['enum ' + a.textContent, a])].map(([k, a]) => [k, a.getAttribute('href'), a.textContent.trim()]); })()`);
// where the target is in the content pane, and "(page end)" when the pane cannot scroll further (an entry near the end stops there)
const LANDS = (href) => `(() => { const m = document.querySelector('.dx-main'); const top = Math.round(document.querySelector('${href}').getBoundingClientRect().top - m.getBoundingClientRect().top); return top + (m.scrollTop >= m.scrollHeight - m.clientHeight - 2 ? ' (page end)' : ''); })()`;
const out = [];
for (const [label, href, text] of [...picks, ['first table again (from the end)', picks[0][1], picks[0][2]]]) {
  const pos = await ev(`(() => { const a = document.querySelector('.dx-nav a[href="${href}"]'); a.scrollIntoView({ block: 'center' }); const r = a.getBoundingClientRect(); return [r.left + 20, r.top + r.height / 2]; })()`);
  await sleep(200); await click(pos[0], pos[1]); await sleep(1800);
  out.push(`${label} (${text}): lands at ${await ev(LANDS(href))}`);
}
// an in-content link ("Referenced by" style): the first link inside the content that points to a table far below
const inner = await ev(`(() => { const main = document.querySelector('.dx-main'); main.scrollTop = 0; const links = [...main.querySelectorAll('a[href^="#t_"]')]; const a = links.find((x) => document.querySelector(x.getAttribute('href')).getBoundingClientRect().top > 8000); if (!a) return null; a.scrollIntoView({ block: 'center' }); const r = a.getBoundingClientRect(); return [r.left + 5, r.top + r.height / 2, a.getAttribute('href')]; })()`);
if (inner) { await sleep(300); await click(inner[0], inner[1]); await sleep(1800); out.push(`in-content link to ${inner[2]}: lands at ${await ev(LANDS(inner[2]))}`); }
console.log(out.join('\n'));
await B.close();
const bad = out.filter((l) => !/lands at 1[5-7]$/.test(l) && !/\(page end\)$/.test(l)); // at the top of the pane, or the pane cannot scroll further
if (bad.length) { console.error(`FAIL: ${bad.join('; ')}`); process.exit(1); }
