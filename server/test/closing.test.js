import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import * as auth from '../src/auth.js';
import * as admin from '../src/admin.js';
import * as dg from '../src/diagrams.js';
import * as store from '../src/store.js';
import * as audit from '../src/audit.js';

const PW = 'long-enough-pass';
const mk = (email, role = 'member') => auth.createUser({ email, password: PW, role, name: email.split('@')[0] });
const boss = await mk('boss@example.com', 'admin'), other = await mk('other@example.com'), friend = await mk('friend@example.com');
db.prepare("insert into groups (id, name, created_at) values (1, 'Team', 0)").run();
const gone = await mk('leaving@example.com');
const conn = { name: 'p', type: 'postgres', host: 'h', port: 5432, database: 'd', user: 'u', password: 'x' };
const mine = dg.create(gone.id, { title: 'Mine', dbml: 'Table a { id int }' });
const priv = store.upsert(gone.id, conn), shared = store.upsert(gone.id, conn, { shared: true });
dg.update(mine, { source: { connId: priv, schemas: ['s'] } }, { includeSource: true });
dg.setGrant(gone, mine, { type: 'user', subjectId: friend.id, access: 'edit' });
const link = dg.createShare(gone, mine, 'view');
const token = auth.createSession(gone.id);
db.prepare('insert into group_members (group_id, user_id) values (1, ?)').run(gone.id);

test('closing an account: signed out, private connections gone, diagrams kept but unreachable, shared connections move to an administrator', () => {
  admin.closeAccount(gone.id);
  assert.equal(auth.userFromRequest({ headers: { cookie: `sid=${token}` } }), null);
  assert.equal(db.prepare('select count(*) n from connections where id = ?').get(priv).n, 0);
  assert.equal(db.prepare('select owner_id from connections where id = ?').get(shared).owner_id, boss.id);
  assert.equal(dg.shareByToken(link.token), null); // its links are gone
  assert.throws(() => dg.getForUser(friend, mine), { statusCode: 404 }); // and the grants
  assert.ok(dg.getForUser(boss, mine)); // administrators still see it
  assert.ok(!admin.listUsers().some((u) => u.id === gone.id)); // the account is not in the list any more
  assert.equal(db.prepare('select count(*) n from group_members where user_id = ?').get(gone.id).n, 0);
});
test('the e-mail is free again and the old password no longer works', async () => {
  await assert.rejects(auth.login({ email: 'leaving@example.com', password: PW }, '3.3.3.3'), { statusCode: 401 });
  assert.ok(await mk('leaving@example.com')); // a new account with the same e-mail
});
test('closing the last administrator is refused', () => assert.throws(() => admin.closeAccount(boss.id), { statusCode: 400 }));

test('the waiting list: diagram, former owner, when it will be deleted', () => {
  const l = admin.listClosed();
  assert.equal(l.length, 1);
  assert.deepEqual([l[0].id, l[0].title, l[0].formerOwner], [mine, 'Mine', 'leaving']);
  assert.equal(l[0].deletesAt - l[0].closedAt, 7 * 86400);
});
test('adopt: a person gets it, a group gets edit access, a link to a private connection is dropped; only closed diagrams can be adopted', () => {
  assert.throws(() => admin.adoptClosed(dg.create(other.id, { title: 'x' }), friend.id, null, dg), { statusCode: 404 });
  assert.throws(() => admin.adoptClosed(mine, 9999, null, dg), { statusCode: 404 });
  assert.throws(() => admin.adoptClosed(mine, friend.id, 9999, dg), { statusCode: 404 });
  admin.adoptClosed(mine, friend.id, 1, dg);
  const d = dg.getForUser(friend, mine);
  assert.equal(d.role, 'owner');
  assert.equal(d.source, null);
  assert.deepEqual(dg.listGrants(friend, mine).map((g) => [g.type, g.access]), [['group', 'edit']]);
  assert.equal(admin.listClosed().length, 0);
});
test('delete now and purge after 7 days: the account and what is left of it go; the diagrams of a person who was not closed are untouched', async () => {
  const a = await mk('a@example.com'), b = await mk('b@example.com');
  const da = dg.create(a.id, { title: 'A' }), db2 = dg.create(b.id, { title: 'B' });
  admin.closeAccount(a.id);
  assert.throws(() => admin.deleteClosed(db2), { statusCode: 404 }); // only waiting diagrams
  assert.deepEqual(admin.purgeClosed(), []); // too early
  const c = await mk('c@example.com'), dc = dg.create(c.id, { title: 'C' });
  admin.closeAccount(c.id);
  admin.deleteClosed(dc); // an administrator deletes it before the 7 days
  assert.equal(admin.listClosed().length, 1);
  const t = Math.floor(Date.now() / 1000) + 7 * 86400 + 60;
  const out = admin.purgeClosed(t);
  assert.deepEqual(out.map((u) => [u.name, u.diagrams]).sort(), [['a', 1], ['c', 0], ['leaving', 0]]); // (the others closed above are purged too: their diagrams were handed over or deleted)
  assert.equal(db.prepare('select count(*) n from diagrams where id = ?').get(da).n, 0);
  assert.equal(db.prepare('select count(*) n from diagrams where id = ?').get(db2).n, 1);
});
test('audit: failed sign-ins have their own cap', () => {
  for (let i = 0; i < 3; i++) audit.log(null, 'auth.login_failed', { target: `x${i}`, ok: false });
  audit.log(null, 'auth.login', {});
  assert.equal(audit.purge(), 0);
});
