// connections.json in DATA_DIR; secrets (password, CA/wallet PEM, wallet password) encrypted with AES-256-GCM keyed by APP_SECRET.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const DIR = process.env.DATA_DIR || './data';
const FILE = `${DIR}/connections.json`;
const KEY = scryptSync(process.env.APP_SECRET || 'dev-secret-change-me', 'dbdiagram-open', 32);
const SECRETS = ['password', 'caPem', 'walletPassword'];

const enc = (s) => { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', KEY, iv); const d = Buffer.concat([c.update(s, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), d]).toString('base64'); };
const dec = (s) => { if (!s) return ''; const b = Buffer.from(s, 'base64'), d = createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); };

const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return []; } };
const save = (l) => { mkdirSync(DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify(l, null, 2)); };
// records written before TLS modes existed only had a boolean `ssl`
const tlsOf = (c) => c.tls ?? (c.ssl ? 'noverify' : 'off');

export const list = () => load().map((c) => {
  const pub = Object.fromEntries(Object.entries(c).filter(([k]) => !SECRETS.includes(k)));
  return { ...pub, tls: tlsOf(c), hasCa: !!dec(c.caPem), schemas: c.schemas ?? [], tables: c.tables ?? [], refreshMinutes: c.refreshMinutes ?? 0, blockWritable: !!c.blockWritable };
});

export function get(id) {
  const c = load().find((x) => x.id === id);
  if (!c) return null;
  const out = { ...c, tls: tlsOf(c) };
  for (const k of SECRETS) out[k] = dec(c[k]);
  return out;
}

// secrets: undefined/'' keeps the stored value, null clears it
export function upsert(c) {
  const l = load();
  const old = l.find((x) => x.id === c.id);
  const rec = {
    id: c.id || randomUUID(), name: c.name, type: c.type, host: c.host, port: +c.port, database: c.database, user: c.user,
    tls: c.tls ?? 'off', serverDn: c.serverDn || '', blockWritable: !!c.blockWritable,
    schemas: Array.isArray(c.schemas) ? c.schemas : old?.schemas ?? [], tables: Array.isArray(c.tables) ? c.tables : old?.tables ?? [],
    refreshMinutes: Math.max(0, +c.refreshMinutes || 0),
  };
  for (const k of SECRETS) rec[k] = c[k] === null ? enc('') : c[k] ? enc(c[k]) : old?.[k] ?? enc('');
  save(old ? l.map((x) => (x.id === rec.id ? rec : x)) : [...l, rec]);
  return rec.id;
}
export const remove = (id) => save(load().filter((x) => x.id !== id));

// documentation comments: { "<table id>" | "<table id>.<column>" | "__project": text }. App-only, never sent to the databases.
const CFILE = `${DIR}/comments.json`;
export const getComments = () => { try { return JSON.parse(readFileSync(CFILE, 'utf8')); } catch { return {}; } };
export function setComments(c) {
  const clean = {};
  for (const [k, v] of Object.entries(c ?? {})) if (typeof v === 'string' && v.trim() && k.length < 500) clean[k] = v.slice(0, 5000);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(CFILE, JSON.stringify(clean, null, 2));
  return clean;
}
