// Saved database connections, one set per account. Secrets (password, CA PEM) are
// encrypted with AES-256-GCM keyed by APP_SECRET; they never leave the server (list() strips them).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, randomUUID } from 'node:crypto';
import { db } from './db.js';

// An empty APP_SECRET falls back to a PUBLIC development key: fine for a local trial (it warns), never for an instance others use. Hosted settings refuse to start without one.
const hosted = process.env.COOKIE_SECURE === '1' || (process.env.DB_HOST_POLICY || 'open') !== 'open' || process.env.REQUIRE_APP_SECRET === '1';
if (!process.env.APP_SECRET) {
  const msg = 'APP_SECRET is empty: saved connection passwords would be encrypted with a PUBLIC development key. Set APP_SECRET (openssl rand -hex 32).';
  if (hosted) throw new Error(`${msg} Refusing to start with COOKIE_SECURE=1, DB_HOST_POLICY other than open, or REQUIRE_APP_SECRET=1.`);
  console.warn(`[opendiagram] ${msg} Acceptable only for a local trial.`);
}
const KEY = scryptSync(process.env.APP_SECRET || 'dev-secret-change-me', 'dbdiagram-open', 32);
const SECRETS = ['password', 'caPem'];
const COL = { password: 'password', caPem: 'ca_pem' }; // secret field -> column

const enc = (s) => { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', KEY, iv); const d = Buffer.concat([c.update(s, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), d]).toString('base64'); };
const dec = (s) => { if (!s) return ''; const b = Buffer.from(s, 'base64'), d = createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); };
const json = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
// a secret saved under another APP_SECRET (a restore on another machine, a changed .env) cannot be read: null. The lists must still work,
// so they say `secretLost`; using the connection asks for the password again (index.js resolve), and saving heals the row.
const readable = (s) => { try { return dec(s); } catch { return null; } };
const lostOf = (r) => SECRETS.filter((k) => readable(r[COL[k]]) === null);
const listed = (r) => ({ ...shape(r), hasCa: !!readable(r.ca_pem), secretLost: lostOf(r).length > 0 });
const withSecrets = (r) => { const out = shape(r); out.lost = lostOf(r); out.secretLost = out.lost.length > 0; for (const k of SECRETS) out[k] = readable(r[COL[k]]) ?? ''; return out; };

const shape = (r) => ({
  id: r.id, shared: !!r.shared, name: r.name, type: r.type, host: r.host, port: r.port, database: r.database, user: r.db_user,
  tls: r.tls, serverDn: r.server_dn || '', blockWritable: !!r.block_writable,
  schemas: json(r.schemas, []), tables: json(r.tables, []), refreshMinutes: r.refresh_minutes ? Math.max(5, r.refresh_minutes) : 0, // minimum 5 minutes (older settings of 1 are raised)
});

// private connections of one account (shared ones are not "theirs")
export const list = (owner) => db.prepare('select * from connections where owner_id = ? and shared = 0 order by rowid').all(owner).map(listed);

// shared connection `id` if this person may use it (an administrator may use every one; others through a grant to them or to one of their groups)
const USABLE = `select c.* from connections c where c.id = ? and c.shared = 1 and (? = 1 or exists (select 1 from connection_access a where a.connection_id = c.id and (
  (a.subject_type = 'user' and a.subject_id = ?) or (a.subject_type = 'group' and a.subject_id in (select group_id from group_members where user_id = ?)))))`;
const usable = (user, id) => db.prepare(USABLE).get(id, user.role === 'admin' ? 1 : 0, user.id, user.id);
export const canUseShared = (user, id) => !!id && !!usable(user, id);

// what the Database tab lists: the account's own connections plus the shared ones it may use. Members see name, type, host and database of a shared connection, never the user, the secrets or the CA.
export function listFor(user) {
  const shared = db.prepare('select c.id from connections c where c.shared = 1 order by c.rowid').all().filter((r) => canUseShared(user, r.id))
    .map((r) => db.prepare('select * from connections where id = ?').get(r.id))
    .map((r) => (user.role === 'admin' ? listed(r) : { ...listed(r), user: '', serverDn: '', blockWritable: false, hasCa: false }));
  return [...list(user.id), ...shared.map((c) => ({ ...c, managed: user.role === 'admin' }))];
}

// the connection with its secrets, for server-side use only: the account's own, or a shared one it may use (`shared` tells the caller to audit it)
export function getForUse(user, id) {
  const own = get(user.id, id);
  if (own) return own;
  const r = usable(user, id);
  return r ? withSecrets(r) : null;
}

export function get(owner, id) {
  const r = db.prepare('select * from connections where id = ? and owner_id = ? and shared = 0').get(id, owner);
  return r ? withSecrets(r) : null;
}

// secrets: undefined/'' keeps the stored value, null clears it. A kept CA that can no longer be read is dropped (paste it again);
// a kept password that can no longer be read stays, so the row says `secretLost` until the password is entered again.
export function upsert(owner, c, { shared = false } = {}) { // shared: an administrator registers or edits a shared connection (owner stays the first administrator)
  const old = c.id ? (shared ? db.prepare('select * from connections where id = ? and shared = 1').get(c.id) : db.prepare('select * from connections where id = ? and owner_id = ? and shared = 0').get(c.id, owner)) : null;
  if (c.id && !old) throw Object.assign(new Error('connection not found'), { statusCode: 404 });
  const secret = (k) => (c[k] === null ? enc('') : c[k] ? enc(c[k]) : !old ? enc('') : k === 'caPem' && readable(old.ca_pem) === null ? enc('') : old[COL[k]]);
  const id = old?.id ?? randomUUID();
  const row = [
    old?.owner_id ?? owner, c.name, c.type, c.host, +c.port, c.database, c.user, c.tls ?? 'off', c.serverDn || '', c.blockWritable ? 1 : 0,
    JSON.stringify(Array.isArray(c.schemas) ? c.schemas : json(old?.schemas, [])), JSON.stringify(Array.isArray(c.tables) ? c.tables : json(old?.tables, [])),
    (+c.refreshMinutes > 0 ? Math.max(5, +c.refreshMinutes) : 0), secret('password'), secret('caPem'),
  ];
  if (old) {
    db.prepare(`update connections set owner_id=?, name=?, type=?, host=?, port=?, database=?, db_user=?, tls=?, server_dn=?, block_writable=?, schemas=?, tables=?, refresh_minutes=?, password=?, ca_pem=? where id = ?`).run(...row, id);
  } else {
    db.prepare(`insert into connections (owner_id, name, type, host, port, database, db_user, tls, server_dn, block_writable, schemas, tables, refresh_minutes, password, ca_pem, id, shared) values (${'?,'.repeat(16)}?)`).run(...row, id, shared ? 1 : 0);
  }
  return id;
}

export const remove = (owner, id) => db.prepare('delete from connections where id = ? and owner_id = ? and shared = 0').run(id, owner);

// ---- shared connections (administrators)
export function listShared() {
  const names = (type, id) => (type === 'user' ? db.prepare('select name, email from users where id = ?').get(id) : db.prepare('select name from groups where id = ?').get(id));
  return db.prepare('select * from connections where shared = 1 order by rowid').all().map((r) => ({
    ...listed(r),
    access: db.prepare('select subject_type, subject_id from connection_access where connection_id = ?').all(r.id)
      .map((a) => ({ type: a.subject_type, id: a.subject_id, name: names(a.subject_type, a.subject_id)?.name || names(a.subject_type, a.subject_id)?.email || '?' })),
  }));
}
export const removeShared = (id) => db.prepare('delete from connections where id = ? and shared = 1').run(id).changes;
// replaces who may use a shared connection: { users: [ids], groups: [ids] }
export function setAccess(id, { users = [], groups = [] } = {}) {
  if (!db.prepare('select 1 from connections where id = ? and shared = 1').get(id)) throw Object.assign(new Error('shared connection not found'), { statusCode: 404 });
  const ok = (table, ids) => ids.map(Number).filter((n) => Number.isInteger(n) && db.prepare(`select 1 from ${table} where id = ?`).get(n));
  db.prepare('delete from connection_access where connection_id = ?').run(id);
  const ins = db.prepare('insert or ignore into connection_access (connection_id, subject_type, subject_id) values (?, ?, ?)');
  for (const u of ok('users', users)) ins.run(id, 'user', u);
  for (const g of ok('groups', groups)) ins.run(id, 'group', g);
}
