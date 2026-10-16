import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import * as auth from '../src/auth.js';

const PW = 'long-enough-pass', NEW = 'a brand new password';
const mk = (email) => auth.createUser({ email, password: PW });
const withKey = async (email) => { const u = await mk(email); return { u, key: await auth.createRecoveryKey(u.id, PW) }; };

test('a key needs the current password; it is shown once, in groups, and only its hash is stored', async () => {
  const u = await mk('a@example.com');
  assert.deepEqual(auth.recoveryStatus(u.id), { has: false, createdAt: null });
  await assert.rejects(auth.createRecoveryKey(u.id, 'wrong password!!'), { statusCode: 403 });
  const key = await auth.createRecoveryKey(u.id, PW);
  assert.match(key, /^rk-([0-9a-f]{5}-){7}[0-9a-f]{5}$/);
  assert.equal(auth.recoveryStatus(u.id).has, true);
  const row = db.prepare('select recovery_hash h from users where id = ?').get(u.id);
  assert.ok(row.h && !key.includes(row.h) && !row.h.includes(key.replace(/[^0-9a-f]/g, '').slice(2)));
});

test('recovering: any spelling of the key works once, picks the new password, ends every session, and the key is used up', async () => {
  const { u, key } = await withKey('b@example.com');
  const t = auth.createSession(u.id);
  const sloppy = ` ${key.toUpperCase().replaceAll('-', ' ')} `;
  const back = await auth.recoverPassword({ email: ' B@Example.com ', key: sloppy, next: NEW }, '1.1.1.1');
  assert.equal(back.id, u.id);
  assert.equal(auth.userFromRequest({ headers: { cookie: `sid=${t}` } }), null);
  await assert.rejects(auth.login({ email: 'b@example.com', password: PW }, '1.1.1.1'), { statusCode: 401 });
  assert.ok(await auth.login({ email: 'b@example.com', password: NEW }, '1.1.1.1'));
  assert.equal(auth.recoveryStatus(u.id).has, false);
  await assert.rejects(auth.recoverPassword({ email: 'b@example.com', key, next: 'another new password' }, '1.1.1.1'), { statusCode: 401 }); // used up
});

test('unknown e-mail, wrong key, no key, disabled and closed accounts all get the same answer', async () => {
  const { u, key } = await withKey('c@example.com');
  const none = await mk('nokey@example.com'), off = await withKey('off@example.com'), shut = await withKey('shut@example.com');
  db.prepare('update users set disabled = 1 where id = ?').run(off.u.id);
  db.prepare('update users set deleted_at = 1 where id = ?').run(shut.u.id);
  const msgs = [];
  for (const [email, k] of [['ghost@example.com', key], ['c@example.com', 'rk-00000-00000-00000-00000-00000-00000-00000-00000'], [none.email, key], [off.u.email, off.key], [shut.u.email, shut.key], ['c@example.com', '']]) {
    await assert.rejects(auth.recoverPassword({ email, key: k, next: NEW }, '2.2.2.2'), (e) => { msgs.push(e.message); return e.statusCode === 401; });
  }
  assert.equal(new Set(msgs).size, 1);
  assert.equal(auth.recoveryStatus(u.id).has, true); // nothing was consumed
});

test('a weak new password is refused and the key is not used up', async () => {
  const { u, key } = await withKey('d@example.com');
  await assert.rejects(auth.recoverPassword({ email: 'd@example.com', key, next: 'short' }, '3.3.3.3'), { statusCode: 400 });
  assert.equal(auth.recoveryStatus(u.id).has, true);
  assert.ok(await auth.recoverPassword({ email: 'd@example.com', key, next: NEW }, '3.3.3.3'));
});

test('guessing is limited per address+e-mail and per e-mail (many addresses do not help), even for the right key', async () => {
  const { key } = await withKey('e@example.com');
  for (let i = 0; i < 8; i++) await assert.rejects(auth.recoverPassword({ email: 'e@example.com', key: 'rk-ffff', next: NEW }, `9.9.9.${i}`), { statusCode: 401 });
  await assert.rejects(auth.recoverPassword({ email: 'e@example.com', key, next: NEW }, '9.9.9.200'), { statusCode: 429 }); // a new address, same e-mail
  db.prepare('update throttle set until = 1').run();
  assert.ok(await auth.recoverPassword({ email: 'e@example.com', key, next: NEW }, '9.9.9.200'));
});

test('a new key replaces the old one; removing it leaves none; an administrator reset voids it', async () => {
  const { u, key } = await withKey('f@example.com');
  const key2 = await auth.createRecoveryKey(u.id, PW);
  assert.notEqual(key, key2);
  await assert.rejects(auth.recoverPassword({ email: 'f@example.com', key, next: NEW }, '4.4.4.4'), { statusCode: 401 });
  auth.removeRecoveryKey(u.id);
  assert.equal(auth.recoveryStatus(u.id).has, false);
  const k3 = await auth.createRecoveryKey(u.id, PW);
  await auth.adminSetPassword(u.id);
  assert.equal(auth.recoveryStatus(u.id).has, false);
  await assert.rejects(auth.recoverPassword({ email: 'f@example.com', key: k3, next: NEW }, '4.4.4.4'), { statusCode: 401 });
});
