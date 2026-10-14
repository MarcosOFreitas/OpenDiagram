// Saved database connections, one set per account. Secrets (password, CA/wallet PEM, wallet password) are
// encrypted with AES-256-GCM keyed by APP_SECRET; they never leave the server (list() strips them).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { db, DIR } from './db.js';

const KEY = scryptSync(process.env.APP_SECRET || 'dev-secret-change-me', 'dbdiagram-open', 32);
const SECRETS = ['password', 'caPem', 'walletPassword'];
const COL = { password: 'password', caPem: 'ca_pem', walletPassword: 'wallet_password' };

const enc = (s) => { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', KEY, iv); const d = Buffer.concat([c.update(s, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), d]).toString('base64'); };
const dec = (s) => { if (!s) return ''; const b = Buffer.from(s, 'base64'), d = createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); };
const json = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

const shape = (r) => ({
  id: r.id, name: r.name, type: r.type, host: r.host, port: r.port, database: r.database, user: r.db_user,
  tls: r.tls, serverDn: r.server_dn || '', blockWritable: !!r.block_writable,
  schemas: json(r.schemas, []), tables: json(r.tables, []), refreshMinutes: r.refresh_minutes || 0,
});

export const list = (owner) => db.prepare('select * from connections where owner_id = ? order by rowid').all(owner)
  .map((r) => ({ ...shape(r), hasCa: !!dec(r.ca_pem) }));

export function get(owner, id) {
  const r = db.prepare('select * from connections where id = ? and owner_id = ?').get(id, owner);
  if (!r) return null;
  const out = shape(r);
  for (const k of SECRETS) out[k] = dec(r[COL[k]]);
  return out;
}

// secrets: undefined/'' keeps the stored value, null clears it
export function upsert(owner, c) {
  const old = c.id ? db.prepare('select * from connections where id = ? and owner_id = ?').get(c.id, owner) : null;
  if (c.id && !old) throw Object.assign(new Error('connection not found'), { statusCode: 404 });
  const secret = (k) => (c[k] === null ? enc('') : c[k] ? enc(c[k]) : old?.[COL[k]] ?? enc(''));
  const id = old?.id ?? randomUUID();
  const row = [
    owner, c.name, c.type, c.host, +c.port, c.database, c.user, c.tls ?? 'off', c.serverDn || '', c.blockWritable ? 1 : 0,
    JSON.stringify(Array.isArray(c.schemas) ? c.schemas : json(old?.schemas, [])), JSON.stringify(Array.isArray(c.tables) ? c.tables : json(old?.tables, [])),
    Math.max(0, +c.refreshMinutes || 0), secret('password'), secret('caPem'), secret('walletPassword'),
  ];
  if (old) {
    db.prepare(`update connections set owner_id=?, name=?, type=?, host=?, port=?, database=?, db_user=?, tls=?, server_dn=?, block_writable=?, schemas=?, tables=?, refresh_minutes=?, password=?, ca_pem=?, wallet_password=? where id = ?`).run(...row, id);
  } else {
    db.prepare(`insert into connections (owner_id, name, type, host, port, database, db_user, tls, server_dn, block_writable, schemas, tables, refresh_minutes, password, ca_pem, wallet_password, id) values (${'?,'.repeat(16)}?)`).run(...row, id);
  }
  return id;
}

export const remove = (owner, id) => db.prepare('delete from connections where id = ? and owner_id = ?').run(id, owner);

// one-time: connections saved by the pre-accounts version (connections.json) go to the first account created
export function adoptLegacy(owner) {
  const f = `${DIR}/connections.json`;
  if (!existsSync(f)) return 0;
  let n = 0;
  for (const c of json(readFileSync(f, 'utf8'), [])) {
    const tls = c.tls ?? (c.ssl ? 'noverify' : 'off');
    const row = [randomUUID(), owner, c.name, c.type, c.host, +c.port, c.database, c.user, tls, c.serverDn || '', c.blockWritable ? 1 : 0,
      JSON.stringify(c.schemas ?? []), JSON.stringify(c.tables ?? []), c.refreshMinutes || 0, c.password || enc(''), c.caPem || enc(''), c.walletPassword || enc('')];
    db.prepare(`insert into connections (id, owner_id, name, type, host, port, database, db_user, tls, server_dn, block_writable, schemas, tables, refresh_minutes, password, ca_pem, wallet_password) values (${'?,'.repeat(16)}?)`).run(...row);
    n++;
  }
  renameSync(f, `${f}.migrated`);
  return n;
}
