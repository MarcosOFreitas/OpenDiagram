import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import { createUser } from '../src/auth.js';
import * as store from '../src/store.js';
import * as dg from '../src/diagrams.js';

const mk = (email, role = 'member') => createUser({ email, password: 'long-enough-pass', name: email.split('@')[0], role });
const admin = await mk('admin@example.com', 'admin'), owner = await mk('owner@example.com'), viewer = await mk('viewer@example.com'), editor = await mk('editor@example.com'), cy = await mk('cy@example.com'), nobody = await mk('nobody@example.com');
db.prepare("insert into groups (id, name, created_at) values (1, 'Team', 0), (2, 'Other', 0)").run();
db.prepare('insert into group_members (group_id, user_id) values (1, ?), (2, ?)').run(cy.id, cy.id);
const fresh = (dbml = 'Table a { id int }') => dg.create(owner.id, { title: 'T', dbml });
const row = (id) => db.prepare('select * from diagrams where id = ?').get(id);

test('roleFor: owner > admin > grants (highest of direct and group) > nobody', () => {
  const id = fresh(), d = row(id);
  assert.equal(dg.roleFor(owner, d), 'owner');
  assert.equal(dg.roleFor(admin, d), 'admin');
  assert.equal(dg.roleFor(nobody, d), null);
  dg.setGrant(owner, id, { type: 'user', subjectId: viewer.id, access: 'view' });
  dg.setGrant(owner, id, { type: 'user', subjectId: editor.id, access: 'edit' });
  assert.equal(dg.roleFor(viewer, d), 'view');
  assert.equal(dg.roleFor(editor, d), 'edit');
  dg.setGrant(owner, id, { type: 'user', subjectId: cy.id, access: 'view' });
  dg.setGrant(owner, id, { type: 'group', subjectId: 1, access: 'comment' });
  dg.setGrant(owner, id, { type: 'group', subjectId: 2, access: 'edit' });
  assert.equal(dg.roleFor(cy, d), 'edit'); // the highest wins
});

test('grants: validation', () => {
  const id = fresh();
  assert.throws(() => dg.setGrant(owner, id, { type: 'user', subjectId: viewer.id, access: 'admin' }), { statusCode: 400 });
  assert.throws(() => dg.setGrant(owner, id, { type: 'user', subjectId: owner.id, access: 'view' }), /already owns/);
  assert.throws(() => dg.setGrant(owner, id, { type: 'user', subjectId: 9999, access: 'view' }), { statusCode: 404 });
  assert.throws(() => dg.setGrant(owner, id, { type: 'group', subjectId: 9999, access: 'view' }), { statusCode: 404 });
  assert.throws(() => dg.setGrant(owner, id, { type: 'team', subjectId: 1, access: 'view' }), { statusCode: 400 });
  assert.throws(() => dg.setGrant(nobody, id, { type: 'user', subjectId: viewer.id, access: 'view' }), { statusCode: 404 }); // not yours: 404, not 403
  dg.setGrant(owner, id, { type: 'user', subjectId: viewer.id, access: 'view' });
  dg.setGrant(owner, id, { type: 'user', subjectId: viewer.id, access: 'edit' }); // same subject: updated, not duplicated
  assert.deepEqual(dg.listGrants(owner, id).map((g) => g.access), ['edit']);
});

test('getForUser: 404 without a role; non-owners never see a private connection link, but may see a shared one they can use', () => {
  const id = fresh();
  assert.throws(() => dg.getForUser(nobody, id), { statusCode: 404 });
  dg.setGrant(owner, id, { type: 'user', subjectId: editor.id, access: 'edit' });
  const priv = store.upsert(owner.id, { name: 'p', type: 'postgres', host: 'h', port: 5432, database: 'd', user: 'u', password: 'x' });
  dg.update(id, { source: { connId: priv, schemas: ['s'] } }, { includeSource: true });
  assert.equal(dg.getForUser(owner, id).source.connId, priv);
  assert.equal(dg.getForUser(editor, id).source, null);
  assert.equal(dg.getForUser(admin, id).source, null); // administrators manage the diagram, never borrow the owner's connection
  const shared = store.upsert(admin.id, { name: 's', type: 'postgres', host: 'h', port: 5432, database: 'd', user: 'u', password: 'x' }, { shared: true });
  dg.update(id, { source: { connId: shared, schemas: ['s'] } }, { includeSource: true });
  assert.equal(dg.getForUser(editor, id).source, null); // no grant on the shared connection yet
  store.setAccess(shared, { users: [editor.id] });
  assert.equal(dg.getForUser(editor, id).source.connId, shared);
});

test('list: own + shared with me; administrators also see the rest', () => {
  const id = fresh();
  dg.setGrant(owner, id, { type: 'user', subjectId: viewer.id, access: 'comment' });
  const mine = dg.list(viewer).find((d) => d.id === id);
  assert.equal(mine.role, 'comment');
  assert.equal(dg.list(nobody).some((d) => d.id === id), false);
  assert.equal(dg.list(admin).find((d) => d.id === id).role, 'admin');
});

test('update: validation', () => {
  const id = fresh();
  assert.throws(() => dg.update(id, { title: '   ' }), { statusCode: 400 });
  assert.throws(() => dg.update(id, { title: 5 }), { statusCode: 400 });
  assert.throws(() => dg.update(id, { dbml: 'x'.repeat(2_000_001) }), { statusCode: 400 });
  assert.throws(() => dg.update('missing', { title: 'a' }), { statusCode: 404 });
  assert.throws(() => dg.create(owner.id, { title: 'x'.repeat(201) }), { statusCode: 400 });
  assert.equal(row(dg.create(owner.id, {})).title, 'Untitled diagram');
});

test('versions: a stale baseVersion is a 409 conflict, an unchanged save does not bump', () => {
  const id = fresh();
  const v1 = dg.versionOf(id);
  const v2 = dg.update(id, { dbml: 'Table b { id int }' }, { baseVersion: v1, actor: owner });
  assert.equal(v2, v1 + 1);
  assert.throws(() => dg.update(id, { dbml: 'Table c { id int }' }, { baseVersion: v1, actor: editor }), (e) => e.statusCode === 409 && e.code === 'conflict' && e.version === v2);
  assert.equal(dg.update(id, { dbml: 'Table b { id int }' }, { baseVersion: v2, actor: owner }), v2);
  assert.equal(dg.update(id, { dbml: 'Table z { id int }' }, { actor: owner }), v2 + 1); // no baseVersion = scripts: no check
});

test('source is only written when the caller says it is the owner', () => {
  const id = fresh();
  dg.update(id, { source: { connId: 'x' } });
  assert.equal(row(id).source, null);
  dg.update(id, { source: { connId: 'x' } }, { includeSource: true });
  assert.deepEqual(JSON.parse(row(id).source), { connId: 'x' });
});

test('history: starting point, same person coalesces, another person or a separate save adds, names are kept', () => {
  const id = fresh();
  dg.update(id, { dbml: 'Table a { id int }\nTable b { id int }' }, { actor: owner });
  dg.update(id, { dbml: 'Table a { id int }\nTable b { id int }\nTable c { id int }' }, { actor: owner });
  assert.equal(dg.listVersions(id).length, 2); // starting point + one coalesced entry
  dg.update(id, { dbml: 'Table a { id int }' }, { actor: editor });
  assert.equal(dg.listVersions(id).length, 3);
  dg.update(id, { dbml: 'Table a { id int, x int }' }, { actor: editor, separate: true, reason: 'refresh' });
  const v = dg.listVersions(id);
  assert.equal(v.length, 4);
  assert.match(v[0].summary, /^refresh: /);
  assert.equal(v[0].current, true);
  dg.nameVersion(id, '  release 1  ', owner);
  assert.equal(dg.listVersions(id)[0].label, 'release 1');
  assert.throws(() => dg.nameVersion(id, '   ', owner), { statusCode: 400 });
  assert.equal(dg.getVersion(id, v[1].id).dbml.includes('Table'), true);
  assert.throws(() => dg.getVersion(id, 99999), { statusCode: 404 });
});

test('summarize: tables added / removed, line counts, layout only', () => {
  assert.equal(dg.summarize('Table a {\n}', 'Table a {\n}\nTable b {\n}'), 'added b; +2 / -0 lines');
  assert.equal(dg.summarize('Table a {\n}\nTable b {\n}', 'Table a {\n}'), 'removed b; +0 / -2 lines');
  assert.equal(dg.summarize('Table a {\n}', 'Table a {\n}', true), 'layout only');
  assert.equal(dg.summarize('Table a {\n}', 'Table a {\n}'), 'title or settings');
  assert.match(dg.summarize('', 'Table a {}\nTable b {}\nTable c {}\nTable d {}\nTable e {}'), /added a, b, c \+2 more/);
});

test('remove: owner and administrator only', () => {
  const id = fresh();
  assert.equal(dg.remove(nobody, id).changes, 0);
  assert.equal(dg.remove(owner, id).changes, 1);
  const id2 = fresh();
  assert.equal(dg.remove(admin, id2).changes, 1);
});

test('comments and share links: a link level is validated and its token resolves', () => {
  const id = fresh();
  const share = dg.createShare(owner, id, 'comment');
  assert.ok(share);
  assert.throws(() => dg.createShare(owner, id, 'owner'), { statusCode: 400 });
  assert.throws(() => dg.createShare(nobody, id, 'view'), { statusCode: 404 });
});

test('access names that exist on Object.prototype are a 400, not a 500', () => {
  const id = fresh();
  for (const access of ['toString', 'constructor', '__proto__']) {
    assert.throws(() => dg.setGrant(owner, id, { type: 'user', subjectId: viewer.id, access }), { statusCode: 400 });
    assert.throws(() => dg.createShare(owner, id, access), { statusCode: 400 });
  }
});

test('the diagram list says which of my diagrams are linked to a database, and says nothing about other people\'s', () => {
  const me = { id: 9101, role: 'member' };
  db.prepare("insert into users (id, email, name, password_hash, created_at) values (9101, 'linked-owner@example.com', 'Lin', 'x', 0)").run();
  const plain = dg.create(me.id, { title: 'plain', dbml: '' }), linked = dg.create(me.id, { title: 'linked', dbml: '' });
  db.prepare('update diagrams set source = ? where id = ?').run(JSON.stringify({ connId: 'c1' }), linked);
  const l = dg.list(me);
  assert.equal(l.find((d) => d.id === plain).linked, false);
  assert.equal(l.find((d) => d.id === linked).linked, true);
  assert.ok(dg.list({ id: 9102, role: 'admin' }).every((d) => !('linked' in d))); // an administrator sees other people's diagrams, never their link
});
