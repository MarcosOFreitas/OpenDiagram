// Saved database connections, one set per account. Secrets (password, CA PEM) are
// encrypted with AES-256-GCM keyed by APP_SECRET; they never leave the server (list() strips them).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { db, DIR } from './db.js';

const KEY = scryptSync(process.env.APP_SECRET || 'dev-secret-change-me', 'dbdiagram-open', 32);
const SECRETS = ['password', 'caPem'];
const COL = { password: 'password', caPem: 'ca_pem' }; // (the old wallet_password column is no longer used: wallets are not supported)

const enc = (s) => { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', KEY, iv); const d = Buffer.concat([c.update(s, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), d]).toString('base64'); };
const dec = (s) => { if (!s) return ''; const b = Buffer.from(s, 'base64'), d = createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); };
const json = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

const shape = (r) => ({
  id: r.id, shared: !!r.shared, name: r.name, type: r.type, host: r.host, port: r.port, database: r.database, user: r.db_user,
  tls: r.tls, serverDn: r.server_dn || '', blockWritable: !!r.block_writable,
  schemas: json(r.schemas, []), tables: json(r.tables, []), refreshMinutes: r.refresh_minutes || 0,
});

// private connections of one account (shared ones are not "theirs")
export const list = (owner) => db.prepare('select * from connections where owner_id = ? and shared = 0 order by rowid').all(owner)
  .map((r) => ({ ...shape(r), hasCa: !!dec(r.ca_pem) }));

// shared connection `id` if this person may use it (an administrator may use every one; others through a grant to them or to one of their groups)
const USABLE = `select c.* from connections c where c.id = ? and c.shared = 1 and (? = 1 or exists (select 1 from connection_access a where a.connection_id = c.id and (
  (a.subject_type = 'user' and a.subject_id = ?) or (a.subject_type = 'group' and a.subject_id in (select group_id from group_members where user_id = ?)))))`;
const usable = (user, id) => db.prepare(USABLE).get(id, user.role === 'admin' ? 1 : 0, user.id, user.id);
export const canUseShared = (user, id) => !!id && !!usable(user, id);

// what the Database tab lists: the account's own connections plus the shared ones it may use. Members see name, type, host and database of a shared connection, never the user, the secrets or the CA.
export function listFor(user) {
  const shared = db.prepare('select c.id from connections c where c.shared = 1 order by c.rowid').all().filter((r) => canUseShared(user, r.id))
    .map((r) => db.prepare('select * from connections where id = ?').get(r.id))
    .map((r) => (user.role === 'admin' ? { ...shape(r), hasCa: !!dec(r.ca_pem) } : { ...shape(r), user: '', serverDn: '', blockWritable: false, hasCa: false }));
  return [...list(user.id), ...shared.map((c) => ({ ...c, managed: user.role === 'admin' }))];
}

// the connection with its secrets, for server-side use only: the account's own, or a shared one it may use (`shared` tells the caller to audit it)
export function getForUse(user, id) {
  const own = get(user.id, id);
  if (own) return own;
  const r = usable(user, id);
  if (!r) return null;
  const out = shape(r);
  for (const k of SECRETS) out[k] = dec(r[COL[k]]);
  return out;
}

export function get(owner, id) {
  const r = db.prepare('select * from connections where id = ? and owner_id = ? and shared = 0').get(id, owner);
  if (!r) return null;
  const out = shape(r);
  for (const k of SECRETS) out[k] = dec(r[COL[k]]);
  return out;
}

// secrets: undefined/'' keeps the stored value, null clears it
export function upsert(owner, c, { shared = false } = {}) { // shared: an administrator registers or edits a shared connection (owner stays the first administrator)
  const old = c.id ? (shared ? db.prepare('select * from connections where id = ? and shared = 1').get(c.id) : db.prepare('select * from connections where id = ? and owner_id = ? and shared = 0').get(c.id, owner)) : null;
  if (c.id && !old) throw Object.assign(new Error('connection not found'), { statusCode: 404 });
  const secret = (k) => (c[k] === null ? enc('') : c[k] ? enc(c[k]) : old?.[COL[k]] ?? enc(''));
  const id = old?.id ?? randomUUID();
  const row = [
    old?.owner_id ?? owner, c.name, c.type, c.host, +c.port, c.database, c.user, c.tls ?? 'off', c.serverDn || '', c.blockWritable ? 1 : 0,
    JSON.stringify(Array.isArray(c.schemas) ? c.schemas : json(old?.schemas, [])), JSON.stringify(Array.isArray(c.tables) ? c.tables : json(old?.tables, [])),
    Math.max(0, +c.refreshMinutes || 0), secret('password'), secret('caPem'),
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
    ...shape(r), hasCa: !!dec(r.ca_pem),
    access: db.prepare('select subject_type, subject_id from connection_access where connection_id = ?').all(r.id)
      .map((a) => ({ type: a.subject_type, id: a.subject_id, name: names(a.subject_type, a.subject_id)?.name || names(a.subject_type, a.subject_id)?.email || '?' })),
  }));
}
export const removeShared = (id) => db.prepare('delete from connections where id = ? and shared = 1').run(id).changes;
// replaces who may use a shared connection: { users: [ids], groups: [ids] }
export function setAccess(id, { users = [], groups = [] } = {}) {
  if (!db.prepare('select 1 from connections where id = ? and shared = 1').get(id)) throw Object.assign(new Error('shared connection not found'), { statusCode: 404 });
  const ok = (rows, table, ids) => ids.map(Number).filter((n) => Number.isInteger(n) && db.prepare(`select 1 from ${table} where id = ?`).get(n));
  db.prepare('delete from connection_access where connection_id = ?').run(id);
  const ins = db.prepare('insert or ignore into connection_access (connection_id, subject_type, subject_id) values (?, ?, ?)');
  for (const u of ok(users, 'users', users)) ins.run(id, 'user', u);
  for (const g of ok(groups, 'groups', groups)) ins.run(id, 'group', g);
}

// one-time: connections saved by the pre-accounts version (connections.json) go to the first account created
export function adoptLegacy(owner) {
  const f = `${DIR}/connections.json`;
  if (!existsSync(f)) return 0;
  let n = 0;
  for (const c of json(readFileSync(f, 'utf8'), [])) {
    const tls = c.tls ?? (c.ssl ? 'noverify' : 'off');
    const row = [randomUUID(), owner, c.name, c.type, c.host, +c.port, c.database, c.user, tls, c.serverDn || '', c.blockWritable ? 1 : 0,
      JSON.stringify(c.schemas ?? []), JSON.stringify(c.tables ?? []), c.refreshMinutes || 0, c.password || enc(''), c.caPem || enc('')];
    db.prepare(`insert into connections (id, owner_id, name, type, host, port, database, db_user, tls, server_dn, block_writable, schemas, tables, refresh_minutes, password, ca_pem) values (${'?,'.repeat(15)}?)`).run(...row);
    n++;
  }
  renameSync(f, `${f}.migrated`);
  return n;
}
