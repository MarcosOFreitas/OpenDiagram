// Behind a reverse proxy (TRUST_PROXY=1): the CSRF check must compare the browser's Origin with the host the person typed, which a proxy
// passes as X-Forwarded-Host or keeps in Host. nginx's default proxy_pass sends the upstream name (app:3000) as Host, and every POST,
// sign-in included, was refused (.specs/15-audit-2026-10-22.md, M1). Own file: TRUST_PROXY is read when index.js builds the app.
import './env.js';
process.env.OD_NO_LISTEN = '1';
process.env.TRUST_PROXY = '1';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUser } from '../src/auth.js';
const { app } = await import('../src/index.js');

await createUser({ email: 'ana@example.com', password: 'long-enough-pass', name: 'Ana' });
const signIn = (headers) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ana@example.com', password: 'long-enough-pass' }, headers });

test('sign-in through a proxy that rewrites Host and sends X-Forwarded-Host works', async () => {
  const r = await signIn({ origin: 'https://diagrams.example.com', host: 'app:3000', 'x-forwarded-host': 'diagrams.example.com', 'x-forwarded-proto': 'https' });
  assert.equal(r.statusCode, 200, r.body);
});

test('a proxy that keeps Host works as before; a foreign origin is still refused', async () => {
  assert.equal((await signIn({ origin: 'https://diagrams.example.com', host: 'diagrams.example.com' })).statusCode, 200);
  assert.equal((await signIn({ origin: 'https://evil.example', host: 'app:3000', 'x-forwarded-host': 'diagrams.example.com' })).statusCode, 403);
});

test('a proxy that rewrites Host and sends nothing else is refused with a hint for the operator', async () => {
  const r = await signIn({ origin: 'https://diagrams.example.com', host: 'app:3000' });
  assert.equal(r.statusCode, 403);
  assert.match(r.json().error, /Host header/);
});

test('the MCP endpoint applies the same rule', async () => {
  const through = await app.inject({ method: 'POST', url: '/mcp', payload: {}, headers: { origin: 'https://diagrams.example.com', host: 'app:3000', 'x-forwarded-host': 'diagrams.example.com' } });
  assert.equal(through.statusCode, 401); // past the origin check: only the agent token is missing
  const foreign = await app.inject({ method: 'POST', url: '/mcp', payload: {}, headers: { origin: 'https://evil.example', host: 'app:3000', 'x-forwarded-host': 'diagrams.example.com' } });
  assert.equal(foreign.statusCode, 403);
});
