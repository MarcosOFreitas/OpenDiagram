// Agents: accounts for an AI client (the MCP connector), created by an administrator. An agent is a user with no password and no sign-in: it has no access at all
// until the owner of a diagram shares it (view / comment / edit, like with a person). It authenticates with a bearer token that works only on /mcp.
// The token is random (256 bits), only its SHA-256 is stored, it is shown once, and it can expire or be revoked.
import { randomBytes, createHash } from 'node:crypto';
import { db } from './db.js';
import { getSetting } from './auth.js';

const now = () => Math.floor(Date.now() / 1000);
const bad = (msg, statusCode = 400) => Object.assign(new Error(msg), { statusCode });
const sha = (s) => createHash('sha256').update(s).digest('hex');
export const allowed = () => getSetting('allow_agents', '0') === '1'; // administrators switch the connector on

const agent = (id) => { const a = db.prepare("select * from users where id = ? and kind = 'agent'").get(id); if (!a) throw bad('agent not found', 404); return a; };
const pub = (a) => ({ id: a.id, name: a.name, disabled: !!a.disabled, createdAt: a.created_at });

export function createAgent(name) {
  name = String(name ?? '').trim().slice(0, 80);
  if (!name) throw bad('give the agent a name');
  const hex = randomBytes(6).toString('hex');
  // role is always "member": an agent is never an administrator, and the e-mail is a placeholder nobody can sign in with
  const r = db.prepare("insert into users (email, name, password_hash, created_at, role, must_change_password, kind) values (?, ?, '!', ?, 'member', 0, 'agent')").run(`agent-${hex}@agents.invalid`, name, now());
  return pub(db.prepare('select * from users where id = ?').get(Number(r.lastInsertRowid)));
}

export function listAgents() {
  const toks = db.prepare('select id, user_id, name, created_at, last_used, expires_at, revoked_at from api_tokens order by created_at').all();
  return db.prepare("select * from users where kind = 'agent' and deleted_at is null order by lower(name), id").all()
    .map((a) => ({ ...pub(a), tokens: toks.filter((t) => t.user_id === a.id).map((t) => ({ id: t.id, name: t.name, createdAt: t.created_at, lastUsed: t.last_used, expiresAt: t.expires_at, revoked: !!t.revoked_at, expired: !!t.expires_at && t.expires_at <= now() })) }));
}

export function updateAgent(id, { name, disabled }) {
  agent(id);
  if (name !== undefined) { const n = String(name).trim().slice(0, 80); if (!n) throw bad('name cannot be empty'); db.prepare('update users set name = ? where id = ?').run(n, id); }
  if (disabled !== undefined) db.prepare('update users set disabled = ? where id = ?').run(disabled ? 1 : 0, id);
}

export function deleteAgent(id) {
  agent(id);
  db.prepare("delete from diagram_access where subject_type = 'user' and subject_id = ?").run(id);
  db.prepare('delete from group_members where user_id = ?').run(id);
  db.prepare('delete from users where id = ?').run(id); // its tokens go with it
}

// a new token, returned in clear ONCE
// a token lasts 90 days unless the administrator chooses another length, or `never` on purpose
export function createToken(agentId, { name, expiresInDays, never = false } = {}) {
  agent(agentId);
  name = String(name ?? '').trim().slice(0, 80) || 'token';
  let exp = null;
  if (never !== true) {
    const n = expiresInDays === undefined || expiresInDays === null || expiresInDays === '' ? 90 : Number(expiresInDays);
    if (!Number.isInteger(n) || n < 1 || n > 730) throw bad('a token lasts 1 to 730 days');
    exp = now() + n * 86400;
  }
  const token = `odt_${randomBytes(32).toString('base64url')}`;
  const id = randomBytes(8).toString('hex');
  db.prepare('insert into api_tokens (id, user_id, name, hash, created_at, expires_at) values (?, ?, ?, ?, ?, ?)').run(id, agentId, name, sha(token), now(), exp);
  return { id, token, expiresAt: exp };
}
export function revokeToken(agentId, tokenId) {
  const r = db.prepare('update api_tokens set revoked_at = ? where id = ? and user_id = ? and revoked_at is null').run(now(), String(tokenId), agentId);
  if (!r.changes) throw bad('token not found', 404);
}

// bearer token -> the agent (a user-shaped object), or null: unknown, revoked, expired, agent disabled, or agents switched off
export function authenticate(header) {
  const m = /^Bearer (odt_[\w-]{43})$/.exec(String(header ?? '').trim());
  if (!m || !allowed()) return null;
  const t = db.prepare(`select t.id tid, t.last_used, u.* from api_tokens t join users u on u.id = t.user_id
    where t.hash = ? and t.revoked_at is null and (t.expires_at is null or t.expires_at > ?) and u.kind = 'agent' and u.disabled = 0`).get(sha(m[1]), now());
  if (!t) return null;
  if (!(t.last_used > now() - 60)) db.prepare('update api_tokens set last_used = ? where id = ?').run(now(), t.tid);
  return { id: t.id, name: t.name, email: t.email, role: 'member', kind: 'agent', tokenId: t.tid };
}

// a small per-token budget so a looping client cannot hammer the server
const hits = new Map();
export function withinRate(tokenId, limit = 120, windowMs = 60_000, t = Date.now()) {
  const h = (hits.get(tokenId) ?? []).filter((x) => t - x < windowMs);
  if (h.length >= limit) { hits.set(tokenId, h); return false; }
  h.push(t); hits.set(tokenId, h);
  return true;
}
