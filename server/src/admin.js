// administration: users, groups (flat, a user can be in many), settings, and the people/group directory used for sharing
import { db } from './db.js';
import * as auth from './auth.js';

const now = () => Math.floor(Date.now() / 1000);
const bad = (msg, statusCode = 400) => Object.assign(new Error(msg), { statusCode });

const activeAdmins = () => db.prepare("select count(*) n from users where role = 'admin' and disabled = 0").get().n;
// the instance must always keep at least one active administrator
function guardLastAdmin(target, willStop) {
  if (target.role === 'admin' && !target.disabled && willStop && activeAdmins() <= 1) throw bad('at least one active administrator is required', 400);
}
const row = (id) => { const u = db.prepare('select * from users where id = ?').get(id); if (!u) throw bad('user not found', 404); return u; };

export function listUsers() {
  const groups = db.prepare('select m.user_id, g.id, g.name from group_members m join groups g on g.id = m.group_id order by g.name').all();
  return db.prepare('select id, email, name, role, disabled, must_change_password, created_at from users order by lower(name), id').all().map((u) => ({
    id: u.id, email: u.email, name: u.name, role: u.role, disabled: !!u.disabled, mustChangePassword: !!u.must_change_password, createdAt: u.created_at,
    groups: groups.filter((g) => g.user_id === u.id).map((g) => ({ id: g.id, name: g.name })),
  }));
}

// returns the new user and, when no password was supplied, the generated temporary one (shown once)
export async function createUser({ email, name, role = 'member', password }) {
  const temp = password ? undefined : auth.tempPassword();
  const user = await auth.createUser({ email, name, role, password: password || temp, mustChange: true });
  return { user, tempPassword: temp };
}

export function updateUser(id, patch) {
  const u = row(id);
  if (patch.role !== undefined && !['admin', 'member'].includes(patch.role)) throw bad('role must be admin or member');
  guardLastAdmin(u, (patch.role !== undefined && patch.role !== 'admin') || patch.disabled === true);
  if (patch.name !== undefined) {
    const n = String(patch.name).trim().slice(0, 80);
    if (!n) throw bad('name cannot be empty');
    db.prepare('update users set name = ? where id = ?').run(n, id);
  }
  if (patch.role !== undefined) db.prepare('update users set role = ? where id = ?').run(patch.role, id);
  if (patch.disabled !== undefined) {
    db.prepare('update users set disabled = ? where id = ?').run(patch.disabled ? 1 : 0, id);
    if (patch.disabled) auth.destroyUserSessions(id);
  }
  return auth.userById(id);
}

export function deleteUser(id, actorId) {
  const u = row(id);
  guardLastAdmin(u, true);
  if (actorId && actorId !== id) db.prepare('update connections set owner_id = ? where owner_id = ? and shared = 1').run(actorId, id); // shared connections outlive the administrator who registered them
  db.prepare("delete from diagram_access where subject_type = 'user' and subject_id = ?").run(id);
  db.prepare("delete from connection_access where subject_type = 'user' and subject_id = ?").run(id);
  db.prepare('delete from users where id = ?').run(id); // cascades: sessions, their diagrams/connections, memberships; comments keep their text with no user
}

// ---------- groups
export const listGroups = () => {
  const members = db.prepare('select m.group_id, u.id, u.name, u.email from group_members m join users u on u.id = m.user_id order by lower(u.name)').all();
  return db.prepare('select id, name from groups order by lower(name)').all().map((g) => ({ id: g.id, name: g.name, members: members.filter((m) => m.group_id === g.id).map((m) => ({ id: m.id, name: m.name, email: m.email })) }));
};
const gname = (name) => { const n = String(name ?? '').trim(); if (!n || n.length > 80) throw bad('group name must have 1 to 80 characters'); return n; };
export function createGroup(name) {
  const n = gname(name);
  if (db.prepare('select 1 from groups where name = ?').get(n)) throw bad('a group with this name already exists', 409);
  return Number(db.prepare('insert into groups (name, created_at) values (?, ?)').run(n, now()).lastInsertRowid);
}
export function renameGroup(id, name) {
  const n = gname(name);
  if (db.prepare('select 1 from groups where name = ? and id <> ?').get(n, id)) throw bad('a group with this name already exists', 409);
  if (!db.prepare('update groups set name = ? where id = ?').run(n, id).changes) throw bad('group not found', 404);
}
export function deleteGroup(id) {
  db.prepare("delete from diagram_access where subject_type = 'group' and subject_id = ?").run(id);
  db.prepare("delete from connection_access where subject_type = 'group' and subject_id = ?").run(id);
  if (!db.prepare('delete from groups where id = ?').run(id).changes) throw bad('group not found', 404);
}
export function addMember(groupId, userId) {
  if (!db.prepare('select 1 from groups where id = ?').get(groupId)) throw bad('group not found', 404);
  row(userId);
  db.prepare('insert or ignore into group_members (group_id, user_id) values (?, ?)').run(groupId, userId);
}
export function removeMember(groupId, userId) { db.prepare('delete from group_members where group_id = ? and user_id = ?').run(groupId, userId); }

// ---------- settings
export const getSettings = () => ({ orgName: auth.orgName(), allowSignup: auth.getSetting('allow_signup', '0') === '1', signupForcedBy: process.env.ALLOW_SIGNUP === '1' || process.env.ALLOW_SIGNUP === '0' ? process.env.ALLOW_SIGNUP : null });
export function putSettings({ orgName, allowSignup }) {
  if (orgName !== undefined) auth.setSetting('org_name', String(orgName).trim().slice(0, 80));
  if (allowSignup !== undefined) auth.setSetting('allow_signup', allowSignup ? '1' : '0');
  return getSettings();
}

// ---------- directory (any signed-in user; used to pick people/groups when sharing)
export function searchUsers(q, selfId) {
  q = String(q ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  return db.prepare("select id, name, email from users where disabled = 0 and id <> ? and (lower(email) like ? escape '\\' or lower(name) like ? escape '\\') order by lower(name) limit 8").all(selfId, like, like);
}
export const directoryGroups = () => db.prepare('select g.id, g.name, (select count(*) from group_members m where m.group_id = g.id) members from groups g order by lower(g.name)').all();
