import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import * as auth from '../src/auth.js';
import * as admin from '../src/admin.js';
import * as dg from '../src/diagrams.js';

const PW = 'long-enough-pass';
const mk = (email) => auth.createUser({ email, password: PW });
const cookie = (t) => ({ headers: { cookie: `sid=${t}` } });

test('agentOf: a short browser and system, never the raw User-Agent', () => {
  assert.equal(auth.agentOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'), 'Chrome on Windows');
  assert.equal(auth.agentOf('Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 Safari/537.36 Edg/126.0'), 'Edge on Windows');
  assert.equal(auth.agentOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'), 'Safari on iOS');
  assert.equal(auth.agentOf('curl/8.0'), 'Script');
  assert.equal(auth.agentOf(undefined), 'Browser');
});

test('listSessions: device info, the current one is marked, ids never expose the stored hash', async () => {
  const u = await mk('list@example.com');
  const a = auth.createSession(u.id, { ip: '1.2.3.4', agent: 'Chrome on Windows' });
  const b = auth.createSession(u.id, { ip: '5.6.7.8', agent: 'Firefox on Linux' });
  await mk('other@example.com').then((o) => auth.createSession(o.id));
  const l = auth.listSessions(u.id, b);
  assert.equal(l.length, 2);
  assert.deepEqual(l.map((s) => s.current).sort(), [false, true]);
  assert.deepEqual(l.find((s) => s.current), { id: l.find((s) => s.current).id, current: true, createdAt: l[0].createdAt, lastSeen: l[0].lastSeen, ip: '5.6.7.8', agent: 'Firefox on Linux' });
  for (const s of l) assert.ok(!db.prepare('select 1 from sessions where token_hash = ?').get(s.id), 'the id is not the stored hash');
  assert.ok(a);
});

test('revokeSessions: one by id, all but the current, never another person\'s', async () => {
  const u = await mk('rev@example.com'), v = await mk('rev2@example.com');
  const [a, b, c] = [auth.createSession(u.id), auth.createSession(u.id), auth.createSession(u.id)];
  const vt = auth.createSession(v.id);
  const idOf = (t) => auth.listSessions(u.id, t).find((s) => s.current).id;
  assert.equal(auth.revokeSessions(v.id, { id: idOf(a) }), 0); // somebody else's session id does nothing
  assert.ok(auth.userFromRequest(cookie(a)));
  assert.equal(auth.revokeSessions(u.id, { id: idOf(a), exceptToken: b }), 1);
  assert.equal(auth.userFromRequest(cookie(a)), null);
  assert.equal(auth.revokeSessions(u.id, { id: idOf(b), exceptToken: b }), 0); // the one in use is "sign out", not "revoke"
  assert.equal(auth.revokeSessions(u.id, { exceptToken: b }), 1); // all the others: c
  assert.equal(auth.userFromRequest(cookie(c)), null);
  assert.ok(auth.userFromRequest(cookie(b)) && auth.userFromRequest(cookie(vt)));
  assert.equal(auth.revokeSessions(u.id), 1); // everywhere (the administrator's button)
  assert.equal(auth.userFromRequest(cookie(b)), null);
});

test('session length and inactivity limit come from the settings; last use is stamped at most once a minute', async () => {
  const u = await mk('life@example.com');
  admin.putSettings({ sessionDays: 7 });
  const t = auth.createSession(u.id);
  const left = db.prepare('select expires_at - created_at d from sessions where token_hash = (select token_hash from sessions where user_id = ? order by created_at desc limit 1)').get(u.id).d;
  assert.equal(left, 7 * 86400);
  assert.match(auth.sessionCookie(t, { headers: {} }), /Max-Age=604800/);
  const hash = db.prepare('select token_hash h from sessions where user_id = ?').get(u.id).h;
  admin.putSettings({ sessionIdleDays: 2 });
  db.prepare('update sessions set last_seen = ? where token_hash = ?').run(Math.floor(Date.now() / 1000) - 3 * 86400, hash);
  assert.equal(auth.userFromRequest(cookie(t)), null); // idle for 3 days > 2
  db.prepare('update sessions set last_seen = ? where token_hash = ?').run(Math.floor(Date.now() / 1000) - 3600, hash);
  assert.ok(auth.userFromRequest(cookie(t)));
  assert.ok(db.prepare('select last_seen from sessions where token_hash = ?').get(hash).last_seen > Math.floor(Date.now() / 1000) - 5); // touched
  admin.putSettings({ sessionDays: 30, sessionIdleDays: 0 });
  assert.throws(() => admin.putSettings({ sessionDays: 0 }), { statusCode: 400 });
  assert.throws(() => admin.putSettings({ sessionIdleDays: 91 }), { statusCode: 400 });
  assert.throws(() => admin.putSettings({ sessionDays: 1.5 }), { statusCode: 400 });
  assert.deepEqual([admin.getSettings().sessionDays, admin.getSettings().sessionIdleDays], [30, 0]);
});

test('the failed-attempt limiter is kept in the database (it survives a restart) under a hashed key', () => {
  const k = 'l|9.9.9.9|someone@example.com';
  for (let i = 0; i < 8; i++) auth.recordFail(k);
  assert.equal(auth.isLimited(k), true);
  const rows = db.prepare('select * from throttle').all();
  assert.ok(rows.length && rows.every((r) => !r.k.includes('someone') && !r.k.includes('9.9.9.9')));
  db.prepare('update throttle set until = 1').run(); // the window is over
  assert.equal(auth.isLimited(k), false);
  auth.recordFail(k);
  assert.equal(db.prepare('select n from throttle where k = ?').get(rows[0].k).n, 1); // starts again
});

test('checkPassword: only the right one', async () => {
  const u = await mk('chk@example.com');
  assert.equal(await auth.checkPassword(u.id, PW), true);
  assert.equal(await auth.checkPassword(u.id, 'nope-nope-nope'), false);
  assert.equal(await auth.checkPassword(u.id, undefined), false);
});

test('share links can expire: 1 to 365 days, an expired link is as good as gone, the owner still sees it', async () => {
  const o = await mk('own@example.com');
  const id = dg.create(o.id, { title: 'T', dbml: 'Table a { id int }' });
  const s = dg.createShare(o, id, 'view', null, 7);
  assert.ok(Math.abs(s.expiresAt - (Math.floor(Date.now() / 1000) + 7 * 86400)) < 5);
  assert.ok(dg.shareByToken(s.token));
  assert.equal(dg.createShare(o, id, 'view').expiresAt, null);
  for (const bad of [0, 366, 1.5, 'x']) assert.throws(() => dg.createShare(o, id, 'view', null, bad), { statusCode: 400 });
  db.prepare('update shares set expires_at = 1 where id = ?').run(s.id);
  assert.equal(dg.shareByToken(s.token), null);
  const listed = dg.listShares(o, id).find((x) => x.id === s.id);
  assert.deepEqual([listed.expired, listed.expiresAt], [true, 1]);
  dg.setShareExpiry(o, s.id, 30);
  assert.ok(dg.shareByToken(s.token));
  dg.setShareExpiry(o, s.id, null);
  assert.equal(dg.listShares(o, id).find((x) => x.id === s.id).expiresAt, null);
});
