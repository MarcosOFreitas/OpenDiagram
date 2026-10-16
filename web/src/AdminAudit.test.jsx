import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api.js', async (orig) => ({ ...(await orig()), api: vi.fn() }));
import { api } from './api.js';
import AdminAudit from './AdminAudit.jsx';

const FACETS = { actors: [{ id: 1, name: 'Ana' }, { id: 2, name: 'Ana' }, { id: 3, name: 'Bob' }], connections: [{ id: 'c1', name: 'Demo shop' }], diagrams: [{ id: 'd1aaaaaaaa', title: 'Shop' }, { id: 'd2bbbbbbbb', title: null }] };
const ROWS = [{ id: 5, at: 1_700_000_000, actor: 'Ana', action: 'connection.import', target: 'Demo shop', diagramId: 'd1aaaaaaaa', ok: true, detail: '4 tables' }, { id: 4, at: 1_700_000_000, actor: null, action: 'admin.delete', target: '/groups/3', ok: false }];
const lastAudit = () => { const c = api.mock.calls.map((x) => x[0]).filter((p) => p.startsWith('admin/audit?')); return new URLSearchParams(c[c.length - 1].split('?')[1]); };
const setup = async (kind = 'access') => {
  api.mockImplementation(async (p) => (p === 'admin/audit/facets' ? FACETS : ROWS));
  const user = userEvent.setup(), setErr = vi.fn();
  render(<AdminAudit kind={kind} setErr={setErr} />);
  await screen.findByText('4 tables');
  return { user, setErr };
};
beforeEach(() => { api.mockReset(); }); // not returned: vitest would run a returned function as teardown

describe('AdminAudit', () => {
  test('loads the rows and labels the operation; a failed one is marked', async () => {
    await setup();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Imported')).toBeTruthy();
    expect(table.getByText('Deleted')).toBeTruthy();
    expect(table.getByText('failed')).toBeTruthy();
    expect(lastAudit().get('limit')).toBe('100');
    expect(screen.queryByText('Clear filters')).toBeNull();
  });
  test('people with the same name are told apart by id', async () => {
    await setup();
    const opts = [...screen.getByLabelText('Done by').querySelectorAll('option')].map((o) => o.textContent);
    expect(opts).toEqual(['Done by: everybody', 'Ana (#1)', 'Ana (#2)', 'Bob']);
  });
  test('each tab asks for its own kinds of event, and offers its own targets and types', async () => {
    await setup('access');
    expect(lastAudit().get('action')).toBe('auth,connection');
    const t = screen.getByLabelText('Target');
    expect([...t.querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['Databases', 'Diagrams']);
    expect(t.textContent).toContain('d2bbbbbb (deleted)');
    expect([...screen.getByLabelText('Type of operation').querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['Sign-in and accounts', 'Shared-connection use']);
    expect(screen.queryByText('Clear filters')).toBeNull(); // the tab's own kinds are not a filter
  });
  test('the changes tab asks for administrator actions and offers the administration areas', async () => {
    api.mockReset();
    await setup('changes');
    expect(lastAudit().get('action')).toBe('admin');
    expect([...screen.getByLabelText('Target').querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['Databases', 'Administration']);
    expect([...screen.getByLabelText('Type of operation').querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['Administrator actions']);
    await userEvent.setup().selectOptions(screen.getByLabelText('Type of operation'), 'admin.put,admin.patch');
    await waitFor(() => expect(lastAudit().get('action')).toBe('admin.put,admin.patch'));
  });
  test('sign-in events are labelled; a failed sign-in shows who tried', async () => {
    api.mockImplementation(async (p) => (p === 'admin/audit/facets' ? FACETS : [{ id: 9, at: 1_700_000_000, actor: null, action: 'auth.login_failed', target: 'x@example.com', ok: false, detail: 'invalid e-mail or password · Chrome on Windows · 1.2.3.4' }]));
    render(<AdminAudit kind="access" setErr={vi.fn()} />);
    expect(await screen.findByText('x@example.com')).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('Failed sign-in')).toBeTruthy();
  });
  test.each([
    ['Done by', '3', { actorId: '3' }],
    ['Target', 'connection:c1', { connectionId: 'c1' }],
    ['Target', 'diagram:d1aaaaaaaa', { diagramId: 'd1aaaaaaaa' }],
    ['Type of operation', 'auth.login_failed', { action: 'auth.login_failed' }],
  ])('%s = %s is sent to the server as %j', async (label, value, expected) => {
    const { user } = await setup();
    await user.selectOptions(screen.getByLabelText(label), value);
    await waitFor(() => expect(Object.fromEntries(lastAudit())).toMatchObject({ limit: '100', ...expected }));
  });
  test('free text is trimmed and sent; filters combine; Clear filters resets everything', async () => {
    const { user } = await setup();
    await user.selectOptions(screen.getByLabelText('Done by'), '1');
    await user.type(screen.getByPlaceholderText(/Search person/), '  timeout ');
    await waitFor(() => expect(Object.fromEntries(lastAudit())).toMatchObject({ actorId: '1', q: 'timeout' }));
    await user.click(screen.getByText('Clear filters'));
    await waitFor(() => expect([...lastAudit().keys()]).toEqual(['limit', 'action']));
    expect(screen.queryByText('Clear filters')).toBeNull();
  });
  test('the CSV link carries the same filters but no limit', async () => {
    const { user } = await setup('changes');
    await user.selectOptions(screen.getByLabelText('Target'), 'scope:groups');
    const a = screen.getByText('Download CSV');
    expect(a.getAttribute('href')).toBe('/api/admin/audit.csv?action=admin&scope=groups');
  });
  test('a full page offers Load more, which asks for the rows before the last one', async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ id: 200 - i, at: 1, actor: 'Ana', action: 'admin.post', target: '/users', ok: true }));
    api.mockImplementation(async (p) => (p === 'admin/audit/facets' ? FACETS : String(p).includes('before=') ? [] : page));
    const user = userEvent.setup();
    render(<AdminAudit setErr={vi.fn()} />);
    await user.click(await screen.findByText('Load more'));
    await waitFor(() => expect(lastAudit().get('before')).toBe('101'));
    await waitFor(() => expect(screen.queryByText('Load more')).toBeNull());
  });
  test('nothing found says so', async () => {
    api.mockImplementation(async (p) => (p === 'admin/audit/facets' ? FACETS : []));
    render(<AdminAudit setErr={vi.fn()} />);
    expect(await screen.findByText('Nothing recorded for this filter.')).toBeTruthy();
  });
  test('a server error goes to setErr', async () => {
    api.mockImplementation(() => Promise.reject(new Error('forbidden')));
    const setErr = vi.fn();
    render(<AdminAudit setErr={setErr} />);
    await waitFor(() => expect(setErr).toHaveBeenCalledWith('forbidden'));
  });
});
