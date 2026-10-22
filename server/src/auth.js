// e-mail + password accounts, roles (admin / member), server-side sessions
// (random token in an HttpOnly cookie, only its hash is stored)
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const scryptAsync = promisify(scrypt);
const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);
const bad = (msg, statusCode = 400) => Object.assign(new Error(msg), { statusCode });
const sha = (s) => createHash('sha256').update(s).digest('hex');

// ---------- settings (admin-editable) and sign-up policy
export const getSetting = (k, d) => db.prepare('select value from settings where key = ?').get(k)?.value ?? d;
export const setSetting = (k, v) => db.prepare('insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value').run(k, String(v));
export const userCount = () => db.prepare('select count(*) n from users').get().n;
// the very first account always works (it becomes the admin). After that: ALLOW_SIGNUP=1/0 forces open/closed, otherwise the admin's setting (default closed)
export function signupAllowed() {
  if (userCount() === 0) return true;
  if (process.env.ALLOW_SIGNUP === '1') return true;
  if (process.env.ALLOW_SIGNUP === '0') return false;
  return getSetting('allow_signup', '0') === '1';
}
export const orgName = () => getSetting('org_name', '');
export const sessionDays = () => Math.min(Math.max(Math.floor(+getSetting('session_days', '30')) || 30, 1), 90); // how long a new session lasts
export const idleDays = () => Math.min(Math.max(Math.floor(+getSetting('session_idle_days', '0')) || 0, 0), 90); // 0 = a session is only limited by its age

// ---------- passwords
async function hash(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function verify(password, stored) {
  const [alg, salt, key] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const k = Buffer.from(key, 'base64');
  return timingSafeEqual(await scryptAsync(password, Buffer.from(salt, 'base64'), k.length), k);
}
const DUMMY = hash('not-a-real-password'); // equalises timing when the e-mail does not exist
export const validPassword = (p) => { if (typeof p !== 'string' || p.length < 10 || p.length > 200) throw bad('password must have 10 to 200 characters'); };
export const tempPassword = () => randomBytes(12).toString('base64url');

// failed-attempt limiter: 8 failed logins / 15 min per (ip, e-mail); 30 sign-ups / 15 min per ip; kept in the database so a restart does not reset it
const limited = (k, max = 8) => { const f = db.prepare('select n from throttle where k = ? and until > ?').get(sha(k), now()); return !!f && f.n >= max; };
const fail = (k) => {
  const h = sha(k), t = now(), f = db.prepare('select n, until from throttle where k = ?').get(h);
  if (f && f.until > t) db.prepare('update throttle set n = n + 1 where k = ?').run(h);
  else db.prepare('insert into throttle (k, n, until) values (?, 1, ?) on conflict(k) do update set n = 1, until = excluded.until').run(h, t + 900);
};
const forgive = (k) => db.prepare('delete from throttle where k = ?').run(sha(k));

const pub = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, mustChangePassword: !!u.must_change_password });
export const userById = (id) => { const u = db.prepare('select * from users where id = ?').get(id); return u ? pub(u) : null; };

export const groupsOf = (userId) => db.prepare('select g.id, g.name from groups g join group_members m on m.group_id = g.id where m.user_id = ? order by g.name').all(userId);

// ---------- accounts
export async function createUser({ email, password, name, role = 'member', mustChange = false }) {
  email = String(email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw bad('enter a valid e-mail');
  validPassword(password);
  if (!['admin', 'member'].includes(role)) throw bad('role must be admin or member');
  if (db.prepare('select 1 from users where email = ?').get(email)) throw bad('this e-mail is already registered', 409);
  const r = db.prepare('insert into users (email, name, password_hash, created_at, role, must_change_password) values (?, ?, ?, ?, ?, ?)')
    .run(email, String(name || email.split('@')[0]).trim().slice(0, 80), await hash(password), now(), role, mustChange ? 1 : 0);
  return userById(Number(r.lastInsertRowid));
}

export async function register({ email, password, name }, ip) {
  if (!signupAllowed()) throw bad('sign-up is closed: ask an administrator to create your account', 403);
  if (limited(`r|${ip}`, 30)) throw bad('too many attempts, try again later', 429);
  fail(`r|${ip}`);
  return createUser({ email, password, name, role: userCount() === 0 ? 'admin' : 'member' });
}

export async function login({ email, password }, ip) {
  email = String(email ?? '').trim().toLowerCase();
  // three budgets of failures in 15 minutes: this address + e-mail (8), this address with any e-mail (50: password spraying; generous,
  // since without TRUST_PROXY everyone behind a proxy shares one address) and this e-mail from any address (30: distributed guessing)
  const keys = [[`l|${ip}|${email}`, 8], [`la|${ip}`, 50], [`le|${email}`, 30]];
  if (keys.some(([k, max]) => limited(k, max))) throw bad('too many failed attempts, try again in a few minutes', 429);
  const u = db.prepare('select * from users where email = ?').get(email);
  const ok = u ? await verify(String(password ?? ''), u.password_hash) : (await DUMMY, false);
  if (!ok) { keys.forEach(([k]) => fail(k)); throw bad('invalid e-mail or password', 401); }
  if (u.disabled) throw bad('this account is disabled: contact an administrator', 403);
  forgive(keys[0][0]); // only the pair: signing in to an own account must not reset the wider budgets
  return pub(u);
}

export async function changePassword(userId, { current, next }, keepToken) {
  const u = db.prepare('select * from users where id = ?').get(userId);
  if (!(await verify(String(current ?? ''), u.password_hash))) throw bad('current password is wrong', 403);
  validPassword(next);
  if (next === current) throw bad('choose a different password');
  db.prepare('update users set password_hash = ?, must_change_password = 0 where id = ?').run(await hash(next), userId);
  db.prepare('delete from sessions where user_id = ? and token_hash <> ?').run(userId, keepToken ? sha(keepToken) : '');
}

// administrator sets a new password (generated when none is given); the user must change it at next sign-in; all sessions end
export async function adminSetPassword(userId, password) {
  const pw = password || tempPassword();
  validPassword(pw);
  db.prepare('update users set password_hash = ?, must_change_password = 1, recovery_hash = null, recovery_at = null where id = ?').run(await hash(pw), userId); // a reset by an administrator also voids the recovery key
  db.prepare('delete from sessions where user_id = ?').run(userId);
  return pw;
}

// ---------- recovery key: the person keeps it (shown once) and uses it to choose a new password when they forget theirs. Only its hash is stored;
// it is 160 random bits, so a fast hash is enough. One use consumes it (a new one is generated after signing in); it never signs in by itself.
const normKey = (k) => String(k ?? '').toLowerCase().replace(/[^0-9a-f]/g, '');
const showKey = (hex) => `rk-${hex.match(/.{5}/g).join('-')}`; // rk-xxxxx-xxxxx-... (8 groups of 5)
export const recoveryStatus = (userId) => { const u = db.prepare('select recovery_hash, recovery_at from users where id = ?').get(userId); return { has: !!u?.recovery_hash, createdAt: u?.recovery_at ?? null }; };
export async function createRecoveryKey(userId, password) {
  if (limited(`d|${userId}`, 5)) throw bad('too many attempts, try again in a few minutes', 429);
  if (!(await checkPassword(userId, password))) { fail(`d|${userId}`); throw bad('password is wrong', 403); }
  const hex = randomBytes(20).toString('hex');
  db.prepare('update users set recovery_hash = ?, recovery_at = ? where id = ?').run(sha(hex), now(), userId); // replaces any earlier key
  return showKey(hex);
}
export const removeRecoveryKey = (userId) => db.prepare('update users set recovery_hash = null, recovery_at = null where id = ?').run(userId);
// e-mail + key -> a new password; the same answer for an unknown e-mail, a wrong key and an account without one (no way to find out which accounts exist)
export async function recoverPassword({ email, key, next }, ip) {
  email = String(email ?? '').trim().toLowerCase();
  const ks = [`v|${ip}|${email}`, `v|${email}`]; // per address+e-mail and per e-mail, so spreading the guesses over many addresses does not help
  if (ks.some((k) => limited(k))) throw bad('too many failed attempts, try again in a few minutes', 429);
  const u = db.prepare('select * from users where email = ? and disabled = 0 and deleted_at is null').get(email);
  const given = Buffer.from(sha(normKey(key)), 'hex'), want = Buffer.from(u?.recovery_hash ?? '0'.repeat(64), 'hex');
  if (!u?.recovery_hash || !timingSafeEqual(given, want)) { ks.forEach(fail); throw bad('invalid e-mail or recovery key', 401); }
  validPassword(next);
  db.prepare('update users set password_hash = ?, must_change_password = 0, recovery_hash = null, recovery_at = null where id = ?').run(await hash(next), u.id);
  db.prepare('delete from sessions where user_id = ?').run(u.id);
  ks.forEach(forgive);
  return pub(u);
}

// ---------- sessions
// a short "Chrome on Windows" for the session list: the raw User-Agent is never stored
export function agentOf(ua = '') {
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|undici|python/i.test(ua) ? 'Script' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} on ${os}` : b;
}
export function createSession(userId, { ip, agent } = {}) {
  const token = randomBytes(32).toString('base64url'), t = now();
  db.prepare('insert into sessions (token_hash, user_id, expires_at, created_at, last_seen, ip, agent) values (?, ?, ?, ?, ?, ?, ?)').run(sha(token), userId, t + sessionDays() * DAY, t, t, ip ? String(ip).slice(0, 64) : null, agent ? String(agent).slice(0, 60) : null);
  db.prepare('delete from sessions where expires_at < ?').run(t);
  db.prepare('delete from throttle where until < ?').run(t);
  return token;
}
const sid = (hash) => hash.slice(0, 16); // public id of a session in the list: never the stored hash itself
export function listSessions(userId, currentToken) {
  const cur = currentToken ? sha(currentToken) : '';
  return db.prepare('select * from sessions where user_id = ? and expires_at > ? order by coalesce(last_seen, created_at, 0) desc').all(userId, now())
    .map((s) => ({ id: sid(s.token_hash), current: s.token_hash === cur, createdAt: s.created_at, lastSeen: s.last_seen, ip: s.ip, agent: s.agent }));
}
// end one session of this person (by its public id), or all of them except the current one; returns how many ended
export function revokeSessions(userId, { id, exceptToken } = {}) {
  const keep = exceptToken ? sha(exceptToken) : '';
  return Number(db.prepare(`delete from sessions where user_id = ? and token_hash <> ? ${id ? 'and substr(token_hash, 1, 16) = ?' : ''}`).run(userId, keep, ...(id ? [String(id)] : [])).changes);
}
export async function checkPassword(userId, password) {
  const u = db.prepare('select password_hash from users where id = ?').get(userId);
  return !!u && verify(String(password ?? ''), u.password_hash);
}
export const destroySession = (token) => token && db.prepare('delete from sessions where token_hash = ?').run(sha(token));
export const destroyUserSessions = (userId) => db.prepare('delete from sessions where user_id = ?').run(userId);

export function tokenFromRequest(req) {
  const m = /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie ?? '');
  return m?.[1];
}
export function userFromRequest(req) {
  const t = tokenFromRequest(req);
  if (!t) return null;
  const n = now(), idle = idleDays();
  const u = db.prepare(`select u.*, s.last_seen from sessions s join users u on u.id = s.user_id where s.token_hash = ? and s.expires_at > ? and u.disabled = 0
    ${idle ? 'and coalesce(s.last_seen, s.created_at, ?) > ?' : ''}`).get(sha(t), n, ...(idle ? [n, n - idle * DAY] : []));
  if (u && !(u.last_seen > n - 60)) db.prepare('update sessions set last_seen = ?, ip = coalesce(ip, ?), agent = coalesce(agent, ?) where token_hash = ?').run(n, req.ip ? String(req.ip).slice(0, 64) : null, req.headers?.['user-agent'] ? agentOf(req.headers['user-agent']) : null, sha(t)); // "last used", at most once a minute; a session made before the device was recorded learns it now
  return u ? pub(u) : null;
}

export function sessionCookie(token, req) {
  const secure = process.env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
  const age = token ? sessionDays() * DAY : 0;
  return `sid=${token ?? ''}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`;
}
// share-link passwords reuse the scrypt helpers and the failed-attempt limiter
export { hash as hashSecret, verify as verifySecret, limited as isLimited, fail as recordFail };
