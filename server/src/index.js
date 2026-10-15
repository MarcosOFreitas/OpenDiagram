import Fastify from 'fastify';
import fstatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import * as store from './store.js';
import * as auth from './auth.js';
import * as dg from './diagrams.js';
import * as presence from './presence.js';
import * as audit from './audit.js';
import * as admin from './admin.js';
import { listSchemas, importModel, listTables, privilegeWarnings } from './introspect.js';
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
const assertType = (t) => { if (!['postgres', 'oracle'].includes(t)) throw bad('type must be postgres or oracle'); };
async function resolve(b, user) {
  const saved = b.id ? store.getForUse(user, b.id) : {};
  if (b.id && !saved) throw bad('connection not found', 404);
  const draft = saved.shared ? {} : Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined && v !== null && v !== '')); // a shared connection is used exactly as registered: a request can never point its credentials somewhere else
  const c = { ...saved, ...draft };
  assertType(c.type);
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
  const user = await auth.register(req.body ?? {}, req.ip);
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
app.patch('/api/admin/users/:id', (req) => { adminOnly(req); return { user: admin.updateUser(uid(req), req.body ?? {}) }; });
app.post('/api/admin/users/:id/reset-password', async (req) => { adminOnly(req); return { tempPassword: await auth.adminSetPassword(uid(req), req.body?.password) }; });
app.delete('/api/admin/users/:id', (req) => { adminOnly(req); admin.deleteUser(uid(req), req.user.id); return { ok: true }; });
app.get('/api/admin/groups', (req) => { adminOnly(req); return admin.listGroups(); });
app.post('/api/admin/groups', (req) => { adminOnly(req); return { id: admin.createGroup(req.body?.name) }; });
app.patch('/api/admin/groups/:id', (req) => { adminOnly(req); admin.renameGroup(uid(req), req.body?.name); return { ok: true }; });
app.delete('/api/admin/groups/:id', (req) => { adminOnly(req); admin.deleteGroup(uid(req)); return { ok: true }; });
app.put('/api/admin/groups/:id/members/:uid', (req) => { adminOnly(req); admin.addMember(uid(req), Number(req.params.uid)); return { ok: true }; });
app.delete('/api/admin/groups/:id/members/:uid', (req) => { adminOnly(req); admin.removeMember(uid(req), Number(req.params.uid)); return { ok: true }; });
// every administrator action that changes something is audited (route and ids only: never the request body, which may hold passwords)
app.addHook('onResponse', async (req, reply) => {
  if (req.method === 'GET' || !req.user || !req.url.startsWith('/api/admin/')) return;
  const target = String(req.routeOptions?.url || req.url).replace('/api/admin', '');
  audit.log(req.user, `admin.${req.method.toLowerCase()}`, { target, connectionId: target.startsWith('/connections') ? req.params?.id : undefined, ok: reply.statusCode < 400, detail: JSON.stringify(req.params ?? {}) });
});

// shared database connections: registered once by an administrator (read-only credential), used by chosen people and groups without seeing the secret
app.get('/api/admin/connections', (req) => { adminOnly(req); return store.listShared(); });
app.post('/api/admin/connections', async (req) => {
  adminOnly(req);
  const b = req.body ?? {};
  assertType(b.type);
  if (!b.name || !b.host || !b.database || !b.user) throw bad('name, host, database and user are required');
  await assertHostAllowed(b.host);
  return { id: store.upsert(req.user.id, b, { shared: true }) };
});
app.put('/api/admin/connections/:id/access', (req) => { adminOnly(req); store.setAccess(req.params.id, req.body ?? {}); return { ok: true }; });
app.delete('/api/admin/connections/:id', (req) => { adminOnly(req); if (!store.removeShared(req.params.id)) throw bad('shared connection not found', 404); return { ok: true }; });
app.get('/api/admin/audit', (req) => { adminOnly(req); return audit.list(req.query ?? {}); });
app.get('/api/admin/audit/facets', (req) => { adminOnly(req); return audit.facets(); });
app.get('/api/admin/audit.csv', (req, reply) => { adminOnly(req); reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="audit-log.csv"'); return audit.csv(audit.list({ ...(req.query ?? {}), limit: 5000 })); });
app.get('/api/admin/settings', (req) => { adminOnly(req); return admin.getSettings(); });
app.put('/api/admin/settings', (req) => { adminOnly(req); return admin.putSettings(req.body ?? {}); });

// people and groups to share with (any signed-in user)
app.get('/api/directory/users', (req) => admin.searchUsers(req.query?.q, req.user.id));
app.get('/api/directory/groups', () => admin.directoryGroups());

// ---------- saved connections (private to the account)
app.get('/api/connections', (req) => store.listFor(req.user)); // own + shared ones the account may use
app.post('/api/connections', (req) => ({ id: store.upsert(req.user.id, req.body ?? {}) }));
app.delete('/api/connections/:id', (req) => (store.remove(req.user.id, req.params.id), { ok: true }));

// test + list schemas; also reports credentials that can do more than read metadata
// every use of a SHARED connection goes to the audit log (who, which connection, which diagram, whether it worked)
const diagramOf = (req) => { try { return typeof req.body?.diagramId === 'string' ? dg.getForUser(req.user, req.body.diagramId).id : null; } catch { return null; } }; // only a diagram the person can open
async function audited(req, c, action, detail, run) {
  try {
    const r = await run();
    if (c.shared) audit.log(req.user, `connection.${action}`, { target: c.name, connectionId: c.id, diagramId: diagramOf(req), detail: detail(r) });
    return r;
  } catch (e) {
    if (c.shared) audit.log(req.user, `connection.${action}`, { target: c.name, connectionId: c.id, diagramId: diagramOf(req), ok: false, detail: e.message });
    throw e;
  }
}
app.post('/api/schemas', async (req) => {
  const c = await resolve(req.body ?? {}, req.user);
  return audited(req, c, 'test', (r) => `${r.schemas.length} schemas${r.warnings.length ? `, ${r.warnings.length} warning(s)` : ''}`, async () => {
    const schemas = await listSchemas(c);
    return { schemas, warnings: await checkPrivileges(c, schemas), readOnly: true };
  });
});
app.post('/api/tables', async (req) => {
  const { schemas } = req.body ?? {};
  if (!schemas?.length) throw bad('select at least one schema');
  const c = await resolve(req.body, req.user);
  return audited(req, c, 'tables', (r) => `${schemas.join(', ')}: ${r.tables.length} tables listed`, async () => ({ tables: await listTables(c, schemas) }));
});
app.post('/api/import', async (req) => {
  const { schemas, tables, ddl } = req.body ?? {};
  if (!schemas?.length) throw bad('select at least one schema');
  const c = await resolve(req.body, req.user);
  return audited(req, c, req.body?.purpose === 'refresh' ? 'refresh' : 'import', (r) => `${schemas.join(', ')}: ${r.tables} tables, ${r.refs} refs`, async () => {
    const warnings = await checkPrivileges(c, schemas);
    if (warnings.length && c.blockWritable) throw bad(`Blocked by guardrail: this credential ${warnings.join('; ')}. Use a read-only user, or turn off "Block credentials with write privileges".`, 403);
    const model = await importModel(c, schemas, tables);
    return { dbml: toDbml(model, { ddl: ddl === true }), tables: model.tables.length, refs: model.refs.length, warnings, at: Date.now() };
  });
});

// ---------- diagrams: own and shared with me (directly or through a group)
const LEVEL = { ...dg.RANK, admin: 3, owner: 4 }; // 'admin' = administrator on someone else's diagram
const can = (role, min) => LEVEL[role] >= LEVEL[min];
app.get('/api/diagrams', (req) => dg.list(req.user));
app.post('/api/diagrams', (req) => ({ id: dg.create(req.user.id, req.body ?? {}) }));
app.get('/api/diagrams/:id', (req) => dg.getForUser(req.user, req.params.id));
const baseVersion = (b) => (Number.isInteger(b?.baseVersion) ? b.baseVersion : undefined); // the version the client last saw; a stale one is answered with 409
const saveOpts = (req) => ({ baseVersion: baseVersion(req.body), actor: req.user, separate: req.body?.overwrite === true || req.body?.entry === 'refresh', reason: req.body?.entry === 'refresh' ? 'Refresh from database' : '' }); // overwrite: the person chose to replace a newer version; entry 'refresh': the save follows a metadata refresh. Both get their own history entry
app.put('/api/diagrams/:id', (req) => {
  const d = dg.getForUser(req.user, req.params.id);
  const o = saveOpts(req);
  let version;
  if (d.role === 'owner') version = dg.update(d.id, req.body ?? {}, { includeSource: true, ...o });
  else if (d.role === 'admin') version = dg.update(d.id, { title: req.body?.title, dbml: req.body?.dbml, layout: req.body?.layout }, o); // never the owner's connection link
  else if (can(d.role, 'edit')) version = dg.update(d.id, { dbml: req.body?.dbml, layout: req.body?.layout }, o); // editors change content only: never title, connection link or sharing
  else throw bad('this diagram is read-only for you', 403);
  return { ok: true, version };
});

// history: people who can edit (it holds earlier content). Restoring saves the old content as a new version, so nothing is ever lost.
const editable = (req) => { const d = dg.getForUser(req.user, req.params.id); if (!can(d.role, 'edit')) throw bad('history is available to people who can edit', 403); return d; };
app.get('/api/diagrams/:id/versions', (req) => dg.listVersions(editable(req).id));
app.get('/api/diagrams/:id/versions/:vid', (req) => dg.getVersion(editable(req).id, +req.params.vid));
app.post('/api/diagrams/:id/versions', (req) => { dg.nameVersion(editable(req).id, req.body?.label, req.user); return { ok: true }; });
app.delete('/api/diagrams/:id/versions/:vid', (req) => { dg.deleteVersion(editable(req).id, +req.params.vid); return { ok: true }; });
app.post('/api/diagrams/:id/versions/:vid/restore', (req) => {
  const d = editable(req), v = dg.getVersion(d.id, +req.params.vid);
  const patch = { dbml: v.dbml, layout: v.layout, ...(d.role === 'owner' || d.role === 'admin' ? { title: v.title } : {}) }; // editors never change the title
  return { ok: true, version: dg.update(d.id, patch, { actor: req.user }) };
});
app.delete('/api/diagrams/:id', (req) => {
  if (!can(dg.getForUser(req.user, req.params.id).role, 'admin')) throw bad('only the owner or an administrator can delete a diagram', 403);
  dg.remove(req.user, req.params.id);
  return { ok: true };
});

// presence: a heartbeat from every open tab says who has the diagram open (and what they have selected); the answer lists the others and the current version
const tabId = (b) => (typeof b?.tab === 'string' && /^[\w-]{6,40}$/.test(b.tab) ? b.tab : null);
app.post('/api/diagrams/:id/presence', (req) => {
  const d = dg.getForUser(req.user, req.params.id), tab = tabId(req.body);
  if (!tab) throw bad('invalid tab id');
  return { viewers: presence.beat(d.id, tab, { key: req.user.id, name: req.user.name || req.user.email }, req.body, req.body?.leave === true), version: dg.versionOf(d.id) };
});
app.get('/api/diagrams/:id/shares', (req) => dg.listShares(req.user, req.params.id));
// a link may carry a password (scrypt hash; never returned): visitors send it in the x-share-password header
const linkPassword = (p) => { if (typeof p !== 'string' || p.length < 6 || p.length > 200) throw bad('link password must have 6 to 200 characters'); return p; };
app.post('/api/diagrams/:id/shares', async (req) => dg.createShare(req.user, req.params.id, req.body?.access, req.body?.password ? await auth.hashSecret(linkPassword(req.body.password)) : null));
app.patch('/api/shares/:id', async (req) => {
  const b = req.body ?? {};
  if (b.access !== undefined) dg.setShareAccess(req.user, req.params.id, b.access);
  if ('password' in b) dg.setSharePassword(req.user, req.params.id, b.password ? await auth.hashSecret(linkPassword(b.password)) : null); // empty/null removes it
  return { ok: true };
});
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
async function share(req, need) {
  const s = dg.shareByToken(req.params.token);
  if (!s) throw bad('this link does not exist or was revoked', 404);
  if (s.passwordHash) {
    const key = `s|${req.ip}|${s.id}`;
    if (auth.isLimited(key, 10)) throw bad('too many wrong passwords, try again in a few minutes', 429);
    let given = req.headers['x-share-password'];
    try { given = typeof given === 'string' ? decodeURIComponent(given) : ''; } catch { given = ''; }
    if (!given) throw Object.assign(bad('this link is protected by a password', 401), { code: 'share_password' });
    if (!(await auth.verifySecret(given, s.passwordHash))) { auth.recordFail(key); throw Object.assign(bad('wrong password', 401), { code: 'share_password' }); }
  }
  if (need) {
    if (dg.RANK[s.access] < dg.RANK[need]) throw bad(`this link does not allow ${need === 'edit' ? 'editing' : 'commenting'}`, 403);
    if (!req.user) throw bad('login required', 401);
  }
  return s;
}
app.get('/api/shared/:token', async (req) => {
  const s = await share(req);
  return { title: s.title, dbml: s.dbml, layout: s.layout, version: s.version, access: s.access, owner: s.ownerName, isOwner: req.user?.id === s.ownerId, comments: dg.listComments(s.diagramId) };
});
app.post('/api/shared/:token/presence', async (req) => { // visitors of a link take part too (anonymous ones as "Guest")
  const s = await share(req), tab = tabId(req.body);
  if (!tab) throw bad('invalid tab id');
  return { viewers: presence.beat(s.diagramId, tab, req.user ? { key: req.user.id, name: req.user.name || req.user.email } : { key: `guest:${tab}`, name: 'Guest' }, req.body, req.body?.leave === true), version: dg.versionOf(s.diagramId) };
});
app.put('/api/shared/:token', async (req) => {
  const s = await share(req, 'edit');
  const { dbml, layout } = req.body ?? {};
  const version = dg.update(s.diagramId, { dbml, layout }, saveOpts(req)); // editors change the diagram itself, never its title, connection link or sharing
  return { ok: true, version };
});
app.post('/api/shared/:token/comments', async (req) => dg.addComment((await share(req, 'comment')).diagramId, req.user, req.body ?? {}));
app.delete('/api/shared/:token/comments/:cid', async (req) => { const s = await share(req, 'comment'); dg.deleteComment(s.diagramId, req.params.cid, req.user, req.user.id === s.ownerId); return { ok: true }; });

// ---------- errors + static UI (SPA: unknown GET paths such as /s/<token> serve index.html)
app.setErrorHandler((e, _req, reply) => reply.status(e.statusCode || 500).send({ error: e.message, ...(e.code === 'share_password' ? { code: e.code } : e.code === 'conflict' ? { code: e.code, version: e.version } : {}) })); // driver errors (bad password, TLS...) are meant to be shown
app.register(fstatic, { root: fileURLToPath(new URL('../public', import.meta.url)) });
app.setNotFoundHandler((req, reply) => (req.method === 'GET' && !req.url.startsWith('/api/') ? reply.sendFile('index.html') : reply.status(404).send({ error: 'not found' })));

audit.purge(); setInterval(audit.purge, 24 * 3600 * 1000).unref(); // the audit log keeps 180 days
await app.listen({ port: +process.env.PORT || 3000, host: '0.0.0.0' });
