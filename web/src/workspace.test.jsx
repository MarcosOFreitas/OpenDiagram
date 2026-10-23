import { test, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';

// The Workspace with a stubbed API: autosave, the edit-conflict dialog, deleting the open diagram.
// Routes: "METHOD path" -> JSON, or a function (body) -> JSON / { status, json } for an error; other GETs answer [] and every call is recorded.
beforeAll(() => { globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }; }); // React Flow measures nodes with it; jsdom has none
const calls = [];
const mockApi = (routes) => vi.stubGlobal('fetch', vi.fn(async (url, opt = {}) => {
  const key = `${opt.method || 'GET'} ${String(url).replace(/^\/api\//, '')}`, body = opt.body ? JSON.parse(opt.body) : undefined;
  calls.push({ key, body });
  let out = typeof routes[key] === 'function' ? routes[key](body) : routes[key];
  if (out === undefined) out = key.startsWith('GET') ? [] : {};
  const err = out && out.status >= 400;
  return { ok: !err, status: err ? out.status : 200, statusText: '', json: async () => (err ? out.json : out) };
}));
afterEach(() => { vi.unstubAllGlobals(); calls.length = 0; localStorage.clear(); });

const ana = { user: { id: 1, name: 'Ana', email: 'ana@example.com', role: 'member' }, org: '', groups: [] };
const doc = { id: 'd1', title: 'Shop', dbml: 'Table a {\n  id int\n}\n', layout: {}, source: null, role: 'owner', version: 4 };
const base = (more = {}) => ({ 'GET auth/me': ana, 'GET diagrams': [{ id: 'd1', title: 'Shop', role: 'owner', updatedAt: 1 }], 'GET diagrams/d1': doc, 'POST diagrams/d1/presence': { viewers: [], version: 4 }, ...more });
const titleField = () => screen.findByRole('textbox', { name: 'diagram title' });

test('the owner\'s change is saved after a pause: title, DBML, link and layout, with the version it was based on', async () => {
  mockApi(base({ 'PUT diagrams/d1': { ok: true, version: 5 } }));
  render(<App />);
  const title = await titleField();
  await waitFor(() => expect(title.value).toBe('Shop'));
  fireEvent.change(title, { target: { value: 'Shop v2' } });
  await waitFor(() => expect(calls.some((c) => c.key === 'PUT diagrams/d1')).toBe(true), { timeout: 3000 });
  const put = calls.find((c) => c.key === 'PUT diagrams/d1').body;
  expect(put).toMatchObject({ title: 'Shop v2', dbml: doc.dbml, source: null, baseVersion: 4 });
  expect(await screen.findByText('Saved')).toBeTruthy();
});

test('someone else saved first (409): autosave stops and the conflict dialog says who', async () => {
  mockApi(base({
    'PUT diagrams/d1': { status: 409, json: { error: 'stale', code: 'conflict', version: 6 } },
    'GET diagrams/d1/versions': [{ id: 9, version: 6, author: 'Bob', savedAt: Math.floor(Date.now() / 1000) }],
  }));
  render(<App />);
  const title = await titleField();
  await waitFor(() => expect(title.value).toBe('Shop'));
  fireEvent.change(title, { target: { value: 'Mine' } });
  const dialog = await screen.findByRole('alertdialog', { name: 'Edit conflict' }, { timeout: 3000 });
  expect(dialog.textContent).toMatch(/Bob saved version 6/);
  expect(screen.getByRole('button', { name: /Keep my changes/ })).toBeTruthy();
  const puts = calls.filter((c) => c.key === 'PUT diagrams/d1').length;
  fireEvent.change(title, { target: { value: 'Mine again' } });
  await new Promise((r) => setTimeout(r, 1200));
  expect(calls.filter((c) => c.key === 'PUT diagrams/d1').length).toBe(puts); // nothing more is sent until the person chooses
});

test('deleting the open diagram when it was the only one leads to the create options, not to a new sample', async () => {
  let left = [{ id: 'd1', title: 'Shop', role: 'owner', updatedAt: 1 }];
  mockApi(base({ 'GET diagrams': () => left, 'DELETE diagrams/d1': () => { left = []; return { ok: true }; } }));
  const user = userEvent.setup({ delay: null });
  render(<App />);
  await titleField();
  await user.click(screen.getByRole('button', { name: /^More/ }));
  await user.click(screen.getByRole('menuitem', { name: /Diagrams/ }));
  await user.click(await screen.findByRole('button', { name: 'Delete Shop' }));
  await user.click(screen.getByRole('button', { name: 'Yes, delete Shop' }));
  expect(await screen.findByRole('heading', { name: 'No diagrams yet' })).toBeTruthy();
  expect(calls.filter((c) => c.key === 'POST diagrams')).toEqual([]);
});

test('"changed since you last opened it": opening a diagram puts its badge out at once, and the Diagrams drawer loads the list again (.specs/09)', async () => {
  const change = { summary: 'Refresh from database: 1 table added', author: 'Scheduled refresh', at: 1, count: 1 };
  const first = [{ id: 'd1', title: 'Shop', role: 'owner', updatedAt: 1, unseen: true, lastChange: change }, { id: 'd2', title: 'Stock', role: 'owner', updatedAt: 1, unseen: true, lastChange: change }];
  let later = new Promise(() => {}); // the list loaded again when the drawer opens: held back first
  const lists = [first];
  mockApi(base({ 'GET diagrams': () => lists.shift() ?? later }));
  const user = userEvent.setup({ delay: null });
  render(<App />);
  await titleField();
  await user.click(screen.getByRole('button', { name: /^More/ }));
  await user.click(screen.getByRole('menuitem', { name: /Diagrams/ }));
  expect((await screen.findByRole('button', { name: /^Shop/ })).textContent).not.toMatch(/Changed since/); // opened when the app started
  expect(screen.getByRole('button', { name: /^Stock/ }).textContent).toMatch(/Changed since you last opened it/);
  expect(calls.filter((c) => c.key === 'GET diagrams').length).toBe(2);
  await user.keyboard('{Escape}');
  later = [...first.map((d) => ({ ...d, unseen: false, lastChange: undefined })), { id: 'd3', title: 'Shared just now', role: 'view', ownerName: 'Bo', updatedAt: 1, unseen: false }];
  await user.click(screen.getByRole('button', { name: /^More/ }));
  await user.click(screen.getByRole('menuitem', { name: /Diagrams/ }));
  expect(await screen.findByRole('button', { name: /^Shared just now/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Stock/ }).textContent).not.toMatch(/Changed since/);
});
