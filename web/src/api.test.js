import { describe, test, expect, vi, afterEach } from 'vitest';
import { api, store, errMsg, ago, sharePassword, copyText } from './api.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); });
const fetchMock = (status, body) => { const f = vi.fn(async () => ({ ok: status < 400, status, statusText: 'Status', json: async () => body })); vi.stubGlobal('fetch', f); return f; };

describe('api', () => {
  test('GET without a body, POST with one, JSON and same-origin credentials', async () => {
    const f = fetchMock(200, { ok: 1 });
    await api('diagrams');
    await api('diagrams', { a: 1 });
    expect(f.mock.calls[0][0]).toBe('/api/diagrams');
    expect(f.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'same-origin', body: undefined });
    expect(f.mock.calls[1][1]).toMatchObject({ method: 'POST', body: '{"a":1}' });
    expect(f.mock.calls[1][1].headers['content-type']).toBe('application/json');
  });
  test('explicit method for DELETE without a body', async () => {
    const f = fetchMock(200, {});
    await api('diagrams/1', undefined, 'DELETE');
    expect(f.mock.calls[0][1].method).toBe('DELETE');
  });
  test('an error response throws with the server message, status, code and version', async () => {
    fetchMock(409, { error: 'saved by someone else', code: 'conflict', version: 7 });
    await expect(api('diagrams/1', {}, 'PUT')).rejects.toMatchObject({ message: 'saved by someone else', status: 409, code: 'conflict', version: 7 });
  });
  test('an error without a JSON body falls back to the status text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, statusText: 'Bad Gateway', json: async () => { throw new Error('no json'); } })));
    await expect(api('x')).rejects.toMatchObject({ message: 'Bad Gateway', status: 502 });
  });
  test('share routes send the link password for this tab, URL-encoded; other routes never do', async () => {
    const f = fetchMock(200, {});
    sharePassword('tok', 'pä ss');
    await api('shared/tok');
    await api('diagrams');
    expect(f.mock.calls[0][1].headers['x-share-password']).toBe(encodeURIComponent('pä ss'));
    expect(f.mock.calls[1][1].headers['x-share-password']).toBeUndefined();
  });
});

describe('store / sharePassword', () => {
  test('round trip in localStorage', () => { store('k', 'v'); expect(store('k')).toBe('v'); expect(store('missing')).toBeNull(); });
  test('a blocked storage never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(store('k')).toBeUndefined();
    expect(() => store('k', 'v')).not.toThrow();
    expect(sharePassword('t')).toBeNull();
    expect(() => sharePassword('t', 'x')).not.toThrow();
  });
});

describe('errMsg', () => {
  test('parser diagnostics become "line N: message"', () => expect(errMsg({ diags: [{ location: { start: { line: 3 } }, message: 'bad' }, { message: 'worse' }] })).toBe('line 3: bad\nline ?: worse'));
  test('plain Error, string, nothing', () => { expect(errMsg(new Error('boom'))).toBe('boom'); expect(errMsg('text')).toBe('text'); expect(errMsg(undefined)).toBe('undefined'); });
});

describe('ago', () => {
  const at = (ms) => Date.now() - ms;
  test.each([[10e3, 'just now'], [5 * 60e3, '5 min ago'], [3 * 3600e3, '3 h ago'], [2 * 86400e3, '2 d ago']])('%i ms -> %s', (ms, out) => expect(ago(at(ms))).toBe(out));
});

describe('copyText', () => {
  test('success and a blocked clipboard report through notify', async () => {
    const notify = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValueOnce() } });
    await copyText('x', 'Copied', notify);
    expect(notify).toHaveBeenLastCalledWith('ok', 'Copied');
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    await copyText('x', 'Copied', notify);
    expect(notify).toHaveBeenLastCalledWith('err', 'Clipboard blocked');
  });
});
