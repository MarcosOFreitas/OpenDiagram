import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import { createUser } from '../src/auth.js';
import * as store from '../src/store.js';
import * as dg from '../src/diagrams.js';
import * as presence from '../src/presence.js';
import * as audit from '../src/audit.js';
import { due, refreshOne, tick, clear, stateOf, genHash, MAX_FAILURES } from '../src/refresh.js';

const owner = await createUser({ email: 'o@example.com', password: 'long-enough-pass', name: 'Olga', role: 'member' });
const GEN1 = 'Table shop.a { id int }\nTable shop.b { id int }\n', GEN2 = `${GEN1}Table shop.c { id int }\n`;
const conn = (mins, extra = {}) => store.upsert(owner.id, { name: 'c', type: 'postgres', host: 'h', port: 5432, database: 'd', user: 'u', password: 'x', refreshMinutes: mins, ...extra });
const NOW = 1_000_000;
const linked = (connId, { at = 0, gen, dbml = GEN1 } = {}) => {
  const id = dg.create(owner.id, { title: 'T', dbml });
  dg.update(id, { source: { connId, schemas: ['shop'], tables: null, at, ...(gen ? { gen } : {}) } }, { includeSource: true });
  return id;
};
const row = (id) => db.prepare('select * from diagrams where id = ?').get(id);
const fake = (dbml, calls = []) => ({ resolve: async (b, user) => store.getForUse(user, b.id), generate: async () => { calls.push(1); if (dbml instanceof Error) throw dbml; return { dbml, at: NOW * 1000 }; } });

test('minimum interval is 5 minutes (settings of 1 are raised)', () => {
  const id = conn(1);
  assert.equal(store.get(owner.id, id).refreshMinutes, 5);
  assert.equal(store.get(owner.id, conn(0)).refreshMinutes, 0);
});

test('due: only linked diagrams with an interval, after interval + jitter, never when paused', () => {
  const c5 = conn(5), c0 = conn(0);
  const a = linked(c5), none = linked(c0), unlinked = dg.create(owner.id, { title: 'U', dbml: GEN1 });
  const ids = (now) => due(now).map((d) => d.id);
  assert.ok(ids(NOW).includes(a));
  assert.ok(!ids(NOW).includes(none) && !ids(NOW).includes(unlinked)); // no interval / no link
  db.prepare('update diagrams set source = ? where id = ?').run(JSON.stringify({ connId: c5, schemas: ['shop'], at: NOW * 1000 }), a);
  assert.ok(!ids(NOW + 5 * 60 - 1).includes(a)); // not yet
  assert.ok(ids(NOW + 5 * 60 + 60).includes(a)); // interval + the largest jitter (59 s)
  db.prepare('insert into refresh_state (diagram_id, last_run, failures, paused) values (?, ?, ?, 1)').run(a, NOW, MAX_FAILURES);
  assert.ok(!ids(NOW + 3600).includes(a)); // paused
  clear(a);
  assert.ok(ids(NOW + 3600).includes(a));
});

test('a changed schema is saved as its own "Refresh from database" entry by "Scheduled refresh", keeping groups; the same text changes nothing', async () => {
  const old = `${GEN1}\nTableGroup G {\n  shop.a\n}\n`;
  const id = linked(conn(5), { gen: genHash(GEN1), dbml: old });
  const v0 = row(id).version;
  await refreshOne(row(id), fake(GEN1), NOW); // same text as the last import: nothing to save
  assert.equal(row(id).version, v0);
  assert.equal(stateOf(id).lastError, null);
  await refreshOne(row(id), fake(GEN2), NOW);
  const d = row(id);
  assert.equal(d.version, v0 + 1);
  assert.match(d.dbml, /Table shop\.c/);
  assert.match(d.dbml, /TableGroup G/);
  assert.equal(JSON.parse(d.source).gen, genHash(GEN2));
  const last = dg.listVersions(id)[0];
  assert.equal(last.author, 'Scheduled refresh');
  assert.match(last.summary, /^Refresh from database: added shop\.c/);
});

test('a diagram linked before the server knew its last import only gets a baseline: manual edits stay, the next change is applied', async () => {
  const id = linked(conn(5), { dbml: `${GEN1}// my note
` });
  await refreshOne(row(id), fake(GEN2), NOW);
  assert.ok(!/shop\.c/.test(row(id).dbml) && /my note/.test(row(id).dbml));
  assert.equal(JSON.parse(row(id).source).gen, genHash(GEN2));
  await refreshOne(row(id), fake(`${GEN2}Table shop.d { id int }
`), NOW);
  assert.match(row(id).dbml, /shop\.d/);
});

test('failures are recorded; the 5th pauses the diagram; a conflict is not a failure', async () => {
  const id = linked(conn(5));
  for (let i = 1; i <= MAX_FAILURES; i++) {
    await refreshOne(row(id), fake(new Error('connect ECONNREFUSED')), NOW);
    assert.equal(stateOf(id).paused, i >= MAX_FAILURES);
  }
  assert.equal(stateOf(id).lastError, 'connect ECONNREFUSED');
  assert.ok(!due(NOW + 3600).some((d) => d.id === id));
  clear(id);
  const id2 = linked(conn(5));
  await refreshOne({ ...row(id2), version: 99 }, fake(GEN2), NOW); // saved by someone else meanwhile
  assert.equal(stateOf(id2), null);
});

test('a disabled owner or a lost connection is an error, not a refresh', async () => {
  const other = await createUser({ email: 'x@example.com', password: 'long-enough-pass', name: 'X', role: 'member' });
  const id = dg.create(other.id, { title: 'T', dbml: GEN1 });
  dg.update(id, { source: { connId: conn(5), schemas: ['shop'] } }, { includeSource: true }); // a connection of another account
  await refreshOne(row(id), fake(GEN2), NOW);
  assert.match(stateOf(id).lastError, /no longer has access/);
  const mine = linked(conn(5));
  db.prepare('update users set disabled = 1 where id = ?').run(owner.id);
  await refreshOne(row(mine), fake(GEN2), NOW);
  assert.match(stateOf(mine).lastError, /disabled/);
  db.prepare('update users set disabled = 0 where id = ?').run(owner.id);
});

test('tick skips a diagram somebody is editing and refreshes the others; a shared connection is audited', async () => {
  const c = conn(5);
  db.prepare('update connections set shared = 1 where id = ?').run(c);
  store.setAccess(c, { users: [owner.id] }); // the owner may use it (if the grant goes away the diagram is paused with an error: tested above)
  const busy = linked(c, { gen: genHash(GEN1) }), calm = linked(c, { gen: genHash(GEN1) });
  presence.beat(busy, 't1', { key: 99, name: 'Cy' }, { editing: true });
  await tick(fake(GEN2), Math.floor(Date.now() / 1000) + 7200);
  assert.match(row(calm).dbml, /shop\.c/);
  assert.ok(!/shop\.c/.test(row(busy).dbml)); // the busy one is tried again next minute
  const log = audit.list({ diagramId: calm })[0];
  assert.equal(log.action, 'connection.refresh');
  assert.match(log.detail, /^scheduled: /);
});

test('the scheduled refresh never changes the table selection of the diagram, and says when a chosen table is gone', async () => {
  const sel = ['shop.a', 'shop.gone'];
  const id = dg.create(owner.id, { title: 'T', dbml: GEN1 });
  dg.update(id, { source: { connId: conn(5), schemas: ['shop'], tables: sel, at: 0, gen: 'old' } }, { includeSource: true });
  const deps = { resolve: async (b, user) => store.getForUse(user, b.id), generate: async () => ({ dbml: GEN2, at: NOW * 1000, missing: ['shop.gone'] }) };
  await refreshOne(row(id), deps, NOW);
  const src = JSON.parse(row(id).source);
  assert.deepEqual(src.tables, sel); // untouched: [] = all stays all, a list stays that list
  assert.deepEqual(src.schemas, ['shop']);
  assert.equal(src.gen, genHash(GEN2));
});
test('the scheduled refresh keeps "all" as "all"', async () => {
  const id = dg.create(owner.id, { title: 'T', dbml: GEN1 });
  dg.update(id, { source: { connId: conn(5), schemas: ['shop'], tables: [], at: 0, gen: 'old' } }, { includeSource: true });
  await refreshOne(row(id), fake(GEN2), NOW);
  assert.deepEqual(JSON.parse(row(id).source).tables, []);
});
