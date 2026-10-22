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
