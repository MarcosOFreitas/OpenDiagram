// diagrams, share links and comments (all scoped to the owning account)
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from './db.js';
import { canUseShared } from './store.js';

const now = () => Math.floor(Date.now() / 1000);
const bad = (msg, statusCode = 400) => Object.assign(new Error(msg), { statusCode });
const json = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
export const RANK = { view: 0, comment: 1, edit: 2 };

const MAX_DBML = 2_000_000, MAX_LAYOUT = 500_000;
function check({ title, dbml, layout }) {
  if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 200)) throw bad('invalid title');
  if (dbml !== undefined && (typeof dbml !== 'string' || dbml.length > MAX_DBML)) throw bad('invalid or too large DBML');
  if (layout !== undefined && JSON.stringify(layout).length > MAX_LAYOUT) throw bad('layout too large');
}

const shape = (r) => ({ id: r.id, title: r.title, dbml: r.dbml, source: json(r.source, null), layout: json(r.layout, {}), createdAt: r.created_at, updatedAt: r.updated_at, version: r.version });

// effective level of `user` on diagram row `d`: 'owner'; 'admin' (administrators manage every diagram of the organisation, but never see its connection link or credentials); or the highest of direct and group grants; or null
export function roleFor(user, d) {
  if (d.owner_id === user.id) return 'owner';
  if (user.role === 'admin') return 'admin';
  const rows = db.prepare(`select access from diagram_access where diagram_id = ? and (
      (subject_type = 'user' and subject_id = ?) or (subject_type = 'group' and subject_id in (select group_id from group_members where user_id = ?)))`).all(d.id, user.id, user.id);
  return rows.map((r) => r.access).sort((x, y) => RANK[y] - RANK[x])[0] ?? null;
}

// own diagrams + diagrams shared with me (directly or through a group)
export function list(user) {
  const own = db.prepare(`select d.id, d.title, d.updated_at, (select count(*) from shares s where s.diagram_id = d.id) shares,
      (select count(*) from diagram_access a where a.diagram_id = d.id) grants from diagrams d where owner_id = ? order by updated_at desc`).all(user.id)
    .map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at, role: 'owner', shares: r.shares + r.grants }));
  // administrators see every other diagram of the organisation; everybody else only what was shared with them
  const others = (user.role === 'admin'
    ? db.prepare('select d.*, u.name owner_name from diagrams d join users u on u.id = d.owner_id where d.owner_id <> ? order by d.updated_at desc').all(user.id)
    : db.prepare(`select d.*, u.name owner_name from diagrams d join users u on u.id = d.owner_id where d.owner_id <> ? and d.id in (
      select diagram_id from diagram_access where (subject_type = 'user' and subject_id = ?) or (subject_type = 'group' and subject_id in (select group_id from group_members where user_id = ?)))
      order by d.updated_at desc`).all(user.id, user.id, user.id))
    .map((d) => ({ id: d.id, title: d.title, updatedAt: d.updated_at, role: roleFor(user, d), ownerName: d.owner_name, shares: 0 }));
  return [...own, ...others];
}

export function create(owner, { title, dbml } = {}) {
  check({ title, dbml });
  const id = randomUUID(), t = now();
  db.prepare('insert into diagrams (id, owner_id, title, dbml, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run(id, owner, title?.trim() || 'Untitled diagram', dbml ?? '', t, t);
  return id;
}

// a diagram the user may open (owner or granted): 404 otherwise. Non-owners never see the connection link.
export function getForUser(user, id) {
  const r = db.prepare('select d.*, u.name owner_name from diagrams d join users u on u.id = d.owner_id where d.id = ?').get(id);
  const role = r && roleFor(user, r);
  if (!role) throw bad('diagram not found', 404);
  const out = { ...shape(r), role, ownerName: r.owner_name };
  if (role !== 'owner') out.source = out.source && canUseShared(user, out.source.connId) ? out.source : null; // others see the link only when it points at a shared connection they may use (never a private one)
  return out;
}

// diagrams the actor manages (owner or administrator): used for sharing, access and deletion
const manages = (actor, ownerId) => ownerId === actor.id || actor.role === 'admin';
export function getOwned(actor, id) {
  const r = db.prepare('select * from diagrams where id = ?').get(id);
  if (!r || !manages(actor, r.owner_id)) throw bad('diagram not found', 404);
  return shape(r);
}

// ---- versions: every content save bumps diagrams.version; a client that saves with a stale `baseVersion` gets 409 instead of silently overwriting someone else's work
const conflict = (version) => Object.assign(bad('this diagram was saved by someone else in the meantime', 409), { code: 'conflict', version });
const COALESCE = 600, KEEP = 60; // edits by the same person within 10 minutes share one history entry; keep the newest 60 unnamed entries (named ones are never pruned)

const tableNames = (t) => new Set([...t.matchAll(/^\s*Table\s+("[^"]+"|[\w.]+)/gim)].map((m) => m[1].replace(/"/g, '').toLowerCase()));
const few = (a) => (a.length > 3 ? `${a.slice(0, 3).join(', ')} +${a.length - 3} more` : a.join(', '));
// one line describing what changed between two DBML texts (tables by name, other changes by lines)
export function summarize(before, after, layoutChanged = false) {
  const a = tableNames(before), b = tableNames(after);
  const added = [...b].filter((x) => !a.has(x)), removed = [...a].filter((x) => !b.has(x));
  const count = new Map();
  for (const l of before.split('\n')) count.set(l.trim(), (count.get(l.trim()) || 0) + 1);
  let plus = 0;
  for (const l of after.split('\n')) { const k = l.trim(), n = count.get(k) || 0; if (n > 0) count.set(k, n - 1); else plus++; }
  const minus = [...count.values()].reduce((x, y) => x + y, 0);
  const parts = [];
  if (added.length) parts.push(`added ${few(added)}`);
  if (removed.length) parts.push(`removed ${few(removed)}`);
  if (plus + minus) parts.push(`+${plus} / -${minus} lines`);
  if (!parts.length && layoutChanged) parts.push('layout only');
  return parts.join('; ') || 'title or settings';
}

const recent = (id) => db.prepare('select id, dbml, layout, label, author_id, created_at from diagram_versions where diagram_id = ? order by version desc limit 2').all(id);

// records the new state in the history (called after every content save)
function snapshot(id, version, st, actor, separate = false, reason = '') {
  let rows = recent(id);
  const t = now();
  if (!rows.length) { // first save since history exists: keep what was there before as the starting point
    db.prepare('insert into diagram_versions (diagram_id, version, title, dbml, layout, author, summary, created_at, saved_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, st.before.version, st.before.title, st.before.dbml, st.before.layout, null, 'starting point', st.before.updated_at, st.before.updated_at);
    rows = recent(id);
  }
  const last = rows[0];
  if (!separate && actor && last.author_id === actor.id && !last.label && t - last.created_at < COALESCE && rows.length > 1) { // same person, still working: update the entry
    db.prepare('update diagram_versions set version = ?, title = ?, dbml = ?, layout = ?, summary = ?, saved_at = ? where id = ?')
      .run(version, st.title, st.dbml, st.layout, summarize(rows[1].dbml, st.dbml, rows[1].layout !== st.layout), t, last.id);
  } else {
    db.prepare('insert into diagram_versions (diagram_id, version, title, dbml, layout, author_id, author, summary, created_at, saved_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, version, st.title, st.dbml, st.layout, actor?.id ?? null, actor ? actor.name || actor.email : null, (reason ? `${reason}: ` : '') + summarize(last.dbml, st.dbml, last.layout !== st.layout), t, t);
  }
  db.prepare(`delete from diagram_versions where diagram_id = ? and label is null and id not in
    (select id from diagram_versions where diagram_id = ? and label is null order by version desc limit ?)`).run(id, id, KEEP);
}

// partial update; `source` (link to a saved connection) is only ever set by the owner.
// `baseVersion`: the version the client last saw (omitted = no check, for scripts); returns the new version. `separate` forces its own history entry (someone chose to overwrite a newer version, or a refresh from the database); `reason` prefixes its summary. A save that changes nothing does not bump it.
export function update(id, patch, { includeSource = false, baseVersion, actor, separate = false, reason = '' } = {}) {
  check(patch);
  const cur = db.prepare('select version, title, dbml, layout, source, updated_at from diagrams where id = ?').get(id);
  if (!cur) throw bad('diagram not found', 404);
  if (baseVersion !== undefined && baseVersion !== cur.version) throw conflict(cur.version);
  const next = { title: cur.title, dbml: cur.dbml, layout: cur.layout, source: cur.source };
  if (patch.title !== undefined) next.title = patch.title.trim();
  if (patch.dbml !== undefined) next.dbml = patch.dbml;
  if (patch.layout !== undefined) next.layout = JSON.stringify(patch.layout);
  if (includeSource && patch.source !== undefined) next.source = JSON.stringify(patch.source);
  if (next.title === cur.title && next.dbml === cur.dbml && next.layout === cur.layout && next.source === cur.source) return cur.version;
  const version = cur.version + 1;
  db.prepare('update diagrams set title = ?, dbml = ?, layout = ?, source = ?, version = ?, updated_at = ? where id = ?').run(next.title, next.dbml, next.layout, next.source, version, now(), id);
  if (next.title !== cur.title || next.dbml !== cur.dbml || next.layout !== cur.layout) snapshot(id, version, { ...next, before: cur }, actor, separate, reason);
  return version;
}

export const versionOf = (id) => db.prepare('select version from diagrams where id = ?').get(id)?.version ?? null;

// ---- history (people who can edit)
export function listVersions(id) {
  const cur = db.prepare('select version from diagrams where id = ?').get(id)?.version;
  return db.prepare('select id, version, label, author, summary, saved_at from diagram_versions where diagram_id = ? order by version desc').all(id)
    .map((r) => ({ id: r.id, version: r.version, label: r.label, author: r.author, summary: r.summary, savedAt: r.saved_at, current: r.version === cur }));
}
export function getVersion(id, vid) {
  const r = db.prepare('select * from diagram_versions where diagram_id = ? and id = ?').get(id, vid);
  if (!r) throw bad('version not found', 404);
  return { id: r.id, version: r.version, label: r.label, author: r.author, savedAt: r.saved_at, title: r.title, dbml: r.dbml, layout: json(r.layout, {}) };
}
// gives the current state a name (it is then never pruned); if the latest entry already has a name, the name goes on a fresh copy
export function nameVersion(id, label, actor) {
  label = typeof label === 'string' ? label.trim().slice(0, 80) : '';
  if (!label) throw bad('give the version a name');
  const d = db.prepare('select version, title, dbml, layout, updated_at from diagrams where id = ?').get(id);
  if (!d) throw bad('diagram not found', 404);
  const last = db.prepare('select id, version, label from diagram_versions where diagram_id = ? order by version desc limit 1').get(id);
  if (last && last.version === d.version && !last.label) { db.prepare('update diagram_versions set label = ? where id = ?').run(label, last.id); return; }
  const t = now();
  db.prepare('insert into diagram_versions (diagram_id, version, title, dbml, layout, label, author_id, author, summary, created_at, saved_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, d.version, d.title, d.dbml, d.layout, label, actor.id, actor.name || actor.email, last ? 'named' : 'starting point', t, t);
}
// before an agent's first save after a person's work: that state gets a name, so a run of agent saves cannot push it out of the history (unnamed entries are pruned past KEEP)
export function keepBeforeAgent(id, agent) {
  const last = db.prepare('select u.kind from diagram_versions v left join users u on u.id = v.author_id where v.diagram_id = ? order by v.version desc limit 1').get(id);
  if (last?.kind !== 'agent') nameVersion(id, 'Before agent edit', agent);
}
export function deleteVersion(id, vid) { db.prepare('delete from diagram_versions where diagram_id = ? and id = ?').run(id, vid); }

export const remove = (actor, id) => db.prepare('delete from diagrams where id = ? and (owner_id = ? or ?)').run(id, actor.id, actor.role === 'admin' ? 1 : 0);

// ---- share links: the owner decides what each link allows (view < comment < edit)
export function listShares(actor, diagramId) {
  getOwned(actor, diagramId);
  return db.prepare('select id, token, access, created_at, password_hash, expires_at from shares where diagram_id = ? order by created_at').all(diagramId)
    .map((s) => ({ id: s.id, token: s.token, access: s.access, createdAt: s.created_at, hasPassword: !!s.password_hash, expiresAt: s.expires_at ?? null, expired: !!s.expires_at && s.expires_at <= now() }));
}
// a link lasts `days` days (1 to 365) or forever (null/undefined); an expired one answers as if it did not exist
const expiry = (days) => { if (days == null || days === '') return null; const n = Number(days); if (!Number.isInteger(n) || n < 1 || n > 365) throw bad('a link lasts 1 to 365 days'); return now() + n * 86400; };
export function createShare(actor, diagramId, access, passwordHash = null, expiresInDays = null) {
  getOwned(actor, diagramId);
  if (!Object.hasOwn(RANK, access)) throw bad('access must be view, comment or edit');
  const id = randomUUID(), token = randomBytes(18).toString('base64url');
  const expiresAt = expiry(expiresInDays);
  db.prepare('insert into shares (id, diagram_id, token, access, created_at, password_hash, expires_at) values (?, ?, ?, ?, ?, ?, ?)').run(id, diagramId, token, access, now(), passwordHash, expiresAt);
  return { id, token, access, hasPassword: !!passwordHash, expiresAt };
}
function ownedShare(actor, shareId) {
  const s = db.prepare('select s.*, d.owner_id from shares s join diagrams d on d.id = s.diagram_id where s.id = ?').get(shareId);
  if (!s || !manages(actor, s.owner_id)) throw bad('share not found', 404);
  return s;
}
export function setShareAccess(actor, shareId, access) {
  ownedShare(actor, shareId);
  if (!Object.hasOwn(RANK, access)) throw bad('access must be view, comment or edit');
  db.prepare('update shares set access = ? where id = ?').run(access, shareId);
}
export function setShareExpiry(actor, shareId, days) { ownedShare(actor, shareId); db.prepare('update shares set expires_at = ? where id = ?').run(expiry(days), shareId); }
export function setSharePassword(actor, shareId, passwordHash) { ownedShare(actor, shareId); db.prepare('update shares set password_hash = ? where id = ?').run(passwordHash, shareId); }
export function deleteShare(actor, shareId) { ownedShare(actor, shareId); db.prepare('delete from shares where id = ?').run(shareId); }

export function shareByToken(token) {
  const s = db.prepare('select s.*, d.title, d.dbml, d.layout, d.version, d.owner_id, u.name owner_name from shares s join diagrams d on d.id = s.diagram_id join users u on u.id = d.owner_id where s.token = ? and (s.expires_at is null or s.expires_at > ?)').get(String(token), now());
  return s ? { id: s.id, diagramId: s.diagram_id, access: s.access, title: s.title, dbml: s.dbml, layout: json(s.layout, {}), version: s.version, ownerId: s.owner_id, ownerName: s.owner_name, passwordHash: s.password_hash } : null;
}

// ---- comments: any number per target key ("schema.table", "schema.table.column" or "__project")
export const listComments = (diagramId) => db.prepare('select id, key, user_id, author, text, created_at from comments where diagram_id = ? order by created_at').all(diagramId)
  .map((c) => ({ id: c.id, key: c.key, userId: c.user_id, author: c.author, text: c.text, createdAt: c.created_at }));

export function addComment(diagramId, user, { key, text }) {
  if (typeof key !== 'string' || !key || key.length > 500) throw bad('invalid comment target');
  text = String(text ?? '').trim();
  if (!text || text.length > 2000) throw bad('comment must have 1 to 2000 characters');
  const id = randomUUID();
  db.prepare('insert into comments (id, diagram_id, key, user_id, author, text, created_at) values (?, ?, ?, ?, ?, ?, ?)').run(id, diagramId, key, user.id, user.name || user.email, text, now());
  return { id, key, userId: user.id, author: user.name || user.email, text, createdAt: now() };
}
// the author can delete their own comment; the diagram owner can delete any
export function deleteComment(diagramId, commentId, user, isOwner) {
  const c = db.prepare('select user_id from comments where id = ? and diagram_id = ?').get(commentId, diagramId);
  if (!c) throw bad('comment not found', 404);
  if (!isOwner && c.user_id !== user.id) throw bad('you can only delete your own comments', 403);
  db.prepare('delete from comments where id = ?').run(commentId);
}

// ---- people & groups with access (owner manages)
export function listGrants(actor, diagramId) {
  getOwned(actor, diagramId);
  return db.prepare(`select a.id, a.subject_type type, a.subject_id subjectId, a.access, u.name uname, case when u.kind = 'agent' then '' else u.email end email, u.kind ukind, g.name gname,
      (select count(*) from group_members m where m.group_id = a.subject_id) members
    from diagram_access a left join users u on a.subject_type = 'user' and u.id = a.subject_id left join groups g on a.subject_type = 'group' and g.id = a.subject_id
    where a.diagram_id = ? order by a.created_at`).all(diagramId)
    .map((r) => ({ id: r.id, type: r.type, subjectId: r.subjectId, access: r.access, name: r.type === 'user' ? r.uname : r.gname, email: r.email ?? undefined, agent: r.ukind === 'agent' || undefined, members: r.type === 'group' ? r.members : undefined }));
}
export function setGrant(actor, diagramId, { type, subjectId, access }) {
  getOwned(actor, diagramId);
  const ownerId = db.prepare('select owner_id from diagrams where id = ?').get(diagramId).owner_id;
  if (!Object.hasOwn(RANK, access)) throw bad('access must be view, comment or edit');
  subjectId = Number(subjectId);
  if (type === 'user') {
    if (subjectId === ownerId) throw bad('this person already owns the diagram');
    if (!db.prepare('select 1 from users where id = ? and disabled = 0').get(subjectId)) throw bad('user not found', 404);
  } else if (type === 'group') {
    if (!db.prepare('select 1 from groups where id = ?').get(subjectId)) throw bad('group not found', 404);
  } else throw bad('type must be user or group');
  db.prepare(`insert into diagram_access (diagram_id, subject_type, subject_id, access, created_at) values (?, ?, ?, ?, ?)
    on conflict(diagram_id, subject_type, subject_id) do update set access = excluded.access`).run(diagramId, type, subjectId, access, now());
}
function ownedGrant(actor, grantId) {
  const g = db.prepare('select a.*, d.owner_id from diagram_access a join diagrams d on d.id = a.diagram_id where a.id = ?').get(grantId);
  if (!g || !manages(actor, g.owner_id)) throw bad('access entry not found', 404);
}
export function setGrantAccess(actor, grantId, access) {
  ownedGrant(actor, grantId);
  if (!Object.hasOwn(RANK, access)) throw bad('access must be view, comment or edit');
  db.prepare('update diagram_access set access = ? where id = ?').run(access, grantId);
}
export function deleteGrant(actor, grantId) { ownedGrant(actor, grantId); db.prepare('delete from diagram_access where id = ?').run(grantId); }
