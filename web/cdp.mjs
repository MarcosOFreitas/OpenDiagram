// Minimal Chrome DevTools Protocol driver (headless Chrome, no dependencies) shared by the UI tools in web/.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CANDIDATES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
import { existsSync } from 'node:fs';

export async function launch({ port = 9444, width = 1280, height = 800, focus = true } = {}) {
  const bin = CANDIDATES.find((p) => existsSync(p));
  if (!bin) throw new Error('Chrome not found; set CHROME=/path/to/chrome');
  const profile = mkdtempSync(join(tmpdir(), 'od-cdp-'));
  const proc = spawn(bin, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--disable-gpu', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) { await sleep(300); try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ } }
  if (!wsUrl) throw new Error('Chrome did not start');
  const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r));
  let seq = 0; const waiting = new Map(); const dialogs = [];
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } else if (d.method === 'Page.javascriptDialogOpening') { dialogs.push(d.params); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); } });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; const t = setTimeout(() => { waiting.delete(id); rej(new Error(`${method}: timed out after 30s`)); }, 30000); waiting.set(id, (d) => { clearTimeout(t); d.error ? rej(new Error(`${method}: ${d.error.message}`)) : res(d.result); }); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  if (focus) await cdp('Emulation.setFocusEmulationEnabled', { enabled: true }); // the page has focus, so focus handling can be tested for real (screenshots tools pass focus: false: no focus rings)
  const viewport = (w, h, mobile = false) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await viewport(width, height);
  const key = async (k, mods = 0) => { const code = { Tab: 9, Enter: 13, Escape: 27 }[k]; for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: code, modifiers: mods }); };
  const close = async () => { try { ws.close(); } catch { /* closed */ } proc.kill(); await sleep(400); try { rmSync(profile, { recursive: true, force: true }); } catch { /* still held */ } };
  return { cdp, ev, viewport, key, dialogs, close };
}
