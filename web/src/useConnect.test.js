import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('./api.js', async (orig) => ({ ...(await orig()), api: vi.fn() }));
import { api } from './api.js';
import { useConnect, EMPTY } from './useConnect.js';

const PERSONAL = { id: 'p1', name: 'mine', type: 'postgres', host: 'h', port: 5432, database: 'd', user: 'u', schemas: ['shop'], tables: ['shop.a'], refreshMinutes: 0 };
const SHARED = { id: 's1', name: 'team db', type: 'postgres', host: 'h', port: 5432, database: 'd', user: '', shared: true, schemas: [], tables: [] };
let list, calls;
beforeEach(() => {
  list = [PERSONAL, SHARED];
  calls = () => api.mock.calls.map(([p, body, method]) => ({ p, body, method }));
  api.mockReset();
  api.mockImplementation(async (p, body) => {
    if (p === 'connections' && body === undefined) return list;
    if (p === 'connections') return { id: 'new-id' };
    if (p === 'schemas') return { schemas: ['shop', 'audit'], warnings: [] };
    if (p === 'tables') return { tables: [{ schema: 'shop', name: 'a', view: false }, { schema: 'shop', name: 'v', view: true }] };
    if (p === 'import') return { dbml: 'Table shop.a { id int }', tables: 1, refs: 0, warnings: ['careful'], at: 123 };
    return {};
  });
});

const setup = (over = {}) => {
  const props = { shared: false, notify: vi.fn(), docId: 'd1', source: null, setSource: vi.fn(), setBusy: vi.fn(), onImported: vi.fn(), reloadOn: [false, false], ...over };
  const hook = renderHook((p) => useConnect(p), { initialProps: props });
  return { ...hook, props };
};
const connListCalls = () => calls().filter((c) => c.p === 'connections' && c.body === undefined).length;

describe('connection list (regression: a connection registered elsewhere did not show up)', () => {
  test('loads on mount', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.conns).toHaveLength(2));
  });
  test('reloads when the Database drawer opens and when Administration closes', async () => {
    const { result, rerender, props } = setup();
    await waitFor(() => expect(result.current.conns).toHaveLength(2));
    const n = connListCalls();
    list = [PERSONAL, SHARED, { ...SHARED, id: 's2', name: 'granted later' }];
    rerender({ ...props, reloadOn: [true, false] }); // drawer opened
    await waitFor(() => expect(result.current.conns).toHaveLength(3));
    expect(connListCalls()).toBe(n + 1);
    rerender({ ...props, reloadOn: [true, true] }); // Administration opened
    rerender({ ...props, reloadOn: [true, false] }); // ... and closed
    await waitFor(() => expect(connListCalls()).toBeGreaterThan(n + 1));
  });
  test('a share-link visitor never asks for connections', async () => {
    const { result } = setup({ shared: true });
    await act(async () => {});
    expect(connListCalls()).toBe(0);
    expect(result.current.conns).toEqual([]);
  });
  test('a failing list reports through notify', async () => {
    api.mockRejectedValueOnce(new Error('down'));
    const { props } = setup();
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith('err', 'down'));
  });
});

describe('import (regression: a shared connection must be used as registered, never saved)', () => {
  const pickAndPrepare = async (result, conn, tables = []) => {
    await waitFor(() => expect(result.current.conns).toHaveLength(2));
    act(() => result.current.pick(conn));
    await act(async () => {}); // listSchemas for a connection without schemas
    act(() => { result.current.setPicked(['shop']); result.current.setTableSel(tables); });
  };
  test('shared: no POST connections, the import goes with the shared id, groups travel to onImported', async () => {
    const { result, props } = setup();
    await pickAndPrepare(result, SHARED, ['shop.a']);
    act(() => result.current.setTableGroups([{ name: 'G', tables: ['shop.a'] }]));
    await act(() => result.current.importNow());
    const sent = calls();
    expect(sent.filter((c) => c.p === 'connections' && c.body !== undefined)).toEqual([]);
    expect(sent.find((c) => c.p === 'import').body).toEqual({ id: 's1', schemas: ['shop'], tables: ['shop.a'], ddl: false });
    expect(props.onImported).toHaveBeenCalledWith(expect.objectContaining({ tables: 1 }), { connId: 's1', schemas: ['shop'], tables: ['shop.a'], ddl: false, at: 123 }, [{ name: 'G', tables: ['shop.a'] }]);
    expect(result.current.warnings).toEqual(['careful']);
  });
  test('personal: saved first with the chosen schemas and tables, then imported by the saved id', async () => {
    const { result, props } = setup();
    await pickAndPrepare(result, PERSONAL, ['shop.a']);
    await act(() => result.current.importNow());
    const order = calls().filter((c) => c.p === 'connections' ? c.body !== undefined : c.p === 'import').map((c) => c.p);
    expect(order).toEqual(['connections', 'import']);
    expect(calls().find((c) => c.p === 'connections' && c.body !== undefined).body).toMatchObject({ id: 'p1', schemas: ['shop'], tables: ['shop.a'] });
    expect(calls().find((c) => c.p === 'import').body.id).toBe('new-id'); // the id the server answered
    expect(props.onImported.mock.calls[0][1].connId).toBe('new-id');
    expect(result.current.form.password).toBe(''); // secrets are not kept in the form after saving
  });
  test('Full DDL travels to the import and to the linked source; nothing ticked = all tables (empty list)', async () => {
    const { result, props } = setup();
    await pickAndPrepare(result, SHARED, []);
    act(() => result.current.setFullDdl(true));
    await act(() => result.current.importNow());
    expect(calls().find((c) => c.p === 'import').body).toMatchObject({ tables: [], ddl: true });
    expect(props.onImported.mock.calls[0][1]).toMatchObject({ ddl: true, tables: [] });
  });
  test('a failure is reported, nothing is applied, and busy is cleared', async () => {
    const { result, props } = setup();
    await pickAndPrepare(result, SHARED);
    api.mockImplementation(async (p) => { if (p === 'import') throw new Error('connection refused'); return {}; });
    await act(() => result.current.importNow());
    expect(props.onImported).not.toHaveBeenCalled();
    expect(props.notify).toHaveBeenCalledWith('err', 'connection refused');
    expect(props.setBusy.mock.calls.map((c) => c[0]).slice(-2)).toEqual(['import', '']);
  });
});

describe('pick (regression: a shared connection offered no schemas, tables or Import)', () => {
  test('a connection with no stored schemas lists them through the server', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.conns).toHaveLength(2));
    act(() => result.current.pick(SHARED));
    await waitFor(() => expect(result.current.schemas).toEqual(['shop', 'audit']));
    expect(calls().find((c) => c.p === 'schemas').body).toEqual({ id: 's1' });
    expect(result.current.form).toMatchObject({ id: 's1', shared: true, password: '' });
    expect(result.current.picked).toEqual([]); // two schemas: the person chooses
  });
  test('a connection that already has schemas does not call the server and preselects them', async () => {
    const { result } = setup();
    act(() => result.current.pick(PERSONAL));
    expect(calls().some((c) => c.p === 'schemas')).toBe(false);
    expect(result.current.schemas).toEqual(['shop']);
    expect(result.current.picked).toEqual(['shop']);
    expect(result.current.tableSel).toEqual(['shop.a']);
  });
  test('Full DDL follows the diagram link: on for the linked connection with ddl, off for another one', async () => {
    const source = { connId: 'p1', schemas: ['shop'], tables: [], ddl: true };
    const { result } = setup({ source });
    expect(result.current.fullDdl).toBe(true); // the diagram was imported with it
    act(() => result.current.pick(SHARED));
    expect(result.current.fullDdl).toBe(false);
    act(() => result.current.pick(PERSONAL));
    expect(result.current.fullDdl).toBe(true);
  });
  test('picking resets the loaded table list, the groups and the warnings', async () => {
    const { result } = setup();
    await act(async () => { result.current.pick(PERSONAL); });
    await act(() => result.current.loadTables());
    expect(result.current.tableList).toHaveLength(2);
    act(() => result.current.setTableGroups([{ name: 'G', tables: [] }]));
    act(() => result.current.pick(PERSONAL));
    expect(result.current.tableList).toBeNull();
    expect(result.current.tableGroups).toBeNull();
    expect(result.current.warnings).toEqual([]);
  });
});

describe('test connection, tables, save, delete, reset', () => {
  test('test: lists schemas, preselects when there is only one, shows warnings', async () => {
    const { result, props } = setup();
    act(() => result.current.setForm({ ...EMPTY, host: 'h', database: 'd', user: 'u' }));
    await act(() => result.current.test());
    expect(result.current.schemas).toEqual(['shop', 'audit']);
    expect(result.current.picked).toEqual([]);
    expect(props.notify).toHaveBeenCalledWith('ok', 'Connected (read-only session) — 2 schema(s)');
    api.mockImplementation(async () => ({ schemas: ['only'], warnings: ['superuser'] }));
    await act(() => result.current.test());
    expect(result.current.picked).toEqual(['only']);
    expect(props.notify).toHaveBeenLastCalledWith('err', expect.stringContaining('extra privileges'));
  });
  test('the request body: name defaults to type@host, secrets as typed, clearCa sends null', async () => {
    const { result } = setup();
    act(() => result.current.setForm({ ...EMPTY, host: 'db.example.com', caPem: 'PEM', clearCa: true }));
    await act(() => result.current.test());
    expect(calls().find((c) => c.p === 'schemas').body).toMatchObject({ name: 'postgres@db.example.com', caPem: null });
  });
  test('loadTables sends the picked schemas and opens the picker with schema.table names', async () => {
    const { result } = setup();
    act(() => { result.current.setPicked(['shop']); });
    await act(() => result.current.loadTables());
    expect(calls().find((c) => c.p === 'tables').body.schemas).toEqual(['shop']);
    expect(result.current.tableList).toEqual([{ name: 'shop.a', view: false }, { name: 'shop.v', view: true }]);
    expect(result.current.picker).toBe(true);
  });
  test('save stores the connection, keeps its id in the form and reloads the list', async () => {
    const { result, props } = setup();
    await waitFor(() => expect(result.current.conns).toHaveLength(2));
    act(() => result.current.setForm({ ...EMPTY, host: 'h', password: 'secret' }));
    const n = connListCalls();
    await act(() => result.current.save());
    expect(result.current.form).toMatchObject({ id: 'new-id', password: '' });
    expect(connListCalls()).toBe(n + 1);
    expect(props.notify).toHaveBeenCalledWith('ok', 'Connection saved');
  });
  test('delete: the form and the diagram link of that connection are cleared', async () => {
    const { result, props } = setup({ source: { connId: 'p1' } });
    act(() => result.current.pick(PERSONAL));
    await act(() => result.current.del(PERSONAL));
    expect(calls().find((c) => c.method === 'DELETE').p).toBe('connections/p1');
    expect(result.current.form).toEqual(EMPTY);
    expect(props.setSource).toHaveBeenCalledWith(null);
  });
  test('deleting another connection leaves the form and the link alone', async () => {
    const { result, props } = setup({ source: { connId: 'p1' } });
    act(() => result.current.pick(PERSONAL));
    await act(() => result.current.del({ id: 'other' }));
    expect(result.current.form.id).toBe('p1');
    expect(props.setSource).not.toHaveBeenCalled();
  });
  test('"+ new" empties everything', async () => {
    const { result } = setup();
    act(() => result.current.pick(PERSONAL));
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ form: EMPTY, schemas: [], picked: [], tableSel: [], tableList: null, tableGroups: null, warnings: [] });
  });
  test('groups belong to their diagram: opening another one drops them', async () => {
    const { result, rerender, props } = setup();
    act(() => result.current.setTableGroups([{ name: 'G', tables: [] }]));
    rerender({ ...props, docId: 'd2' });
    expect(result.current.tableGroups).toBeNull();
  });
  test('set(k) updates one field from an input or a checkbox', () => {
    const { result } = setup();
    act(() => result.current.set('host')({ target: { value: 'x', type: 'text' } }));
    act(() => result.current.set('blockWritable')({ target: { checked: true, type: 'checkbox' } }));
    expect(result.current.form).toMatchObject({ host: 'x', blockWritable: true });
  });
});
