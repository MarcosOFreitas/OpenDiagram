import './env.js';
process.env.OD_NO_LISTEN = '1'; // index.js builds the app and stops there: routes are tried through app.inject, no port, no timers
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUser } from '../src/auth.js';
const { app, errorReply } = await import('../src/index.js');

await createUser({ email: 'ana@example.com', password: 'long-enough-pass', name: 'Ana' });
const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ana@example.com', password: 'long-enough-pass' } });
const cookie = login.headers['set-cookie'].split(';')[0];
const call = (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } });
const id = (await call('POST', '/api/diagrams', { title: 'T', dbml: 'Table a { id int }' })).json().id;

test('the API needs a session, except health', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/api/health' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/diagrams' })).statusCode, 401);
  assert.equal((await call('GET', '/api/diagrams')).statusCode, 200);
});

test('a cross-origin write is blocked before it reaches a route', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/diagrams', payload: { title: 'x' }, headers: { cookie, origin: 'https://evil.example', host: 'localhost' } });
  assert.equal(r.statusCode, 403);
});

test('baseVersion: a stale integer is a 409 with the current version, anything else that is not an integer is a 400', async () => {
  const v = (await call('GET', `/api/diagrams/${id}`)).json().version;
  assert.equal((await call('PUT', `/api/diagrams/${id}`, { dbml: 'Table b { id int }', baseVersion: v })).statusCode, 200);
  const stale = await call('PUT', `/api/diagrams/${id}`, { dbml: 'Table c { id int }', baseVersion: v });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, 'conflict');
  for (const baseVersion of ['7', 1.5, null, true]) {
    const r = await call('PUT', `/api/diagrams/${id}`, { dbml: 'Table d { id int }', baseVersion });
    assert.equal(r.statusCode, 400, `baseVersion ${JSON.stringify(baseVersion)}`);
  }
});

test('a share link with an access name from Object.prototype is a 400', async () => {
  const r = await call('POST', `/api/diagrams/${id}/shares`, { access: 'toString' });
  assert.equal(r.statusCode, 400);
});

test('a missing connection answers 404 with { error }', async () => {
  const r = await call('POST', '/api/connections', { id: 'does-not-exist', name: 'x', type: 'postgres', host: 'h', port: 1, database: 'd', user: 'u' });
  assert.equal(r.statusCode, 404);
  assert.equal(typeof r.json().error, 'string');
});

test('POST /api/connections validates the connection like the administrators\' route does', async () => {
  const ok = { name: 'pg', type: 'postgres', host: 'db.example.com', port: 5432, database: 'd', user: 'u' };
  for (const [what, body] of [['type', { ...ok, type: 'sqlite' }], ['name', { ...ok, name: '' }], ['host', { ...ok, host: undefined }], ['database', { ...ok, database: '' }], ['user', { ...ok, user: undefined }], ['port', { ...ok, port: 70000 }], ['port', { ...ok, port: 'abc' }], ['name', { ...ok, name: 'x'.repeat(200) }]]) {
    const r = await call('POST', '/api/connections', body);
    assert.equal(r.statusCode, 400, `${what}: ${JSON.stringify(body)}`);
    assert.equal(typeof r.json().error, 'string');
  }
  const r = await call('POST', '/api/connections', { ...ok, port: '' });
  assert.equal(r.statusCode, 200, r.body); // an empty port means the engine's default, as the form sends it
});

test('schemas and tables must be lists of names in /api/tables and /api/import', async () => {
  const conn = { type: 'postgres', host: 'db.example.com', database: 'd', user: 'u' };
  for (const url of ['/api/tables', '/api/import']) {
    for (const schemas of ['public', [1], [{}], []]) {
      const r = await call('POST', url, { ...conn, schemas });
      assert.equal(r.statusCode, 400, `${url} schemas=${JSON.stringify(schemas)}`);
    }
  }
  const r = await call('POST', '/api/import', { ...conn, schemas: ['public'], tables: 'orders' });
  assert.equal(r.statusCode, 400);
});

test('a save repeated after a lost response (stale baseVersion, same content) is not a conflict', async () => {
  const v = (await call('GET', `/api/diagrams/${id}`)).json().version;
  const first = await call('PUT', `/api/diagrams/${id}`, { dbml: 'Table resent { id int }', baseVersion: v });
  assert.equal(first.statusCode, 200);
  const again = await call('PUT', `/api/diagrams/${id}`, { dbml: 'Table resent { id int }', baseVersion: v }); // the client never saw the answer
  assert.equal(again.statusCode, 200, again.body);
  assert.equal(again.json().version, first.json().version);
  assert.equal((await call('PUT', `/api/diagrams/${id}`, { dbml: 'Table other { id int }', baseVersion: v })).statusCode, 409); // different content still conflicts
});

test('request logs never carry a share-link token', async () => {
  const { maskUrl } = await import('../src/index.js');
  assert.equal(maskUrl('/s/AbC123_-xyz'), '/s/***');
  assert.equal(maskUrl('/api/shared/AbC123_-xyz/comments/7?x=1'), '/api/shared/***/comments/7?x=1');
  assert.equal(maskUrl('/api/diagrams/42'), '/api/diagrams/42');
});

test('every answer carries its request id, the one in the server log', async () => {
  const r = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(typeof r.headers['x-request-id'], 'string');
  assert.ok(r.headers['x-request-id'].length > 0);
});

test('a MySQL connection is accepted with an empty Database (it only sets the session default); other engines still need one', async () => {
  const base = { name: 'my', host: 'db.example.com', port: '', user: 'u' };
  const my = await call('POST', '/api/connections', { ...base, type: 'mysql', database: '' });
  assert.equal(my.statusCode, 200, my.body);
  assert.equal((await call('POST', '/api/connections', { ...base, type: 'postgres', database: '' })).statusCode, 400);
  assert.equal((await call('POST', '/api/connections', { ...base, type: 'sqlserver', database: 'd' })).statusCode, 400);
});

test('history entries cannot be deleted through the API: named versions are never removed (.specs/15, M3)', async () => {
  const d = (await call('POST', '/api/diagrams', { title: 'H', dbml: 'Table a { id int }' })).json().id;
  assert.equal((await call('POST', `/api/diagrams/${d}/versions`, { label: 'Release 1' })).statusCode, 200);
  const v = (await call('GET', `/api/diagrams/${d}/versions`)).json().find((x) => x.label === 'Release 1');
  assert.ok(v);
  assert.equal((await call('DELETE', `/api/diagrams/${d}/versions/${v.id}`)).statusCode, 404);
  assert.ok((await call('GET', `/api/diagrams/${d}/versions`)).json().some((x) => x.id === v.id));
});

test('an unexpected error answers "internal error" with the request id, never its text; errors with a status keep their message (.specs/15, S3)', () => {
  assert.deepEqual(errorReply(new TypeError('Cannot read properties of undefined (reading \'x\')'), 'req-7'), { status: 500, body: { error: 'internal error (request req-7)' } });
  assert.deepEqual(errorReply(Object.assign(new Error('Nothing answers on x:1'), { statusCode: 502 }), 'r'), { status: 502, body: { error: 'Nothing answers on x:1' } });
  assert.deepEqual(errorReply(Object.assign(new Error('bad input'), { statusCode: 400 }), 'r'), { status: 400, body: { error: 'bad input' } });
  assert.deepEqual(errorReply(Object.assign(new Error('stale'), { statusCode: 409, code: 'conflict', version: 3 }), 'r').body, { error: 'stale', code: 'conflict', version: 3 });
});

test('a database that does not answer is a 502 in plain words (.specs/15, U2)', async () => {
  const r = await call('POST', '/api/schemas', { type: 'postgres', host: '127.0.0.1', port: 1, database: 'd', user: 'u', password: 'p' });
  assert.equal(r.statusCode, 502, r.body);
  assert.match(r.json().error, /Nothing answers on 127\.0\.0\.1:1/);
});

test('connection fields of the wrong type are a 400, not a crash in the encryption (.specs/15, M5)', async () => {
  const conn = { name: 'c', type: 'postgres', host: 'db.example.com', port: 5432, database: 'd', user: 'u' };
  for (const [k, v] of [['password', 123], ['caPem', { pem: 1 }], ['serverDn', ['x']], ['tls', 'maybe']]) {
    const r = await call('POST', '/api/connections', { ...conn, [k]: v });
    assert.equal(r.statusCode, 400, `${k}: ${r.body}`);
    assert.match(r.json().error, new RegExp(k === 'tls' ? 'tls must be' : `${k} must be text`));
  }
  assert.equal((await call('POST', '/api/schemas', { ...conn, password: 5 })).statusCode, 400);
});

test('a connection whose secrets were saved under another APP_SECRET: listed with secretLost, using it asks for the password, a new one is used (.specs/15, M2)', async () => {
  const { db } = await import('../src/db.js');
  const { createCipheriv, randomBytes, scryptSync } = await import('node:crypto');
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', scryptSync('another-secret', 'dbdiagram-open', 32), iv), d = Buffer.concat([c.update('p', 'utf8'), c.final()]);
  const cid = (await call('POST', '/api/connections', { name: 'moved', type: 'postgres', host: '127.0.0.1', port: 1, database: 'd', user: 'u', password: 'p' })).json().id;
  db.prepare('update connections set password = ? where id = ?').run(Buffer.concat([iv, c.getAuthTag(), d]).toString('base64'), cid);
  const list = await call('GET', '/api/connections');
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().find((x) => x.id === cid).secretLost, true);
  const use = await call('POST', '/api/schemas', { id: cid });
  assert.equal(use.statusCode, 409);
  assert.match(use.json().error, /cannot be read.*APP_SECRET.*Enter the password again/);
  assert.equal((await call('POST', '/api/schemas', { id: cid, password: 'typed-again' })).statusCode, 502); // got past the check: 127.0.0.1:1 refuses
});

test('a save that follows a refresh (entry "refresh") stores what changed in the structure, and later edits do not rewrite it (.specs/14, item 9)', async () => {
  const d = (await call('POST', '/api/diagrams', { title: 'R', dbml: 'Table a { id int }\n' })).json().id;
  const summaries = async () => (await call('GET', `/api/diagrams/${d}/versions`)).json().map((v) => v.summary);
  assert.equal((await call('PUT', `/api/diagrams/${d}`, { dbml: 'Table a { id int }\nTable b { id int }\n', entry: 'refresh' })).statusCode, 200);
  assert.equal((await summaries())[0], 'Refresh from database: 1 table added');
  await call('PUT', `/api/diagrams/${d}`, { dbml: 'Table a { id int }\nTable b { id int }\nTable c { id int }\n' }); // the person goes on editing within minutes
  assert.deepEqual((await summaries()).slice(0, 2), ['added c; +1 / -0 lines', 'Refresh from database: 1 table added']);
  await call('PUT', `/api/diagrams/${d}`, { dbml: 'Table a { id int }\nTable b { id int }\nTable c { id int }\n// lineage: b <- a (auto)\n', entry: 'refresh' });
  assert.equal((await summaries())[0], 'Refresh from database: +1 / -0 lines'); // nothing structural: the line summary
});

test('Library: "changed since you last opened it" lights for changes by someone else and shows the change only to people who can edit (.specs/14, item 9)', async () => {
  const people = {};
  for (const [name, email] of [['Bo', 'bo@example.com'], ['Cy', 'cy@example.com']]) {
    people[name] = await createUser({ email, password: 'long-enough-pass', name });
    const c = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'long-enough-pass' } })).headers['set-cookie'].split(';')[0];
    people[name].call = (method, url, payload) => app.inject({ method, url, payload, headers: { cookie: c } });
  }
  const { Bo: { call: bo }, Cy: { call: cy } } = people;
  const d = (await call('POST', '/api/diagrams', { title: 'Shared', dbml: 'Table a { id int }\n' })).json().id;
  await call('POST', `/api/diagrams/${d}/access`, { type: 'user', subjectId: people.Bo.id, access: 'edit' });
  await call('POST', `/api/diagrams/${d}/access`, { type: 'user', subjectId: people.Cy.id, access: 'view' });
  const card = async (who) => { const x = (await who('GET', '/api/diagrams')).json().find((y) => y.id === d); return { unseen: x.unseen, ...(x.lastChange && { ...x.lastChange, at: typeof x.lastChange.at }) }; };
  const open = (who) => who('GET', `/api/diagrams/${d}`);
  const save = (who, dbml, entry) => who('PUT', `/api/diagrams/${d}`, { dbml, entry });

  await save(call, 'Table a { id bigint }\n');
  assert.deepEqual(await card(bo), { unseen: false }); // Bo never opened it: nothing to compare with
  await open(call); await open(bo); await open(cy);
  await save(call, 'Table a { id bigint }\nTable b { id int }\n', 'refresh');
  assert.deepEqual(await card(call), { unseen: false }); // her own change
  assert.deepEqual(await card(bo), { unseen: true, summary: 'Refresh from database: 1 table added', author: 'Ana', at: 'number', count: 1 });
  assert.deepEqual(await card(cy), { unseen: true }); // view only: the badge, not the history
  await save(call, 'Table a { id bigint }\nTable b { id int }\nTable c { id int }\n');
  assert.deepEqual(await card(bo), { unseen: true, summary: 'added c; +1 / -0 lines', author: 'Ana', at: 'number', count: 2 }); // the latest one and how many
  await open(bo);
  assert.deepEqual(await card(bo), { unseen: false }); // opening it puts the badge out
  await save(bo, 'Table a { id bigint }\nTable b { id int }\nTable c { id int }\nTable e { id int }\n');
  assert.deepEqual(await card(bo), { unseen: false }); // his own save
  assert.deepEqual(await card(call), { unseen: true, summary: 'added e; +1 / -0 lines', author: 'Bo', at: 'number', count: 1 });
});
