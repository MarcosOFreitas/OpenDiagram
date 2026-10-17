import './env.js';
process.env.OD_NO_LISTEN = '1'; // index.js builds the app and stops there: routes are tried through app.inject, no port, no timers
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUser } from '../src/auth.js';
const { app } = await import('../src/index.js');

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
