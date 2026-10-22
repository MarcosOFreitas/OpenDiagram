// @dbml/core's Parser takes ~330 MB once loaded (it loads the SQL parser of every dialect): the server never loads it. It reads DBML with the
// light parse (dbmlParse.js: @dbml/parse and the model, ~16 MB), loaded on first use (merge.js), so starting the server loads neither.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOK = `data:text/javascript,${encodeURIComponent("import { registerHooks } from 'node:module'; registerHooks({ resolve(s, c, next) { if (s === '@dbml/core' || s === '@dbml/parse') process.stdout.write(`LOADED ${s} `); return next(s, c); } });")}`;
const run = (code) => spawnSync(process.execPath, ['--import', HOOK, '--input-type=module', '-e', code], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
  env: { ...process.env, OD_NO_LISTEN: '1', DATA_DIR: mkdtempSync(join(tmpdir(), 'opendiagram-start-')), APP_SECRET: 'unit-test-secret-0000000000000000' },
});

test('starting the server loads no DBML parser', () => {
  const r = run("await import('./src/index.js'); console.log('started');");
  assert.match(r.stdout, /started/, r.stderr);
  assert.doesNotMatch(r.stdout, /LOADED/);
});

test('loadParser loads the light parse, never @dbml/core (the check above can see a load)', () => {
  const r = run("const m = await import('./src/merge.js'); await m.loadParser(); console.log(m.validDbml('Table a { id int }') ?? 'valid');");
  assert.match(r.stdout, /LOADED @dbml\/parse[\s\S]*valid/, r.stderr);
  assert.doesNotMatch(r.stdout, /LOADED @dbml\/core/);
});
