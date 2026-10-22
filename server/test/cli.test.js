// cli.js backup / restore, run as the operator runs them: a separate process on the same DATA_DIR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA = mkdtempSync(join(tmpdir(), 'opendiagram-cli-'));
const cli = (...args) => spawnSync(process.execPath, ['src/cli.js', ...args], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...process.env, DATA_DIR: DATA, APP_SECRET: 'unit-test-secret-0000000000000000' } });
const users = () => cli('list-users').stdout;
const alive = (at) => { const d = new DatabaseSync(join(DATA, 'app.db')); d.prepare("insert into settings (key, value) values ('server_alive', ?) on conflict(key) do update set value = excluded.value").run(String(at)); d.close(); };

test('backup copies the database; restore brings that copy back', () => {
  assert.equal(cli('create-admin', 'first@example.com', 'long-enough-pass').status, 0);
  const file = join(DATA, 'one.db');
  const b = cli('backup', file);
  assert.equal(b.status, 0, b.stderr);
  assert.ok(existsSync(file));
  cli('create-admin', 'second@example.com', 'long-enough-pass');
  assert.match(users(), /second@example\.com/);
  const r = cli('restore', file);
  assert.equal(r.status, 0, r.stderr);
  assert.match(users(), /first@example\.com/);
  assert.doesNotMatch(users(), /second@example\.com/);
});

test('backup without a name writes a dated file in the data folder, and never overwrites one', () => {
  const b = cli('backup');
  assert.equal(b.status, 0, b.stderr);
  const file = b.stdout.match(/(\S+backup-\d{8}-\d{6}\.db)/)?.[1];
  assert.ok(file && existsSync(file), b.stdout);
  const again = cli('backup', file);
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /exists/);
});

test('restore refuses while a server is running on the database, unless --force', () => {
  const file = join(DATA, 'two.db');
  cli('backup', file);
  alive(Math.floor(Date.now() / 1000));
  const r = cli('restore', file);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /running/);
  alive(Math.floor(Date.now() / 1000) - 600); // a server that stopped without saying so: its mark grows old
  assert.equal(cli('restore', file).status, 0);
  alive(Math.floor(Date.now() / 1000));
  assert.equal(cli('restore', file, '--force').status, 0);
});

test('restore refuses a file that is not an OpenDiagram database', () => {
  const junk = join(DATA, 'junk.db');
  writeFileSync(junk, 'not a database');
  const r = cli('restore', junk);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not an OpenDiagram/);
  const other = join(DATA, 'other.db');
  new DatabaseSync(other).exec('create table t (x)');
  assert.notEqual(cli('restore', other).status, 0);
  assert.match(users(), /first@example\.com/); // the current database is untouched
});
