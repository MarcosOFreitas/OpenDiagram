// diagrams, share links and comments (all scoped to the owning account)
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from './db.js';

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

const shape = (r) => ({ id: r.id, title: r.title, dbml: r.dbml, source: json(r.source, null), layout: json(r.layout, {}), createdAt: r.created_at, updatedAt: r.updated_at });

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
  if (role !== 'owner') out.source = null;
  return out;
}

// diagrams the actor manages (owner or administrator): used for sharing, access and deletion
const manages = (actor, ownerId) => ownerId === actor.id || actor.role === 'admin';
export function getOwned(actor, id) {
  const r = db.prepare('select * from diagrams where id = ?').get(id);
  if (r && !manages(actor, r.owner_id)) throw bad('diagram not found', 404);
  if (!r) throw bad('diagram not found', 404);
  return shape(r);
}

// partial update; `source` (link to a saved connection) is only ever set by the owner
export function update(id, patch, { includeSource = false } = {}) {
  check(patch);
  const sets = [], vals = [];
  if (patch.title !== undefined) { sets.push('title = ?'); vals.push(patch.title.trim()); }
  if (patch.dbml !== undefined) { sets.push('dbml = ?'); vals.push(patch.dbml); }
  if (patch.layout !== undefined) { sets.push('layout = ?'); vals.push(JSON.stringify(patch.layout)); }
  if (includeSource && patch.source !== undefined) { sets.push('source = ?'); vals.push(JSON.stringify(patch.source)); }
  if (!sets.length) return;
  db.prepare(`update diagrams set ${sets.join(', ')}, updated_at = ? where id = ?`).run(...vals, now(), id);
}

export const remove = (actor, id) => db.prepare('delete from diagrams where id = ? and (owner_id = ? or ?)').run(id, actor.id, actor.role === 'admin' ? 1 : 0);

// ---- share links: the owner decides what each link allows (view < comment < edit)
export function listShares(actor, diagramId) {
  getOwned(actor, diagramId);
  return db.prepare('select id, token, access, created_at from shares where diagram_id = ? order by created_at').all(diagramId)
    .map((s) => ({ id: s.id, token: s.token, access: s.access, createdAt: s.created_at }));
}
export function createShare(actor, diagramId, access) {
  getOwned(actor, diagramId);
  if (!(access in RANK)) throw bad('access must be view, comment or edit');
  const id = randomUUID(), token = randomBytes(18).toString('base64url');
  db.prepare('insert into shares (id, diagram_id, token, access, created_at) values (?, ?, ?, ?, ?)').run(id, diagramId, token, access, now());
  return { id, token, access };
}
function ownedShare(actor, shareId) {
  const s = db.prepare('select s.*, d.owner_id from shares s join diagrams d on d.id = s.diagram_id where s.id = ?').get(shareId);
  if (!s || !manages(actor, s.owner_id)) throw bad('share not found', 404);
  return s;
}
export function setShareAccess(actor, shareId, access) {
  ownedShare(actor, shareId);
  if (!(access in RANK)) throw bad('access must be view, comment or edit');
  db.prepare('update shares set access = ? where id = ?').run(access, shareId);
}
export function deleteShare(actor, shareId) { ownedShare(actor, shareId); db.prepare('delete from shares where id = ?').run(shareId); }

export function shareByToken(token) {
  const s = db.prepare('select s.*, d.title, d.dbml, d.layout, d.owner_id, u.name owner_name from shares s join diagrams d on d.id = s.diagram_id join users u on u.id = d.owner_id where s.token = ?').get(String(token));
  return s ? { id: s.id, diagramId: s.diagram_id, access: s.access, title: s.title, dbml: s.dbml, layout: json(s.layout, {}), ownerId: s.owner_id, ownerName: s.owner_name } : null;
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
  return db.prepare(`select a.id, a.subject_type type, a.subject_id subjectId, a.access, u.name uname, u.email email, g.name gname,
      (select count(*) from group_members m where m.group_id = a.subject_id) members
    from diagram_access a left join users u on a.subject_type = 'user' and u.id = a.subject_id left join groups g on a.subject_type = 'group' and g.id = a.subject_id
    where a.diagram_id = ? order by a.created_at`).all(diagramId)
    .map((r) => ({ id: r.id, type: r.type, subjectId: r.subjectId, access: r.access, name: r.type === 'user' ? r.uname : r.gname, email: r.email ?? undefined, members: r.type === 'group' ? r.members : undefined }));
}
export function setGrant(actor, diagramId, { type, subjectId, access }) {
  getOwned(actor, diagramId);
  const ownerId = db.prepare('select owner_id from diagrams where id = ?').get(diagramId).owner_id;
  if (!(access in RANK)) throw bad('access must be view, comment or edit');
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
  if (!(access in RANK)) throw bad('access must be view, comment or edit');
  db.prepare('update diagram_access set access = ? where id = ?').run(access, grantId);
}
export function deleteGrant(actor, grantId) { ownedGrant(actor, grantId); db.prepare('delete from diagram_access where id = ?').run(grantId); }
