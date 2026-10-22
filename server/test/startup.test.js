// @dbml/core takes ~330 MB once loaded: starting the server must not load it (merge.js loads it on first use).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOK = `data:text/javascript,${encodeURIComponent("import { registerHooks } from 'node:module'; registerHooks({ resolve(s, c, next) { if (s === '@dbml/core') process.stdout.write('DBML-LOADED '); return next(s, c); } });")}`;
const run = (code) => spawnSync(process.execPath, ['--import', HOOK, '--input-type=module', '-e', code], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
  env: { ...process.env, OD_NO_LISTEN: '1', DATA_DIR: mkdtempSync(join(tmpdir(), 'opendiagram-start-')), APP_SECRET: 'unit-test-secret-0000000000000000' },
});

test('starting the server does not load @dbml/core', () => {
  const r = run("await import('./src/index.js'); console.log('started');");
  assert.match(r.stdout, /started/, r.stderr);
  assert.doesNotMatch(r.stdout, /DBML-LOADED/);
});

test('loadParser loads it (the check above can see a load)', () => {
  const r = run("await (await import('./src/merge.js')).loadParser(); console.log('done');");
  assert.match(r.stdout, /DBML-LOADED[\s\S]*done/, r.stderr);
});
