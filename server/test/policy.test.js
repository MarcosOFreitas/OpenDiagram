import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, assertHostAllowed } from '../src/policy.js';

test('isPrivateIp: private, loopback, link-local, CGNAT, multicast; public passes', () => {
  for (const ip of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '100.127.0.1', '224.0.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '100.63.0.1', '100.128.0.1', '2001:4860:4860::8888', '::ffff:8.8.8.8']) assert.equal(isPrivateIp(ip), false, ip);
});

test('open policy (default) allows anything', async () => assert.equal(await assertHostAllowed('127.0.0.1', {}), undefined));

test('allowlist: exact, case-insensitive names only', async () => {
  const env = { DB_HOST_POLICY: 'allowlist', DB_HOST_ALLOWLIST: ' db.example.com , Other.example.com ' };
  await assertHostAllowed('DB.example.com', env);
  await assertHostAllowed('other.example.com', env);
  await assert.rejects(assertHostAllowed('evil.example.com', env), { statusCode: 403 });
  await assert.rejects(assertHostAllowed('sub.db.example.com', env), { statusCode: 403 });
});

test('allowlist with an empty list refuses everything', async () => {
  await assert.rejects(assertHostAllowed('db.example.com', { DB_HOST_POLICY: 'allowlist' }), { statusCode: 403 });
});

test('public-only: IP literals are judged without a lookup', async () => {
  const env = { DB_HOST_POLICY: 'public-only' };
  await assertHostAllowed('8.8.8.8', env);
  for (const h of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '::1', '::ffff:192.168.0.1']) await assert.rejects(assertHostAllowed(h, env), { statusCode: 403 }, h);
});

test('public-only: a name that does not resolve is refused', async () => {
  await assert.rejects(assertHostAllowed('no-such-host.invalid', { DB_HOST_POLICY: 'public-only' }), { statusCode: 403 });
});

test('public-only returns the address it checked (the drivers connect to it, so a second lookup cannot answer a private one: DNS rebinding, .specs/15 S2)', async () => {
  const env = { DB_HOST_POLICY: 'public-only' };
  let n = 0;
  const lookup = async () => (n++ ? [{ address: '10.0.0.5' }] : [{ address: '203.0.113.7' }]); // a rebinding name: public first, private next
  assert.equal(await assertHostAllowed('db.example.com', env, lookup), '203.0.113.7');
  await assert.rejects(assertHostAllowed('db.example.com', env, lookup), { statusCode: 403 });
  assert.equal(await assertHostAllowed('8.8.8.8', env), '8.8.8.8');
  assert.equal(await assertHostAllowed('db.example.com', { DB_HOST_POLICY: 'allowlist', DB_HOST_ALLOWLIST: 'db.example.com' }), undefined); // listed names: connected by name
});
