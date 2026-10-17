import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// store.js derives the key that encrypts saved connection passwords from APP_SECRET when it is imported: try it in a child process with a chosen environment
const load = (env) => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/store.js')"], {
    cwd: new URL('..', import.meta.url),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATA_DIR: mkdtempSync(join(tmpdir(), 'opendiagram-secret-')), ...env },
    encoding: 'utf8',
  });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
};
const PUBLIC_KEY_WARNING = /APP_SECRET is empty/;

test('local trial: no APP_SECRET still starts, but warns that the key is public', () => {
  const r = load({});
  assert.equal(r.ok, true, r.out);
  assert.match(r.out, PUBLIC_KEY_WARNING);
});

test('an APP_SECRET set: starts silently', () => {
  const r = load({ APP_SECRET: 'x'.repeat(32) });
  assert.equal(r.ok, true, r.out);
  assert.doesNotMatch(r.out, PUBLIC_KEY_WARNING);
});

test('hosted settings without APP_SECRET refuse to start instead of using the public key', () => {
  for (const env of [{ COOKIE_SECURE: '1' }, { DB_HOST_POLICY: 'public-only' }, { DB_HOST_POLICY: 'allowlist' }, { REQUIRE_APP_SECRET: '1' }]) {
    const r = load(env);
    assert.equal(r.ok, false, `${JSON.stringify(env)} should refuse to start`);
    assert.match(r.out, PUBLIC_KEY_WARNING);
  }
});

test('an empty APP_SECRET counts as not set', () => {
  assert.equal(load({ APP_SECRET: '', COOKIE_SECURE: '1' }).ok, false);
});

test('hosted settings with an APP_SECRET start', () => {
  assert.equal(load({ APP_SECRET: 'y'.repeat(32), COOKIE_SECURE: '1', DB_HOST_POLICY: 'public-only' }).ok, true);
});
