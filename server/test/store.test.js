import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import { createUser } from '../src/auth.js';
import * as store from '../src/store.js';

const mk = (email, role = 'member') => createUser({ email, password: 'long-enough-pass', name: email.split('@')[0], role });
const admin = await mk('admin@example.com', 'admin'), ana = await mk('ana@example.com'), bob = await mk('bob@example.com'), cy = await mk('cy@example.com');
db.prepare("insert into groups (id, name, created_at) values (1, 'Analytics', 0)").run();
db.prepare('insert into group_members (group_id, user_id) values (1, ?)').run(cy.id);
const conn = { name: 'db', type: 'postgres', host: 'h', port: 5432, database: 'd', user: 'reader', password: 'p4ss', tls: 'off' };

test('secrets are encrypted at rest and decrypted only by get(); list() never has them', () => {
  const id = store.upsert(ana.id, { ...conn, caPem: 'PEMDATA' });
  const raw = db.prepare('select password, ca_pem from connections where id = ?').get(id);
  assert.ok(!raw.password.includes('p4ss') && !raw.ca_pem.includes('PEMDATA'));
  const got = store.get(ana.id, id);
  assert.equal(got.password, 'p4ss');
  assert.equal(got.caPem, 'PEMDATA');
  const [l] = store.list(ana.id);
  assert.equal(l.hasCa, true);
  assert.ok(!('password' in l) && !('caPem' in l));
  assert.ok(!JSON.stringify(store.listFor(ana)).includes('p4ss'));
});

test('upsert: empty secret keeps the stored one, null clears it', () => {
  const id = store.upsert(ana.id, { ...conn, name: 'keep' });
  store.upsert(ana.id, { ...conn, id, password: '', name: 'renamed' });
  assert.equal(store.get(ana.id, id).password, 'p4ss');
  assert.equal(store.get(ana.id, id).name, 'renamed');
  store.upsert(ana.id, { ...conn, id, password: null });
  assert.equal(store.get(ana.id, id).password, '');
  store.upsert(ana.id, { ...conn, id, password: 'new' });
  assert.equal(store.get(ana.id, id).password, 'new');
});

test('a private connection belongs to its owner only', () => {
  const id = store.upsert(ana.id, { ...conn, name: 'mine' });
  assert.equal(store.get(bob.id, id), null);
  assert.equal(store.getForUse(bob, id), null);
  assert.throws(() => store.upsert(bob.id, { ...conn, id }), { statusCode: 404 });
  assert.equal(store.remove(bob.id, id).changes, 0);
  assert.equal(store.remove(ana.id, id).changes, 1);
});

test('schemas / tables / refresh are kept on update unless new ones are sent', () => {
  const id = store.upsert(ana.id, { ...conn, name: 'sel', schemas: ['shop'], tables: ['shop.a'], refreshMinutes: 5 });
  store.upsert(ana.id, { ...conn, id, name: 'sel' });
  const c = store.get(ana.id, id);
  assert.deepEqual([c.schemas, c.tables, c.refreshMinutes], [['shop'], ['shop.a'], 0]); // refreshMinutes is replaced (0), the lists are kept
});

test('shared connection: only people with a grant (direct or through a group) and administrators may use it', () => {
  const id = store.upsert(admin.id, { ...conn, name: 'shared one', user: 'secret-user' }, { shared: true });
  assert.equal(store.canUseShared(ana, id), false);
  assert.equal(store.canUseShared(admin, id), true);
  assert.equal(store.canUseShared(ana, undefined), false);
  store.setAccess(id, { users: [ana.id], groups: [1] });
  assert.equal(store.canUseShared(ana, id), true);
  assert.equal(store.canUseShared(cy, id), true); // through the group
  assert.equal(store.canUseShared(bob, id), false);
  store.setAccess(id, { users: [], groups: [] }); // replaces: everybody loses it
  assert.equal(store.canUseShared(ana, id) || store.canUseShared(cy, id), false);
});

test('listFor: members see shared connections they may use, without user / TLS details; administrators see the details', () => {
  const id = store.upsert(admin.id, { ...conn, name: 'listed', user: 'secret-user', serverDn: 'CN=x', blockWritable: true }, { shared: true });
  store.setAccess(id, { users: [ana.id] });
  const asAna = store.listFor(ana).find((c) => c.id === id);
  assert.equal(asAna.shared, true);
  assert.deepEqual([asAna.user, asAna.serverDn, asAna.blockWritable, asAna.hasCa], ['', '', false, false]);
  assert.ok(!JSON.stringify(asAna).includes('p4ss'));
  assert.equal(store.listFor(bob).some((c) => c.id === id), false);
  const asAdmin = store.listFor(admin).find((c) => c.id === id);
  assert.equal(asAdmin.user, 'secret-user');
  assert.equal(asAdmin.managed, true);
  assert.equal(asAna.managed, false);
});

test('getForUse: a shared connection comes with its secrets (server side), a private one of somebody else does not', () => {
  const id = store.upsert(admin.id, { ...conn, name: 'use' }, { shared: true });
  store.setAccess(id, { users: [ana.id] });
  assert.equal(store.getForUse(ana, id).password, 'p4ss');
  assert.equal(store.getForUse(bob, id), null);
});

test('a shared connection cannot be changed or removed through the personal paths', () => {
  const id = store.upsert(admin.id, { ...conn, name: 'locked' }, { shared: true });
  assert.throws(() => store.upsert(admin.id, { ...conn, id }), { statusCode: 404 }); // not shared:true -> not found
  assert.equal(store.remove(admin.id, id).changes, 0);
  assert.equal(store.get(admin.id, id), null);
  assert.equal(store.removeShared(id), 1);
});

test('setAccess: unknown ids are ignored, unknown connection is 404, listShared names the grantees', () => {
  const id = store.upsert(admin.id, { ...conn, name: 'named' }, { shared: true });
  store.setAccess(id, { users: [ana.id, 9999, 'x'], groups: [1, 77] });
  const s = store.listShared().find((c) => c.id === id);
  assert.deepEqual(s.access.map((a) => `${a.type}:${a.name}`).sort(), ['group:Analytics', 'user:ana']);
  assert.throws(() => store.setAccess('nope', {}), { statusCode: 404 });
  const priv = store.upsert(ana.id, { ...conn, name: 'priv' });
  assert.throws(() => store.setAccess(priv, {}), { statusCode: 404 }); // a private connection cannot be shared by granting access
});
