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
  assert.equal(maskUrl('/%61pi/%73hared/AbC123_-xyz'), '/api/shared/***'); // the router decodes this to the same route
  assert.equal(maskUrl('/api/shared/AbC%zz'), '/api/shared/***'); // a malformed escape is masked too
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
  const big = await call('POST', '/api/connections', { ...conn, caPem: `-----BEGIN CERTIFICATE-----\n${'A'.repeat(70_000)}\n-----END CERTIFICATE-----` }); // a CA chain is a few KB: not megabytes stored per connection
  assert.deepEqual([big.statusCode, /caPem is too long/.test(big.json().error)], [400, true]);
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
  await call('PUT', `/api/diagrams/${d}`, { layout: { 'shop.a': { x: 1, y: 2 } }, entry: 'refresh' }); // no DBML to compare: still its own entry
  assert.equal((await summaries())[0], 'Refresh from database: layout only');
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

const signIn = async (name, email) => {
  const u = await createUser({ email, password: 'long-enough-pass', name });
  const c = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'long-enough-pass' } })).headers['set-cookie'].split(';')[0];
  return Object.assign((method, url, payload) => app.inject({ method, url, payload, headers: { cookie: c } }), { id: u.id });
};

test('one\'s own save puts "changed since you last opened it" out, also over a newer version (overwrite) or by restoring one (.specs/14, item 9)', async () => {
  const dee = await signIn('Dee', 'dee@example.com');
  const d = (await call('POST', '/api/diagrams', { title: 'Mine', dbml: 'Table a { id int }\n' })).json().id;
  await call('POST', `/api/diagrams/${d}/access`, { type: 'user', subjectId: dee.id, access: 'edit' });
  const unseen = async () => (await call('GET', '/api/diagrams')).json().find((x) => x.id === d).unseen;
  await call('GET', `/api/diagrams/${d}`); // Ana opens it
  const dv = (await dee('PUT', `/api/diagrams/${d}`, { dbml: 'Table a { id int }\nTable dee { id int }\n' })).json().version;
  assert.equal(await unseen(), true);
  assert.equal((await call('PUT', `/api/diagrams/${d}`, { dbml: 'Table a { id int }\nTable ana { id int }\n', baseVersion: dv, overwrite: true })).statusCode, 200); // "Keep my changes"
  assert.equal(await unseen(), false);
  await dee('PUT', `/api/diagrams/${d}`, { dbml: 'Table a { id int }\nTable dee2 { id int }\n' });
  assert.equal(await unseen(), true);
  const first = (await call('GET', `/api/diagrams/${d}/versions`)).json().at(-1).id;
  assert.equal((await call('POST', `/api/diagrams/${d}/versions/${first}/restore`)).statusCode, 200);
  assert.equal(await unseen(), false);
});

test('the structural summary of a refresh save is parsed only when its entry is written, at most 6 times in 10 minutes per person, then the line summary (.specs/14, item 9)', async () => {
  const eve = await signIn('Eve', 'eve@example.com');
  const d = (await eve('POST', '/api/diagrams', { title: 'Budget', dbml: 'Table t0 { id int }\n' })).json().id;
  const v = (await eve('GET', `/api/diagrams/${d}`)).json().version;
  for (let i = 0; i < 6; i++) { // no entry is written: nothing parsed, nothing spent
    assert.equal((await eve('PUT', `/api/diagrams/${d}`, { dbml: 'Table t0 { id int }\n', entry: 'refresh' })).statusCode, 200); // the same text
    assert.equal((await eve('PUT', `/api/diagrams/${d}`, { dbml: `Table x${i} { id int }\n`, entry: 'refresh', baseVersion: v + 100 })).statusCode, 409);
  }
  let text = 'Table t0 { id int }\n';
  const summaries = [];
  for (let i = 1; i <= 7; i++) {
    text += `Table t${i} { id int }\n`;
    await eve('PUT', `/api/diagrams/${d}`, { dbml: text, entry: 'refresh' });
    summaries.push((await eve('GET', `/api/diagrams/${d}/versions`)).json()[0].summary);
  }
  assert.deepEqual(summaries, [...Array(6).fill('Refresh from database: 1 table added'), 'Refresh from database: added t7; +1 / -0 lines']);
});

test('the database host policy is enforced by the routes, not only by its functions (DB_HOST_POLICY)', async () => {
  const conn = { type: 'postgres', port: 5432, database: 'd', user: 'u', password: 'p' };
  try {
    process.env.DB_HOST_POLICY = 'public-only';
    for (const host of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '::1', 'localhost']) {
      const r = await call('POST', '/api/schemas', { ...conn, host });
      assert.deepEqual([r.statusCode, /public database hosts/.test(r.json().error)], [403, true], host);
    }
    assert.equal((await call('POST', '/api/connections', { ...conn, name: 'internal', host: '192.168.0.10' })).statusCode, 403); // nor can it be saved
    await createUser({ email: 'root@example.com', password: 'long-enough-pass', name: 'Root', role: 'admin' });
    const rc = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'root@example.com', password: 'long-enough-pass' } })).headers['set-cookie'].split(';')[0];
    assert.equal((await app.inject({ method: 'POST', url: '/api/admin/connections', payload: { ...conn, name: 'shared', host: '172.16.0.5' }, headers: { cookie: rc } })).statusCode, 403); // nor shared by an administrator
    process.env.DB_HOST_POLICY = 'allowlist'; process.env.DB_HOST_ALLOWLIST = 'db.example.com';
    const r = await call('POST', '/api/schemas', { ...conn, host: 'other.example.com' });
    assert.deepEqual([r.statusCode, /allowlist/.test(r.json().error)], [403, true]);
  } finally { delete process.env.DB_HOST_POLICY; delete process.env.DB_HOST_ALLOWLIST; }
});

test('a percent-encoded /api prefix does not get around the login, Origin and password-change checks (release audit)', async () => {
  for (const url of ['/%61pi/diagrams', '/%61pi/directory/groups', '/a%70i/directory/users?q=an', '/%61%70%69/diagrams']) {
    const r = await app.inject({ method: 'GET', url });
    assert.equal(r.statusCode, 401, `${url}: ${r.body}`);
  }
  const cross = await app.inject({ method: 'POST', url: '/%61pi/schemas', payload: { type: 'postgres', host: '127.0.0.1', port: 9, database: 'd', user: 'u' }, headers: { origin: 'https://evil.example', host: 'localhost' } });
  assert.equal(cross.statusCode, 403, cross.body); // the Origin guard, before any outbound connection
  assert.equal((await app.inject({ method: 'GET', url: '/%61pi/health' })).statusCode, 200); // what is open stays open
});
