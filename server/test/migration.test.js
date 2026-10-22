// db.js on a database made before one of its tables existed: the table is added and the data stays (.specs/14, item 9: diagram_seen)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'opendiagram-old-'));
const run = (code) => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `const { db } = await import('./src/db.js');\n${code}`], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...process.env, DATA_DIR: dir } });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('a database made before diagram_seen gets the table, keeps its data, and a seen mark goes with its person or diagram', () => {
  assert.equal(run(`db.exec("insert into users (id, email, name, password_hash, created_at) values (1, 'a@x', 'A', 'h', 0), (2, 'b@x', 'B', 'h', 0)");
db.exec("insert into diagrams (id, owner_id, title, dbml, created_at, updated_at) values ('d1', 1, 'T', '', 0, 0), ('d2', 1, 'T', '', 0, 0)");
db.exec('drop table diagram_seen');
console.log(db.prepare("select count(*) n from sqlite_master where name = 'diagram_seen'").get().n);`), 0);
  assert.deepEqual(run(`const n = (t) => db.prepare('select count(*) n from ' + t).get().n, out = [n('diagrams')];
db.exec("insert into diagram_seen (user_id, diagram_id, version) values (2, 'd1', 1), (2, 'd2', 1), (1, 'd2', 1)");
out.push(n('diagram_seen'));
db.exec("delete from diagrams where id = 'd1'"); out.push(n('diagram_seen'));
db.exec('delete from users where id = 2'); out.push(n('diagram_seen'));
console.log(JSON.stringify(out));`), [2, 3, 2, 1]);
});
