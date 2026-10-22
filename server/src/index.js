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
import { loadParser } from './merge.js';
import { assertHostAllowed } from './policy.js';
import * as refresh from './refresh.js';
import * as agents from './agents.js';
import * as mcp from './mcp.js';

const TEST = process.env.OD_NO_LISTEN === '1'; // server/test/http.test.js: routes through app.inject, no port, no timers
// a share-link token is a bearer secret: it never reaches the request log
export const maskUrl = (url) => String(url).replace(/^\/(s|api\/shared)\/[^/?#]+/, '/$1/***');
export const app = Fastify({
  logger: !TEST && { serializers: { req: (r) => ({ method: r.method, url: maskUrl(r.url), host: r.host, remoteAddress: r.ip, remotePort: r.socket?.remotePort }) } },
  bodyLimit: 3 * 1024 * 1024, trustProxy: process.env.TRUST_PROXY === '1',
});
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
// a connection as the form sends it, for a person's own and for an administrator's shared one; an empty port is the engine's default
function validConn(b) {
  assertType(b.type);
  if (!['name', 'host', 'database', 'user'].every((k) => typeof b[k] === 'string' && b[k].trim())) throw bad('name, host, database and user are required');
  if (b.name.length > 80) throw bad('the connection name can have 80 characters at most');
  const port = b.port === '' || b.port == null ? (b.type === 'oracle' ? 1521 : 5432) : Number(b.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw bad('port must be a number from 1 to 65535');
  return { ...b, port };
}
const nameList = (v) => { if (!Array.isArray(v) || !v.length || !v.every((s) => typeof s === 'string' && s)) throw bad('select at least one schema'); return v; };
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

app.get('/api/health', () => (db.prepare('select 1').get(), { ok: true })); // also proves the database answers: the container HEALTHCHECK calls it

// ---------- accounts
const where = (req) => `${auth.agentOf(req.headers['user-agent'])} · ${req.ip}`; // what the audit log and the session list say about the device
const startSession = (reply, req, user) => reply.header('set-cookie', auth.sessionCookie(auth.createSession(user.id, { ip: req.ip, agent: auth.agentOf(req.headers['user-agent']) }), req));
app.get('/api/auth/me', (req) => ({ user: req.user, signup: auth.signupAllowed(), firstRun: auth.userCount() === 0, org: auth.orgName(), groups: req.user ? auth.groupsOf(req.user.id) : [] }));
app.post('/api/auth/register', async (req, reply) => {
  const user = await auth.register(req.body ?? {}, req.ip);
  startSession(reply, req, user);
  audit.log(user, 'auth.register', { detail: where(req) });
  return { user };
});
app.post('/api/auth/login', async (req, reply) => {
  let user;
  try { user = await auth.login(req.body ?? {}, req.ip); } catch (e) { // the attempt is logged with the address, never with the password
    audit.log(null, 'auth.login_failed', { target: String(req.body?.email ?? '').trim().toLowerCase().slice(0, 120), ok: false, detail: `${e.message} · ${where(req)}` });
    throw e;
  }
  startSession(reply, req, user);
  audit.log(user, 'auth.login', { detail: where(req) });
  return { user };
});
app.post('/api/auth/logout', (req, reply) => {
  if (req.user) audit.log(req.user, 'auth.logout', { detail: where(req) });
  auth.destroySession(auth.tokenFromRequest(req));
  reply.header('set-cookie', auth.sessionCookie(null, req));
  return { ok: true };
});
app.post('/api/auth/password', async (req) => {
  if (!req.user) throw bad('login required', 401);
  try { await auth.changePassword(req.user.id, req.body ?? {}, auth.tokenFromRequest(req)); } catch (e) { audit.log(req.user, 'auth.password_changed', { ok: false, detail: `${e.message} · ${where(req)}` }); throw e; }
  audit.log(req.user, 'auth.password_changed', { detail: `other sessions ended · ${where(req)}` });
  return { user: auth.userById(req.user.id) };
});
// recovery key: made while signed in, used (signed out) to choose a new password
app.get('/api/auth/recovery', (req) => { if (!req.user) throw bad('login required', 401); return auth.recoveryStatus(req.user.id); });
app.post('/api/auth/recovery', async (req) => {
  if (!req.user) throw bad('login required', 401);
  const key = await auth.createRecoveryKey(req.user.id, req.body?.password);
  audit.log(req.user, 'auth.recovery_key_created', { detail: where(req) });
  return { key };
});
app.delete('/api/auth/recovery', (req) => {
  if (!req.user) throw bad('login required', 401);
  auth.removeRecoveryKey(req.user.id);
  audit.log(req.user, 'auth.recovery_key_removed', { detail: where(req) });
  return { ok: true };
});
app.post('/api/auth/recover', async (req, reply) => {
  let user;
  try { user = await auth.recoverPassword(req.body ?? {}, req.ip); } catch (e) {
    audit.log(null, 'auth.recovery_failed', { target: String(req.body?.email ?? '').trim().toLowerCase().slice(0, 120), ok: false, detail: `${e.message} · ${where(req)}` });
    throw e;
  }
  startSession(reply, req, user);
  audit.log(user, 'auth.password_recovered', { detail: `all other sessions ended, the key is used up · ${where(req)}` });
  return { user };
});
// the person's own sessions (devices): list, end one, end all the others
app.get('/api/auth/sessions', (req) => { if (!req.user) throw bad('login required', 401); return auth.listSessions(req.user.id, auth.tokenFromRequest(req)); });
app.delete('/api/auth/sessions', (req) => { // all the others
  if (!req.user) throw bad('login required', 401);
  const n = auth.revokeSessions(req.user.id, { exceptToken: auth.tokenFromRequest(req) });
  audit.log(req.user, 'auth.session_revoked', { detail: `all other sessions (${n}) · ${where(req)}` });
  return { ended: n };
});
app.delete('/api/auth/sessions/:id', (req) => {
  if (!req.user) throw bad('login required', 401);
  const n = auth.revokeSessions(req.user.id, { id: req.params.id, exceptToken: auth.tokenFromRequest(req) }); // never the one in use: that is "sign out"
  if (!n) throw bad('session not found', 404);
  audit.log(req.user, 'auth.session_revoked', { detail: `one session · ${where(req)}` });
  return { ended: n };
});
// delete the own account (needs the password); the last administrator cannot
app.delete('/api/auth/account', async (req, reply) => {
  if (!req.user) throw bad('login required', 401);
  if (auth.isLimited(`d|${req.user.id}`, 5)) throw bad('too many attempts, try again in a few minutes', 429);
  if (!(await auth.checkPassword(req.user.id, req.body?.password))) { auth.recordFail(`d|${req.user.id}`); throw bad('password is wrong', 403); }
  admin.closeAccount(req.user.id);
  audit.log(req.user, 'auth.account_closed', { target: req.user.email, detail: `diagrams kept ${admin.GRACE_DAYS} days for an administrator · ${where(req)}` });
  reply.header('set-cookie', auth.sessionCookie(null, req));
  return { ok: true };
});

// ---------- administration (administrators only)
const adminOnly = (req) => { if (req.user?.role !== 'admin') throw bad('administrator access required', 403); };
const uid = (req) => { const n = Number(req.params.id); if (!Number.isInteger(n)) throw bad('invalid id'); return n; };
app.get('/api/admin/users', (req) => { adminOnly(req); return admin.listUsers(); });
app.post('/api/admin/users', async (req) => { adminOnly(req); return admin.createUser(req.body ?? {}); });
app.patch('/api/admin/users/:id', (req) => { adminOnly(req); return { user: admin.updateUser(uid(req), req.body ?? {}) }; });
app.post('/api/admin/users/:id/reset-password', async (req) => { adminOnly(req); return { tempPassword: await auth.adminSetPassword(uid(req), req.body?.password) }; });
app.delete('/api/admin/users/:id', (req) => { adminOnly(req); admin.deleteUser(uid(req), req.user.id); return { ok: true }; });
app.delete('/api/admin/users/:id/sessions', (req) => { adminOnly(req); return { ended: auth.revokeSessions(uid(req)) }; }); // sign this person out everywhere
// agents (the MCP connector's accounts) and their tokens: administrators only; a token is shown once, when it is made
app.get('/api/admin/agents', (req) => { adminOnly(req); return agents.listAgents(); });
app.post('/api/admin/agents', (req) => { adminOnly(req); return agents.createAgent(req.body?.name); });
app.patch('/api/admin/agents/:id', (req) => { adminOnly(req); agents.updateAgent(uid(req), req.body ?? {}); return { ok: true }; });
app.delete('/api/admin/agents/:id', (req) => { adminOnly(req); agents.deleteAgent(uid(req)); return { ok: true }; });
app.post('/api/admin/agents/:id/tokens', (req) => { adminOnly(req); return agents.createToken(uid(req), req.body ?? {}); });
app.delete('/api/admin/agents/:id/tokens/:tid', (req) => { adminOnly(req); agents.revokeToken(uid(req), req.params.tid); return { ok: true }; });

// diagrams of closed accounts: kept for 7 days, an administrator hands them over or deletes them
app.get('/api/admin/closed-diagrams', (req) => { adminOnly(req); return admin.listClosed(); });
app.post('/api/admin/closed-diagrams/:id/adopt', (req) => { adminOnly(req); admin.adoptClosed(req.params.id, req.body?.userId, req.body?.groupId, dg); return { ok: true }; });
app.delete('/api/admin/closed-diagrams/:id', (req) => { adminOnly(req); admin.deleteClosed(req.params.id); return { ok: true }; });
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
  const b = validConn(req.body ?? {});
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
app.post('/api/connections', async (req) => {
  const b = validConn(req.body ?? {});
  await assertHostAllowed(b.host);
  return { id: store.upsert(req.user.id, b) };
});
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
  const schemas = nameList(req.body?.schemas);
  const c = await resolve(req.body, req.user);
  return audited(req, c, 'tables', (r) => `${schemas.join(', ')}: ${r.tables.length} tables listed`, async () => ({ tables: await listTables(c, schemas) }));
});
app.post('/api/import', async (req) => {
  const { tables, ddl } = req.body ?? {};
  const schemas = nameList(req.body?.schemas);
  if (tables !== undefined && tables !== null && !(Array.isArray(tables) && tables.every((t) => typeof t === 'string'))) throw bad('tables must be a list of table names'); // an empty list means "all tables" (.specs/12-table-selection.md)
  const c = await resolve(req.body, req.user);
  const refreshing = req.body?.purpose === 'refresh';
  const out = await audited(req, c, refreshing ? 'refresh' : 'import', (r) => `${schemas.join(', ')}: ${r.tables} tables, ${r.refs} refs`, () => generate(c, { schemas, tables, ddl }));
  const id = refreshing && diagramOf(req);
  if (id) refresh.clear(id); // a manual refresh that works lifts the pause of the scheduled one
  return out;
});
// the import itself: used by the manual import/refresh and by the scheduled refresh (refresh.js), so both obey the same guardrail
async function generate(c, { schemas, tables, ddl }) {
  const warnings = await checkPrivileges(c, schemas);
  if (warnings.length && c.blockWritable) throw bad(`Blocked by guardrail: this credential ${warnings.join('; ')}. Use a read-only user, or turn off "Block credentials with write privileges".`, 403);
  const model = await importModel(c, schemas, tables);
  const dbml = toDbml(model, { ddl: ddl === true });
  return { dbml, gen: refresh.genHash(dbml), tables: model.tables.length, refs: model.refs.length, missing: model.missing, warnings, at: Date.now() };
}

// ---------- diagrams: own and shared with me (directly or through a group)
const LEVEL = { ...dg.RANK, admin: 3, owner: 4 }; // 'admin' = administrator on someone else's diagram
const can = (role, min) => LEVEL[role] >= LEVEL[min];
app.get('/api/diagrams', (req) => dg.list(req.user));
app.post('/api/diagrams', (req) => ({ id: dg.create(req.user.id, req.body ?? {}) }));
app.get('/api/diagrams/:id', (req) => { const d = dg.getForUser(req.user, req.params.id); return d.role === 'owner' && d.source ? { ...d, refresh: refresh.stateOf(d.id) } : d; }); // refresh: last scheduled run / error / paused, for the owner
const baseVersion = (b) => { if (b?.baseVersion === undefined) return undefined; if (!Number.isInteger(b.baseVersion)) throw bad('baseVersion must be an integer'); return b.baseVersion; }; // the version the client last saw; a stale one is answered with 409
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
app.post('/api/diagrams/:id/shares', async (req) => dg.createShare(req.user, req.params.id, req.body?.access, req.body?.password ? await auth.hashSecret(linkPassword(req.body.password)) : null, req.body?.expiresInDays));
app.patch('/api/shares/:id', async (req) => {
  const b = req.body ?? {};
  if (b.access !== undefined) dg.setShareAccess(req.user, req.params.id, b.access);
  if ('expiresInDays' in b) dg.setShareExpiry(req.user, req.params.id, b.expiresInDays); // null = never
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

// ---------- MCP connector (agents.js, mcp.js): POST /mcp with `Authorization: Bearer odt_...`; the token works nowhere else
app.get('/mcp', (_req, reply) => reply.code(405).header('allow', 'POST').send({ error: 'use POST' })); // no server-initiated stream
app.post('/mcp', { bodyLimit: 3_000_000 }, async (req, reply) => {
  const origin = req.headers.origin; // browsers send one; a legitimate MCP client does not (DNS-rebinding guard of the transport spec)
  if (origin) { let host; try { host = new URL(origin).host; } catch { /* malformed */ } if (host !== req.headers.host) return reply.code(403).send({ error: 'origin not allowed' }); }
  const agent = agents.authenticate(req.headers.authorization);
  if (!agent) return reply.code(401).header('www-authenticate', 'Bearer').send({ error: 'a valid agent token is required (and agents must be switched on in Administration → Settings)' });
  if (!agents.withinRate(agent.tokenId)) return reply.code(429).send({ error: 'too many requests, slow down' });
  if (req.body?.method === 'tools/call') await loadParser(); // update_diagram validates the DBML; loaded on the first agent call, not at start-up (merge.js)
  const res = mcp.handle(req.body, agent);
  return res === null ? reply.code(202).send() : reply.send(res);
});

// ---------- errors + static UI (SPA: unknown GET paths such as /s/<token> serve index.html)
app.setErrorHandler((e, req, reply) => { if (!e.statusCode || e.statusCode >= 500) req.log.error(e); return reply.status(e.statusCode || 500).send({ error: e.message, ...(e.code === 'share_password' ? { code: e.code } : e.code === 'conflict' ? { code: e.code, version: e.version } : {}) }); }); // driver errors (bad password, TLS...) are meant to be shown
// hashed files under assets/ never change, so they are cached for a year; index.html is revalidated so a new build is picked up.
// The web build writes .br / .gz next to each asset (web/precompress.js); preCompressed picks one by Accept-Encoding, else the plain file.
app.register(fstatic, {
  root: process.env.OD_PUBLIC_DIR || fileURLToPath(new URL('../public', import.meta.url)),
  preCompressed: true,
  setHeaders: (res, path) => res.header('cache-control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache'),
});
app.setNotFoundHandler((req, reply) => (req.method === 'GET' && !req.url.startsWith('/api/') ? reply.sendFile('index.html') : reply.status(404).send({ error: 'not found' })));

if (TEST) await app.ready();
else {
  const housekeeping = () => { audit.purge(); for (const u of admin.purgeClosed()) audit.log(null, 'auth.account_purged', { target: u.name, detail: `${u.diagrams} diagram(s) deleted after ${admin.GRACE_DAYS} days` }); };
  housekeeping(); setInterval(housekeeping, 24 * 3600 * 1000).unref(); // the audit log keeps 180 days; closed accounts are deleted after their 7 days
  refresh.start({ resolve, generate }); // scheduled metadata refresh of linked diagrams
  // `cli.js restore` refuses while this mark is fresh (the app may run in another container than the CLI); removed on a clean stop
  const alive = () => auth.setSetting('server_alive', Math.floor(Date.now() / 1000)); alive(); setInterval(alive, 30_000).unref();
  await app.listen({ port: +process.env.PORT || 3000, host: '0.0.0.0' });

  // docker stop / Ctrl+C: finish the requests in flight and fold the WAL into the database file, instead of being killed ten seconds later (exit 137)
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.once(sig, async () => {
      try { await app.close(); db.prepare("delete from settings where key = 'server_alive'").run(); db.exec('pragma wal_checkpoint(truncate)'); } finally { process.exit(0); }
    });
  }
}
