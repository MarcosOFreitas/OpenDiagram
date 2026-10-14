import Fastify from 'fastify';
import fstatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import * as store from './store.js';
import * as auth from './auth.js';
import * as dg from './diagrams.js';
import * as admin from './admin.js';
import { listSchemas, importModel, privilegeWarnings } from './introspect.js';
import { toDbml } from './dbml.js';
import { assertHostAllowed } from './policy.js';

const app = Fastify({ logger: true, bodyLimit: 3 * 1024 * 1024, trustProxy: process.env.TRUST_PROXY === '1' });
const bad = (msg, statusCode = 400) => Object.assign(new Error(msg), { statusCode });

// accept an empty body with Content-Type: application/json (DELETE/logout from fetch clients) instead of failing with 400
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  if (!body) return done(null, undefined);
  try { done(null, JSON.parse(body)); } catch { done(bad('invalid JSON body')); }
});

// ---------- cross-cutting: CSRF guard, login requirement, security headers
app.addHook('onRequest', async (req) => {
  if (!req.url.startsWith('/api/')) return;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
    let host;
    try { host = new URL(req.headers.origin).host; } catch { /* malformed */ }
    if (host !== req.headers.host) throw bad('cross-origin request blocked', 403);
  }
  req.user = auth.userFromRequest(req);
  const path = req.url.split('?')[0];
  const open = path === '/api/health' || path.startsWith('/api/auth/') || path.startsWith('/api/shared/');
  if (!open && !req.user) throw bad('login required', 401);
  // accounts created/reset by an admin must pick their own password before doing anything else
  if (req.user?.mustChangePassword && !path.startsWith('/api/auth/') && !path.startsWith('/api/shared/') && path !== '/api/health') throw bad('password change required', 403);
});
app.addHook('onSend', async (_req, reply) => {
  reply.header('x-content-type-options', 'nosniff').header('referrer-policy', 'no-referrer').header('x-frame-options', 'DENY')
    .header('content-security-policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
});

// saved connection (if `id`) overlaid with the draft fields from the form; empty values keep the stored ones
async function resolve(b, owner) {
  const saved = b.id ? store.get(owner, b.id) : {};
  if (b.id && !saved) throw bad('connection not found', 404);
  const draft = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const c = { ...saved, ...draft };
  if (!['postgres', 'oracle'].includes(c.type)) throw bad('type must be postgres or oracle');
  if (!c.host || !c.database || !c.user) throw bad('host, database and user are required');
  c.tls = ['off', 'verify', 'noverify'].includes(c.tls) ? c.tls : 'off';
  await assertHostAllowed(c.host);
  return c;
}
// a failed check is itself a warning: never silently treat "could not verify" as "safe"
const checkPrivileges = (c, schemas) => privilegeWarnings(c, schemas).catch((e) => [`could not verify privileges (${String(e.message).split('\n')[0]})`]);

app.get('/api/health', () => ({ ok: true }));

// ---------- accounts
const startSession = (reply, req, user) => reply.header('set-cookie', auth.sessionCookie(auth.createSession(user.id), req));
app.get('/api/auth/me', (req) => ({ user: req.user, signup: auth.signupAllowed(), firstRun: auth.userCount() === 0, org: auth.orgName(), groups: req.user ? auth.groupsOf(req.user.id) : [] }));
app.post('/api/auth/register', async (req, reply) => {
  const first = auth.userCount() === 0;
  const user = await auth.register(req.body ?? {}, req.ip);
  if (first) { const n = store.adoptLegacy(user.id); if (n) req.log.info(`adopted ${n} legacy connection(s) for ${user.email}`); }
  startSession(reply, req, user);
  return { user };
});
app.post('/api/auth/login', async (req, reply) => {
  const user = await auth.login(req.body ?? {}, req.ip);
  startSession(reply, req, user);
  return { user };
});
app.post('/api/auth/logout', (req, reply) => {
  auth.destroySession(auth.tokenFromRequest(req));
  reply.header('set-cookie', auth.sessionCookie(null, req));
  return { ok: true };
});
app.post('/api/auth/password', async (req) => {
  if (!req.user) throw bad('login required', 401);
  await auth.changePassword(req.user.id, req.body ?? {}, auth.tokenFromRequest(req));
  return { user: auth.userById(req.user.id) };
});

// ---------- administration (administrators only)
const adminOnly = (req) => { if (req.user?.role !== 'admin') throw bad('administrator access required', 403); };
const uid = (req) => { const n = Number(req.params.id); if (!Number.isInteger(n)) throw bad('invalid id'); return n; };
app.get('/api/admin/users', (req) => { adminOnly(req); return admin.listUsers(); });
app.post('/api/admin/users', async (req) => { adminOnly(req); return admin.createUser(req.body ?? {}); });
app.patch('/api/admin/users/:id', (req) => { adminOnly(req); return { user: admin.updateUser(uid(req), req.body ?? {}, req.user.id) }; });
app.post('/api/admin/users/:id/reset-password', async (req) => { adminOnly(req); return { tempPassword: await auth.adminSetPassword(uid(req), req.body?.password) }; });
app.delete('/api/admin/users/:id', (req) => { adminOnly(req); admin.deleteUser(uid(req)); return { ok: true }; });
app.get('/api/admin/groups', (req) => { adminOnly(req); return admin.listGroups(); });
app.post('/api/admin/groups', (req) => { adminOnly(req); return { id: admin.createGroup(req.body?.name) }; });
app.patch('/api/admin/groups/:id', (req) => { adminOnly(req); admin.renameGroup(uid(req), req.body?.name); return { ok: true }; });
app.delete('/api/admin/groups/:id', (req) => { adminOnly(req); admin.deleteGroup(uid(req)); return { ok: true }; });
app.put('/api/admin/groups/:id/members/:uid', (req) => { adminOnly(req); admin.addMember(uid(req), Number(req.params.uid)); return { ok: true }; });
app.delete('/api/admin/groups/:id/members/:uid', (req) => { adminOnly(req); admin.removeMember(uid(req), Number(req.params.uid)); return { ok: true }; });
app.get('/api/admin/settings', (req) => { adminOnly(req); return admin.getSettings(); });
app.put('/api/admin/settings', (req) => { adminOnly(req); return admin.putSettings(req.body ?? {}); });

// people and groups to share with (any signed-in user)
app.get('/api/directory/users', (req) => admin.searchUsers(req.query?.q, req.user.id));
app.get('/api/directory/groups', () => admin.directoryGroups());

// ---------- saved connections (private to the account)
app.get('/api/connections', (req) => store.list(req.user.id));
app.post('/api/connections', (req) => ({ id: store.upsert(req.user.id, req.body ?? {}) }));
app.delete('/api/connections/:id', (req) => (store.remove(req.user.id, req.params.id), { ok: true }));

// test + list schemas; also reports credentials that can do more than read metadata
app.post('/api/schemas', async (req) => {
  const c = await resolve(req.body ?? {}, req.user.id);
  const schemas = await listSchemas(c);
  return { schemas, warnings: await checkPrivileges(c, schemas), readOnly: true };
});
app.post('/api/import', async (req) => {
  const { schemas, tables } = req.body ?? {};
  if (!schemas?.length) throw bad('select at least one schema');
  const c = await resolve(req.body, req.user.id);
  const warnings = await checkPrivileges(c, schemas);
  if (warnings.length && c.blockWritable) throw bad(`Blocked by guardrail: this credential ${warnings.join('; ')}. Use a read-only user, or turn off "Block credentials with write privileges".`, 403);
  const model = await importModel(c, schemas, tables);
  return { dbml: toDbml(model), tables: model.tables.length, refs: model.refs.length, warnings, at: Date.now() };
});

// ---------- diagrams: own and shared with me (directly or through a group)
const LEVEL = { view: 0, comment: 1, edit: 2, admin: 3, owner: 4 }; // 'admin' = administrator on someone else's diagram
const can = (role, min) => LEVEL[role] >= LEVEL[min];
app.get('/api/diagrams', (req) => dg.list(req.user));
app.post('/api/diagrams', (req) => ({ id: dg.create(req.user.id, req.body ?? {}) }));
app.get('/api/diagrams/:id', (req) => dg.getForUser(req.user, req.params.id));
app.put('/api/diagrams/:id', (req) => {
  const d = dg.getForUser(req.user, req.params.id);
  if (d.role === 'owner') dg.update(d.id, req.body ?? {}, { includeSource: true });
  else if (d.role === 'admin') dg.update(d.id, { title: req.body?.title, dbml: req.body?.dbml, layout: req.body?.layout }); // never the owner's connection link
  else if (can(d.role, 'edit')) dg.update(d.id, { dbml: req.body?.dbml, layout: req.body?.layout }); // editors change content only: never title, connection link or sharing
  else throw bad('this diagram is read-only for you', 403);
  return { ok: true };
});
app.delete('/api/diagrams/:id', (req) => {
  if (!can(dg.getForUser(req.user, req.params.id).role, 'admin')) throw bad('only the owner or an administrator can delete a diagram', 403);
  dg.remove(req.user, req.params.id);
  return { ok: true };
});

app.get('/api/diagrams/:id/shares', (req) => dg.listShares(req.user, req.params.id));
app.post('/api/diagrams/:id/shares', (req) => dg.createShare(req.user, req.params.id, req.body?.access));
app.patch('/api/shares/:id', (req) => (dg.setShareAccess(req.user, req.params.id, req.body?.access), { ok: true }));
app.delete('/api/shares/:id', (req) => (dg.deleteShare(req.user, req.params.id), { ok: true }));

app.get('/api/diagrams/:id/access', (req) => dg.listGrants(req.user, req.params.id));
app.post('/api/diagrams/:id/access', (req) => (dg.setGrant(req.user, req.params.id, req.body ?? {}), { ok: true }));
app.patch('/api/access/:id', (req) => (dg.setGrantAccess(req.user, Number(req.params.id), req.body?.access), { ok: true }));
app.delete('/api/access/:id', (req) => (dg.deleteGrant(req.user, Number(req.params.id)), { ok: true }));

app.get('/api/diagrams/:id/comments', (req) => { dg.getForUser(req.user, req.params.id); return dg.listComments(req.params.id); });
app.post('/api/diagrams/:id/comments', (req) => {
  if (!can(dg.getForUser(req.user, req.params.id).role, 'comment')) throw bad('you can read but not comment on this diagram', 403);
  return dg.addComment(req.params.id, req.user, req.body ?? {});
});
app.delete('/api/diagrams/:id/comments/:cid', (req) => {
  const d = dg.getForUser(req.user, req.params.id);
  dg.deleteComment(d.id, req.params.cid, req.user, can(d.role, 'admin')); // owner and administrators may delete any comment
  return { ok: true };
});

// ---------- shared link access: what the link allows is decided by the diagram owner
function share(req, need) {
  const s = dg.shareByToken(req.params.token);
  if (!s) throw bad('this link does not exist or was revoked', 404);
  if (need) {
    if (dg.RANK[s.access] < dg.RANK[need]) throw bad(`this link does not allow ${need === 'edit' ? 'editing' : 'commenting'}`, 403);
    if (!req.user) throw bad('login required', 401);
  }
  return s;
}
app.get('/api/shared/:token', (req) => {
  const s = share(req);
  return { title: s.title, dbml: s.dbml, layout: s.layout, access: s.access, owner: s.ownerName, isOwner: req.user?.id === s.ownerId, comments: dg.listComments(s.diagramId) };
});
app.put('/api/shared/:token', (req) => {
  const s = share(req, 'edit');
  const { dbml, layout } = req.body ?? {};
  dg.update(s.diagramId, { dbml, layout }); // editors change the diagram itself, never its title, connection link or sharing
  return { ok: true };
});
app.post('/api/shared/:token/comments', (req) => dg.addComment(share(req, 'comment').diagramId, req.user, req.body ?? {}));
app.delete('/api/shared/:token/comments/:cid', (req) => { const s = share(req, 'comment'); dg.deleteComment(s.diagramId, req.params.cid, req.user, req.user.id === s.ownerId); return { ok: true }; });

// ---------- errors + static UI (SPA: unknown GET paths such as /s/<token> serve index.html)
app.setErrorHandler((e, _req, reply) => reply.status(e.statusCode || 500).send({ error: e.message })); // driver errors (bad password, TLS...) are meant to be shown
app.register(fstatic, { root: fileURLToPath(new URL('../public', import.meta.url)) });
app.setNotFoundHandler((req, reply) => (req.method === 'GET' && !req.url.startsWith('/api/') ? reply.sendFile('index.html') : reply.status(404).send({ error: 'not found' })));

await app.listen({ port: +process.env.PORT || 3000, host: '0.0.0.0' });
