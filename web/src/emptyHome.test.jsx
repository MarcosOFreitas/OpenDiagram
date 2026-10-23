import { test, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.jsx';

// the API as a map of "METHOD path" -> JSON; any other GET answers [] and every call is recorded
const calls = [];
const mockApi = (routes) => vi.stubGlobal('fetch', vi.fn(async (url, opt = {}) => {
  const key = `${opt.method || 'GET'} ${String(url).replace(/^\/api\//, '')}`;
  calls.push(key);
  return { ok: true, status: 200, json: async () => routes[key] ?? (key.startsWith('GET') ? [] : {}) };
}));
afterEach(() => { vi.unstubAllGlobals(); calls.length = 0; });

test('an account without diagrams gets the create options; no sample is created behind its back', async () => {
  mockApi({ 'GET auth/me': { user: { id: 1, name: 'Ana', email: 'ana@example.com', role: 'member' }, org: '', groups: [] } });
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'No diagrams yet' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /New blank diagram/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Online store — sample/ })).toBeTruthy();
  expect(screen.getByTitle('Ana · ana@example.com')).toBeTruthy(); // the account menu stays reachable (sign out)
  expect(calls.filter((c) => c.startsWith('POST diagrams'))).toEqual([]);
});

test('with no diagram open, Account & password still opens: the password, the recovery key and the sessions, then back to the create options', async () => {
  mockApi({ 'GET auth/me': { user: { id: 1, name: 'Ana', email: 'ana@example.com', role: 'member' }, org: '', groups: [] } });
  const { default: userEvent } = await import('@testing-library/user-event');
  const user = userEvent.setup({ delay: null });
  render(<App />);
  await screen.findByRole('heading', { name: 'No diagrams yet' });
  await user.click(screen.getByTitle('Ana · ana@example.com'));
  await user.click(screen.getByRole('menuitem', { name: /Account & password/ }));
  expect(await screen.findByRole('heading', { name: 'Change password' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'No diagrams yet' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(await screen.findByRole('heading', { name: 'No diagrams yet' })).toBeTruthy();
});
