import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import { createUser } from '../src/auth.js';
import * as audit from '../src/audit.js';

const ana = await createUser({ email: 'ana@example.com', password: 'long-enough-pass', name: 'Ana' });
const bob = await createUser({ email: 'bob@example.com', password: 'long-enough-pass', name: 'Bob' });
audit.log(ana, 'connection.import', { target: 'Demo shop', connectionId: 'c1', diagramId: 'd1', detail: '4 tables' });
audit.log(ana, 'connection.test', { target: 'Demo shop', connectionId: 'c1' });
audit.log(bob, 'connection.refresh', { target: 'Other db', connectionId: 'c2', diagramId: 'd2', ok: false, detail: 'timeout' });
audit.log(bob, 'admin.post', { target: '/users', detail: 'ok' });
audit.log(bob, 'admin.delete', { target: '/groups/3' });
audit.log(null, 'admin.put', { target: '/settings' });
const actions = (f) => audit.list(f).map((r) => r.action);

test('newest first, row shape', () => {
  const rows = audit.list();
  assert.equal(rows.length, 6);
  assert.equal(rows[0].action, 'admin.put');
  assert.equal(rows[0].actor, null);
  const imp = rows.find((r) => r.action === 'connection.import');
  assert.deepEqual({ actor: imp.actor, ok: imp.ok, connectionId: imp.connectionId, diagramId: imp.diagramId, detail: imp.detail }, { actor: 'Ana', ok: true, connectionId: 'c1', diagramId: 'd1', detail: '4 tables' });
  assert.equal(rows.find((r) => r.action === 'connection.refresh').ok, false);
});

test('action filter: comma-separated prefixes', () => {
  assert.deepEqual(actions({ action: 'admin' }).sort(), ['admin.delete', 'admin.post', 'admin.put']);
  assert.deepEqual(actions({ action: 'admin.put,admin.patch' }), ['admin.put']);
  assert.deepEqual(actions({ action: 'connection.import' }), ['connection.import']);
  assert.equal(actions({ action: '%' }).length, 6); // wildcards are stripped: an empty filter, not "match everything weirdly"
});

test('actor, connection and diagram filters', () => {
  assert.equal(audit.list({ actorId: ana.id }).length, 2);
  assert.deepEqual(actions({ connectionId: 'c2' }), ['connection.refresh']);
  assert.deepEqual(actions({ diagramId: 'd1' }), ['connection.import']);
});

test('scope filter: administrator actions about users / groups / settings only', () => {
  assert.deepEqual(actions({ scope: 'users' }), ['admin.post']);
  assert.deepEqual(actions({ scope: 'groups' }), ['admin.delete']);
  assert.deepEqual(actions({ scope: 'settings' }), ['admin.put']);
  assert.deepEqual(actions({ scope: 'connections' }), []); // connection use is not an administrator action
});

test('free text over actor, target, detail and diagram id; SQL wildcards are not interpreted', () => {
  assert.equal(audit.list({ q: 'ana' }).length, 2);
  assert.deepEqual(actions({ q: 'timeout' }), ['connection.refresh']);
  assert.deepEqual(actions({ q: 'd2' }), ['connection.refresh']);
  assert.equal(audit.list({ q: '%' }).length, 6); // the % is dropped, leaving an empty pattern
  assert.equal(audit.list({ q: '_' }).length, 6);
});

test('filters combine with AND', () => assert.deepEqual(actions({ actorId: bob.id, action: 'admin', scope: 'users' }), ['admin.post']));

test('paging with before, and the limit is clamped', () => {
  const first = audit.list({ limit: 2 });
  assert.equal(first.length, 2);
  const next = audit.list({ limit: 2, before: first[1].id });
  assert.equal(next.length, 2);
  assert.ok(next[0].id < first[1].id);
  assert.equal(audit.list({ limit: 0 }).length, 6); // 0 is not "no rows": falls back to the default
  assert.equal(audit.list({ limit: -5 }).length, 1);
});

test('since / until in unix seconds', () => {
  assert.equal(audit.list({ since: Math.floor(Date.now() / 1000) + 3600 }).length, 0);
  assert.equal(audit.list({ until: Math.floor(Date.now() / 1000) + 3600 }).length, 6);
});

test('facets: who, which connections, which diagrams', () => {
  const f = audit.facets();
  assert.deepEqual(f.actors.map((a) => a.name).sort(), ['Ana', 'Bob']);
  assert.deepEqual(f.connections.map((c) => c.id).sort(), ['c1', 'c2']);
  assert.equal(f.connections.find((c) => c.id === 'c1').name, 'Demo shop'); // a deleted connection is still named from the log
  assert.deepEqual(f.diagrams.map((d) => d.id).sort(), ['d1', 'd2']);
});

test('csv: header, quoting and formula injection guard', () => {
  const out = audit.csv([{ at: 0, actor: '=cmd|calc', action: 'admin.post', target: 'a "b"', diagramId: null, ok: false, detail: '+1,2' }]);
  const [head, row] = out.trim().split('\n');
  assert.equal(head, 'time (UTC),actor,action,target,diagram,ok,detail');
  assert.equal(row, '"1970-01-01T00:00:00.000Z","\'=cmd|calc","admin.post","a ""b""","","no","\'+1,2"');
});

test('detail is cut at 300 characters; a failing insert never throws', () => {
  audit.log(ana, 'x.long', { detail: 'z'.repeat(1000) });
  assert.equal(audit.list({ action: 'x.long' })[0].detail.length, 300);
  assert.doesNotThrow(() => audit.log(ana, null)); // action is not null: swallowed
});

test('purge removes only entries older than the retention', () => {
  db.prepare("insert into audit_log (at, action) values (1, 'old.entry')").run();
  assert.equal(audit.purge(), 1);
  assert.equal(audit.list({ action: 'old.entry' }).length, 0);
});
