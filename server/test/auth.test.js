import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as auth from '../src/auth.js';

const PW = 'long-enough-pass';

test('validPassword: 10 to 200 characters', () => {
  assert.throws(() => auth.validPassword('short'), { statusCode: 400 });
  assert.throws(() => auth.validPassword('x'.repeat(201)), { statusCode: 400 });
  assert.throws(() => auth.validPassword(12345678901), { statusCode: 400 });
  assert.doesNotThrow(() => auth.validPassword('x'.repeat(10)));
  assert.doesNotThrow(() => auth.validPassword('x'.repeat(200)));
});

test('tempPassword is valid and different every time', () => {
  const a = auth.tempPassword(), b = auth.tempPassword();
  assert.notEqual(a, b);
  assert.doesNotThrow(() => auth.validPassword(a));
});

test('the first account is the administrator, sign-up then closes; ALLOW_SIGNUP overrides the setting', async () => {
  assert.equal(auth.signupAllowed(), true);
  const first = await auth.register({ email: 'First@Example.com ', password: PW, name: 'First' }, '1.1.1.1');
  assert.deepEqual([first.role, first.email], ['admin', 'first@example.com']);
  assert.equal(auth.signupAllowed(), false);
  await assert.rejects(auth.register({ email: 'x@example.com', password: PW }, '1.1.1.1'), { statusCode: 403 });
  auth.setSetting('allow_signup', '1');
  assert.equal(auth.signupAllowed(), true);
  process.env.ALLOW_SIGNUP = '0';
  assert.equal(auth.signupAllowed(), false);
  process.env.ALLOW_SIGNUP = '1';
  auth.setSetting('allow_signup', '0');
  assert.equal(auth.signupAllowed(), true);
  delete process.env.ALLOW_SIGNUP;
  assert.equal(auth.signupAllowed(), false);
  const second = await auth.register.call(null, { email: 'second@example.com', password: PW }, '1.1.1.1').catch((e) => e);
  assert.equal(second.statusCode, 403);
});

test('createUser: validation and duplicate e-mail (409)', async () => {
  await assert.rejects(auth.createUser({ email: 'nope', password: PW }), { statusCode: 400 });
  await assert.rejects(auth.createUser({ email: 'a@b.co', password: 'short' }), { statusCode: 400 });
  await assert.rejects(auth.createUser({ email: 'a@b.co', password: PW, role: 'root' }), { statusCode: 400 });
  await auth.createUser({ email: 'dup@example.com', password: PW });
  await assert.rejects(auth.createUser({ email: 'DUP@example.com', password: PW }), { statusCode: 409 });
});

test('login: ok, wrong password and unknown e-mail give the same 401; disabled is 403', async () => {
  await auth.createUser({ email: 'login@example.com', password: PW, name: 'L' });
  const u = await auth.login({ email: ' Login@Example.com', password: PW }, '2.2.2.2');
  assert.equal(u.email, 'login@example.com');
  assert.equal(u.mustChangePassword, false);
  const wrong = await auth.login({ email: 'login@example.com', password: 'wrong-wrong' }, '2.2.2.2').catch((e) => e);
  const none = await auth.login({ email: 'ghost@example.com', password: 'wrong-wrong' }, '2.2.2.2').catch((e) => e);
  assert.deepEqual([wrong.statusCode, none.statusCode, wrong.message], [401, 401, none.message]);
});

test('login throttling: 8 failures lock that ip+e-mail with 429, even for the right password; a success resets the count', async () => {
  await auth.createUser({ email: 'throttle@example.com', password: PW });
  for (let i = 0; i < 7; i++) await assert.rejects(auth.login({ email: 'throttle@example.com', password: 'bad-bad-bad' }, '3.3.3.3'), { statusCode: 401 });
  await auth.login({ email: 'throttle@example.com', password: PW }, '3.3.3.3'); // 7 failures, then a success: reset
  for (let i = 0; i < 8; i++) await assert.rejects(auth.login({ email: 'throttle@example.com', password: 'bad-bad-bad' }, '3.3.3.3'), { statusCode: 401 });
  await assert.rejects(auth.login({ email: 'throttle@example.com', password: PW }, '3.3.3.3'), { statusCode: 429 });
  await auth.login({ email: 'throttle@example.com', password: PW }, '4.4.4.4'); // another ip is not locked
});

test('limiter helpers used by share-link passwords', () => {
  assert.ok(!auth.isLimited('k1'));
  for (let i = 0; i < 3; i++) auth.recordFail('k1');
  assert.equal(auth.isLimited('k1', 3), true);
  assert.ok(!auth.isLimited('k1', 4));
});

test('secrets: hash differs per call, verify accepts only the right one, a foreign format is refused', async () => {
  const a = await auth.hashSecret('pass'), b = await auth.hashSecret('pass');
  assert.notEqual(a, b);
  assert.equal(await auth.verifySecret('pass', a), true);
  assert.equal(await auth.verifySecret('other', a), false);
  assert.equal(await auth.verifySecret('pass', 'md5$x$y'), false);
});

test('changePassword: current must match, new must differ and be valid; other sessions end, the kept one stays', async () => {
  const u = await auth.createUser({ email: 'chg@example.com', password: PW, mustChange: true });
  assert.equal(u.mustChangePassword, true);
  const keep = auth.createSession(u.id), other = auth.createSession(u.id);
  await assert.rejects(auth.changePassword(u.id, { current: 'nope-nope-nope', next: 'brand-new-pass-1' }, keep), { statusCode: 403 });
  await assert.rejects(auth.changePassword(u.id, { current: PW, next: PW }, keep), { statusCode: 400 });
  await assert.rejects(auth.changePassword(u.id, { current: PW, next: 'short' }, keep), { statusCode: 400 });
  await auth.changePassword(u.id, { current: PW, next: 'brand-new-pass-1' }, keep);
  assert.equal(auth.userById(u.id).mustChangePassword, false);
  const req = (t) => ({ headers: { cookie: `sid=${t}` } });
  assert.equal(auth.userFromRequest(req(keep))?.id, u.id);
  assert.equal(auth.userFromRequest(req(other)), null);
  await auth.login({ email: 'chg@example.com', password: 'brand-new-pass-1' }, '5.5.5.5');
});

test('adminSetPassword: generates one when none is given, forces a change, ends every session', async () => {
  const u = await auth.createUser({ email: 'reset@example.com', password: PW });
  const t = auth.createSession(u.id);
  const pw = await auth.adminSetPassword(u.id);
  assert.doesNotThrow(() => auth.validPassword(pw));
  assert.equal(auth.userById(u.id).mustChangePassword, true);
  assert.equal(auth.userFromRequest({ headers: { cookie: `sid=${t}` } }), null);
  assert.equal((await auth.login({ email: 'reset@example.com', password: pw }, '6.6.6.6')).mustChangePassword, true);
  await assert.rejects(auth.adminSetPassword(u.id, 'short'), { statusCode: 400 });
});

test('sessions: cookie parsing, logout, expiry; a disabled user has no session', async () => {
  const u = await auth.createUser({ email: 'sess@example.com', password: PW });
  const t = auth.createSession(u.id);
  const req = { headers: { cookie: `theme=dark; sid=${t}; x=y` } };
  assert.equal(auth.tokenFromRequest(req), t);
  assert.equal(auth.userFromRequest(req).id, u.id);
  assert.equal(auth.userFromRequest({ headers: {} }), null);
  assert.equal(auth.userFromRequest({ headers: { cookie: 'sid=' } }), null);
  auth.destroySession(t);
  assert.equal(auth.userFromRequest(req), null);
  const t2 = auth.createSession(u.id);
  const { db } = await import('../src/db.js');
  db.prepare('update users set disabled = 1 where id = ?').run(u.id);
  assert.equal(auth.userFromRequest({ headers: { cookie: `sid=${t2}` } }), null);
  await assert.rejects(auth.login({ email: 'sess@example.com', password: PW }, '7.7.7.7'), { statusCode: 403 });
  db.prepare('update users set disabled = 0 where id = ?').run(u.id);
  const t3 = auth.createSession(u.id);
  db.prepare('update sessions set expires_at = 1 where token_hash <> ?').run('none');
  assert.equal(auth.userFromRequest({ headers: { cookie: `sid=${t3}` } }), null);
});

test('session cookie: HttpOnly, SameSite=Lax, Secure behind https or COOKIE_SECURE, cleared with Max-Age=0', () => {
  const plain = auth.sessionCookie('tok', { headers: {} });
  assert.match(plain, /^sid=tok; HttpOnly; SameSite=Lax; Path=\/; Max-Age=2592000$/);
  assert.match(auth.sessionCookie('tok', { headers: { 'x-forwarded-proto': 'https' } }), /; Secure$/);
  assert.match(auth.sessionCookie(null, { headers: {} }), /^sid=; .*Max-Age=0/);
});
