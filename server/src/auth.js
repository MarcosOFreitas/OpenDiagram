// e-mail + password accounts, roles (admin / member), server-side sessions
// (random token in an HttpOnly cookie, only its hash is stored)
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const scryptAsync = promisify(scrypt);
const DAY = 86400;
const SESSION_DAYS = 30;
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

// naive in-memory limiter: 8 failed logins / 15 min per (ip, e-mail); 30 sign-ups / 15 min per ip
const fails = new Map();
const limited = (k, max = 8) => { const f = fails.get(k); return f && f.until > Date.now() && f.n >= max; };
const fail = (k) => { const f = fails.get(k); fails.set(k, f && f.until > Date.now() ? { n: f.n + 1, until: f.until } : { n: 1, until: Date.now() + 15 * 60000 }); };

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
  const k = `l|${ip}|${email}`;
  if (limited(k)) throw bad('too many failed attempts, try again in a few minutes', 429);
  const u = db.prepare('select * from users where email = ?').get(email);
  const ok = u ? await verify(String(password ?? ''), u.password_hash) : (await DUMMY, false);
  if (!ok) { fail(k); throw bad('invalid e-mail or password', 401); }
  if (u.disabled) throw bad('this account is disabled: contact an administrator', 403);
  fails.delete(k);
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
  db.prepare('update users set password_hash = ?, must_change_password = 1 where id = ?').run(await hash(pw), userId);
  db.prepare('delete from sessions where user_id = ?').run(userId);
  return pw;
}

// ---------- sessions
export function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').run(sha(token), userId, now() + SESSION_DAYS * DAY);
  db.prepare('delete from sessions where expires_at < ?').run(now());
  return token;
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
  const u = db.prepare('select u.* from sessions s join users u on u.id = s.user_id where s.token_hash = ? and s.expires_at > ? and u.disabled = 0').get(sha(t), now());
  return u ? pub(u) : null;
}

export function sessionCookie(token, req) {
  const secure = process.env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
  const age = token ? SESSION_DAYS * DAY : 0;
  return `sid=${token ?? ''}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`;
}
// share-link passwords reuse the scrypt helpers and the failed-attempt limiter
export { hash as hashSecret, verify as verifySecret, limited as isLimited, fail as recordFail };
