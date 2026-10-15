import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import * as auth from '../src/auth.js';
import * as admin from '../src/admin.js';
import * as store from '../src/store.js';
import * as dg from '../src/diagrams.js';

const root = await auth.createUser({ email: 'root@example.com', password: 'long-enough-pass', role: 'admin' });
const second = await auth.createUser({ email: 'second@example.com', password: 'long-enough-pass', role: 'admin' });
const ana = await auth.createUser({ email: 'ana@example.com', password: 'long-enough-pass', name: 'Ana Souza' });
const conn = { name: 'c', type: 'postgres', host: 'h', port: 5432, database: 'd', user: 'u', password: 'p' };

test('createUser: temporary password is generated, shown once, and forces a change', async () => {
  const { user, tempPassword } = await admin.createUser({ email: 'new@example.com', name: 'New' });
  assert.ok(tempPassword);
  assert.equal(user.mustChangePassword, true);
  const { tempPassword: none } = await admin.createUser({ email: 'given@example.com', password: 'chosen-password-1' });
  assert.equal(none, undefined);
});

test('the last active administrator cannot be demoted, disabled or deleted', () => {
  admin.updateUser(second.id, { role: 'member' }); // two administrators: one may be demoted
  assert.equal(auth.userById(second.id).role, 'member');
  assert.throws(() => admin.updateUser(root.id, { role: 'member' }), /at least one active administrator/);
  assert.throws(() => admin.updateUser(root.id, { disabled: true }), { statusCode: 400 });
  assert.throws(() => admin.deleteUser(root.id, root.id), { statusCode: 400 });
  assert.equal(auth.userById(root.id).role, 'admin');
});

test('a disabled administrator does not count as active', () => {
  admin.updateUser(second.id, { role: 'admin' });
  admin.updateUser(second.id, { disabled: true }); // two administrators: fine
  assert.throws(() => admin.updateUser(root.id, { role: 'member' }), { statusCode: 400 }); // root is now the only active one
  admin.updateUser(second.id, { disabled: false });
  admin.updateUser(root.id, { role: 'member' }); // allowed again
  admin.updateUser(root.id, { role: 'admin' });
});

test('updateUser: validation; disabling ends the sessions', () => {
  assert.throws(() => admin.updateUser(ana.id, { role: 'root' }), { statusCode: 400 });
  assert.throws(() => admin.updateUser(ana.id, { name: '  ' }), { statusCode: 400 });
  assert.throws(() => admin.updateUser(9999, {}), { statusCode: 404 });
  const t = auth.createSession(ana.id);
  admin.updateUser(ana.id, { disabled: true });
  assert.equal(auth.userFromRequest({ headers: { cookie: `sid=${t}` } }), null);
  admin.updateUser(ana.id, { disabled: false, name: 'Ana S.' });
  assert.equal(auth.userById(ana.id).name, 'Ana S.');
});

test('deleteUser: shared connections move to the acting administrator, grants of the user disappear, private data goes', () => {
  const victim = db.prepare("select id from users where email = 'new@example.com'").get().id;
  const shared = store.upsert(victim, conn, { shared: true });
  const priv = store.upsert(victim, conn);
  const d = dg.create(root.id, { title: 'x' });
  dg.setGrant(root, d, { type: 'user', subjectId: victim, access: 'view' });
  store.setAccess(shared, { users: [victim] });
  admin.deleteUser(victim, root.id);
  assert.equal(db.prepare('select owner_id from connections where id = ?').get(shared).owner_id, root.id);
  assert.equal(db.prepare('select 1 from connections where id = ?').get(priv), undefined);
  assert.equal(dg.listGrants(root, d).length, 0);
  assert.equal(db.prepare('select count(*) n from connection_access where connection_id = ?').get(shared).n, 0);
});

test('groups: unique case-insensitive names, rename, members, delete clears grants', () => {
  const g = admin.createGroup('  Analytics ');
  assert.throws(() => admin.createGroup('analytics'), { statusCode: 409 });
  assert.throws(() => admin.createGroup('   '), { statusCode: 400 });
  assert.throws(() => admin.createGroup('x'.repeat(81)), { statusCode: 400 });
  const other = admin.createGroup('Other');
  assert.throws(() => admin.renameGroup(other, 'ANALYTICS'), { statusCode: 409 });
  admin.renameGroup(other, 'Other 2');
  assert.throws(() => admin.renameGroup(9999, 'zzz'), { statusCode: 404 });
  admin.addMember(g, ana.id);
  admin.addMember(g, ana.id); // idempotent
  assert.equal(admin.listGroups().find((x) => x.id === g).members.length, 1);
  assert.equal(auth.groupsOf(ana.id)[0].name, 'Analytics');
  assert.throws(() => admin.addMember(9999, ana.id), { statusCode: 404 });
  assert.throws(() => admin.addMember(g, 9999), { statusCode: 404 });
  const d = dg.create(root.id, { title: 'y' });
  dg.setGrant(root, d, { type: 'group', subjectId: g, access: 'edit' });
  assert.equal(dg.roleFor(ana, db.prepare('select * from diagrams where id = ?').get(d)), 'edit');
  admin.deleteGroup(g);
  assert.equal(dg.roleFor(ana, db.prepare('select * from diagrams where id = ?').get(d)), null);
  assert.throws(() => admin.deleteGroup(g), { statusCode: 404 });
  admin.removeMember(other, ana.id); // not a member: no error
});

test('settings: org name is trimmed and cut, sign-up flag stored, env override reported', () => {
  assert.equal(admin.putSettings({ orgName: `  ${'o'.repeat(100)} `, allowSignup: true }).orgName.length, 80);
  assert.equal(admin.getSettings().allowSignup, true);
  process.env.ALLOW_SIGNUP = '0';
  assert.equal(admin.getSettings().signupForcedBy, '0');
  delete process.env.ALLOW_SIGNUP;
  assert.equal(admin.getSettings().signupForcedBy, null);
});

test('directory search: 2+ characters, skips yourself and disabled people, LIKE wildcards are literal', () => {
  assert.deepEqual(admin.searchUsers('a', root.id), []);
  assert.deepEqual(admin.searchUsers('ana', root.id).map((u) => u.email), ['ana@example.com']);
  assert.deepEqual(admin.searchUsers('ana', ana.id), []);
  assert.deepEqual(admin.searchUsers('%%', root.id), []);
  admin.updateUser(ana.id, { disabled: true });
  assert.deepEqual(admin.searchUsers('ana', root.id), []);
});
