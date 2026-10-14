// e2e checks for accounts, roles, groups, sharing and the SSRF policy against the running app.
//   TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... node server/test-auth.mjs      (BASE=http://localhost:3000 by default)
// The administrator can be created with:  docker compose exec app node src/cli.js create-admin <email> <password>
// The checks create throw-away users/groups/diagrams (names contain a random run id) and clean up what they can.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPrivateIp, assertHostAllowed } from './src/policy.js';

const BASE = process.env.BASE || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL, ADMIN_PW = process.env.TEST_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PW) { console.error('set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD (see the header of this file)'); process.exit(2); }

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); if (!ok) fail++; };

// tiny client with its own cookie jar (one per "browser")
const client = () => {
  let cookie = '';
  return async (method, path, body, headers = {}) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, json, headers: r.headers };
  };
};
const run = Date.now().toString(36);
const pw = 'correct horse battery';
const ADMIN = client(), A = client(), B = client(), C = client(), anon = client();

// ---------------- administrator + sign-up policy
let r = await ADMIN('POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PW });
check('administrator can sign in', r.status === 200 && r.json.user.role === 'admin', r.json.error);
await ADMIN('PUT', '/api/admin/settings', { allowSignup: false });
r = await anon('POST', '/api/auth/register', { email: `x-${run}@example.com`, password: pw });
check('public sign-up is closed once an admin exists', r.status === 403, r.json.error);
r = await anon('GET', '/api/auth/me');
check('/auth/me tells the UI sign-up is closed', r.json.signup === false);
r = await anon('GET', '/api/admin/users');
check('unauthenticated admin API is rejected', r.status === 401);

// ---------------- admin creates accounts
const mk = async (name, password) => (await ADMIN('POST', '/api/admin/users', { email: `${name}-${run}@example.com`, name, ...(password ? { password } : {}) })).json;
r = await ADMIN('POST', '/api/admin/users', { email: `alice-${run}@example.com`, name: 'Alice', password: pw });
const alice = r.json.user;
check('admin creates a user with a chosen password', r.status === 200 && alice.role === 'member' && alice.mustChangePassword === true);
const bobRes = await mk('Bob', pw); const bob = bobRes.user;
const carolRes = await mk('Carol'); const carol = carolRes.user;
check('without a password a temporary one is generated and shown once', typeof carolRes.tempPassword === 'string' && carolRes.tempPassword.length >= 10);
r = await ADMIN('POST', '/api/admin/users', { email: `alice-${run}@example.com`, name: 'dup', password: pw });
check('duplicate e-mail rejected', r.status === 409);
r = await ADMIN('POST', '/api/admin/users', { email: `weak-${run}@example.com`, password: 'short' });
check('short password rejected', r.status === 400);

// forced password change on first sign-in
r = await A('POST', '/api/auth/login', { email: alice.email, password: pw });
check('new user signs in and is flagged to change the password', r.status === 200 && r.json.user.mustChangePassword === true);
check('session cookie is HttpOnly + SameSite', /HttpOnly/i.test(r.headers.get('set-cookie') ?? '') && /SameSite=Lax/i.test(r.headers.get('set-cookie') ?? ''));
r = await A('GET', '/api/connections');
check('other API calls are blocked until the password is changed', r.status === 403 && /password change required/.test(r.json.error));
r = await A('POST', '/api/auth/password', { current: 'wrong wrong wrong', next: 'another long password' });
check('wrong current password rejected', r.status === 403);
r = await A('POST', '/api/auth/password', { current: pw, next: 'alice new long password' });
check('user changes the password', r.status === 200 && r.json.user.mustChangePassword === false);
r = await A('GET', '/api/connections');
check('API works after the change', r.status === 200);
const alicePw = 'alice new long password';
for (const [c, u, p, n] of [[B, bob, pw, 'bob new long password'], [C, carol, carolRes.tempPassword, 'carol new long password']]) {
  await c('POST', '/api/auth/login', { email: u.email, password: p });
  r = await c('POST', '/api/auth/password', { current: p, next: n });
}
check('temporary password works once and is then replaced', r.status === 200);
const bobPw = 'bob new long password';

r = await anon('POST', '/api/auth/login', { email: alice.email, password: 'wrong password!!' });
check('wrong password rejected', r.status === 401);
r = await anon('POST', '/api/auth/login', { email: `nobody-${run}@example.com`, password: pw });
check('unknown e-mail gets the same error', r.status === 401 && r.json.error === 'invalid e-mail or password');
r = await A('POST', '/api/diagrams', { title: 'x' }, { origin: 'https://evil.example' });
check('cross-origin write is blocked', r.status === 403, r.json.error);

// ---------------- roles
r = await A('GET', '/api/admin/users');
check('a member cannot use the admin API', r.status === 403);
r = await A('PATCH', `/api/admin/users/${alice.id}`, { role: 'admin' });
check('a member cannot promote themselves', r.status === 403);
r = await ADMIN('PATCH', `/api/admin/users/${bob.id}`, { name: 'Bobby' });
check('admin renames a user', r.status === 200 && r.json.user.name === 'Bobby');
r = await ADMIN('PATCH', `/api/admin/users/${bob.id}`, { name: 'Bob' });

// last-administrator guard, on an isolated database (the shared one may have several admins)
const guard = execFileSync(process.execPath, ['--input-type=module', '-e', `
  const admin = await import(${JSON.stringify(new URL('./src/admin.js', import.meta.url).href)});
  const out = {};
  const u = await admin.createUser({ email: 'only@example.com', password: 'a long enough password' });
  admin.updateUser(u.user.id, { role: 'admin' });
  for (const [k, f] of Object.entries({ demote: () => admin.updateUser(u.user.id, { role: 'member' }), disable: () => admin.updateUser(u.user.id, { disabled: true }), del: () => admin.deleteUser(u.user.id) })) {
    try { f(); out[k] = 'allowed'; } catch (e) { out[k] = e.message; }
  }
  const v = await admin.createUser({ email: 'second@example.com', password: 'a long enough password' });
  admin.updateUser(v.user.id, { role: 'admin' });
  try { admin.updateUser(u.user.id, { disabled: true }); out.withSecond = 'allowed'; } catch (e) { out.withSecond = e.message; }
  console.log(JSON.stringify(out));`], { env: { ...process.env, DATA_DIR: mkdtempSync(join(tmpdir(), 'dbd-admin-')) }, encoding: 'utf8' }).trim().split('\n').pop();
const g = JSON.parse(guard);
check('the last active administrator cannot be demoted, disabled or deleted', [g.demote, g.disable, g.del].every((m) => /at least one active administrator/.test(m)), guard);
check('…but can be once another administrator exists', g.withSecond === 'allowed');

// ---------------- disable / reset
r = await B('GET', '/api/connections');
check('Bob has a session', r.status === 200);
await ADMIN('PATCH', `/api/admin/users/${bob.id}`, { disabled: true });
r = await B('GET', '/api/connections');
check('disabling a user ends their session at once', r.status === 401);
r = await anon('POST', '/api/auth/login', { email: bob.email, password: bobPw });
check('a disabled account cannot sign in', r.status === 403, r.json.error);
await ADMIN('PATCH', `/api/admin/users/${bob.id}`, { disabled: false });
r = await B('POST', '/api/auth/login', { email: bob.email, password: bobPw });
check('re-enabled account signs in again', r.status === 200);
r = await ADMIN('POST', `/api/admin/users/${bob.id}/reset-password`, {});
const tmpBob = r.json.tempPassword;
check('admin resets a password (temporary one returned once)', r.status === 200 && tmpBob?.length >= 10);
r = await B('GET', '/api/connections');
check('a reset ends the old sessions', r.status === 401);
r = await B('POST', '/api/auth/login', { email: bob.email, password: tmpBob });
check('the temporary password forces a change', r.json.user?.mustChangePassword === true);
await B('POST', '/api/auth/password', { current: tmpBob, next: bobPw });

// ---------------- groups (flat; a user can be in several)
r = await ADMIN('POST', '/api/admin/groups', { name: `Data-${run}` }); const g1 = r.json.id;
r = await ADMIN('POST', '/api/admin/groups', { name: `Platform-${run}` }); const g2 = r.json.id;
check('admin creates groups', !!g1 && !!g2);
r = await ADMIN('POST', '/api/admin/groups', { name: `data-${run}` });
check('group names are unique (case-insensitive)', r.status === 409);
r = await A('POST', '/api/admin/groups', { name: 'x' });
check('a member cannot create groups', r.status === 403);
await ADMIN('PUT', `/api/admin/groups/${g1}/members/${alice.id}`);
await ADMIN('PUT', `/api/admin/groups/${g1}/members/${bob.id}`);
await ADMIN('PUT', `/api/admin/groups/${g2}/members/${bob.id}`);
r = await ADMIN('GET', '/api/admin/users');
const bobRow = r.json.find((u) => u.id === bob.id);
check('a user can belong to several groups', bobRow.groups.length === 2);
r = await ADMIN('GET', '/api/admin/groups');
check('group listing shows members', r.json.find((x) => x.id === g1).members.length === 2);
r = await B('GET', '/api/auth/me');
check('/auth/me lists my groups', r.json.groups.length === 2);
r = await ADMIN('PATCH', `/api/admin/groups/${g2}`, { name: `Platform-${run}-renamed` });
check('rename group', r.status === 200);

// ---------------- directory
r = await B('GET', `/api/directory/users?q=alice-${run}`);
check('members can search people to share with', r.json.length === 1 && r.json[0].id === alice.id && !('password_hash' in r.json[0]));
r = await B('GET', '/api/directory/users?q=a');
check('too-short search returns nothing', r.json.length === 0);
r = await B('GET', '/api/directory/groups');
check('members can list groups', r.json.some((x) => x.id === g1));

// ---------------- connections stay private per account
r = await A('POST', '/api/connections', { name: 'A pg', type: 'postgres', host: 'demo-pg', port: 5432, database: 'demo', user: 'reader', password: 'reader' });
const connId = r.json.id;
r = await A('GET', '/api/connections');
check('connection list never exposes secrets', r.json.length >= 1 && r.json.every((c) => !('password' in c) && !('caPem' in c)));
r = await B('GET', '/api/connections');
check("B does not see A's connections", !r.json.some((c) => c.id === connId));
r = await B('POST', '/api/schemas', { id: connId });
check("B cannot use A's saved credentials", r.status === 404);
r = await A('POST', '/api/schemas', { id: connId });
check('A can use them', r.status === 200 && r.json.schemas?.includes('shop'));

// ---------------- sharing with people and groups
r = await A('POST', '/api/diagrams', { title: 'Shop', dbml: 'Table users {\n  id int [pk]\n}\n' });
const dId = r.json.id;
await A('PUT', `/api/diagrams/${dId}`, { source: { connId, schemas: ['shop'] } });
r = await B('GET', `/api/diagrams/${dId}`);
check('without a grant the diagram does not exist for others', r.status === 404);
r = await A('POST', `/api/diagrams/${dId}/access`, { type: 'user', subjectId: alice.id, access: 'view' });
check('owner cannot grant to themselves', r.status === 400);
r = await A('POST', `/api/diagrams/${dId}/access`, { type: 'group', subjectId: 999999, access: 'view' });
check('unknown group rejected', r.status === 404);
r = await A('POST', `/api/diagrams/${dId}/access`, { type: 'user', subjectId: bob.id, access: 'view' });
check('owner shares with a person (view)', r.status === 200);
r = await B('GET', `/api/diagrams/${dId}`);
check('the person can open it, role view, no connection link', r.status === 200 && r.json.role === 'view' && r.json.source === null && r.json.ownerName === 'Alice');
r = await B('GET', '/api/diagrams');
check('it appears in "shared with me"', r.json.some((d) => d.id === dId && d.role === 'view' && d.ownerName === 'Alice'));
r = await B('PUT', `/api/diagrams/${dId}`, { dbml: 'hacked' });
check('view role cannot edit', r.status === 403);
r = await B('POST', `/api/diagrams/${dId}/comments`, { key: 'public.users', text: 'hi' });
check('view role cannot comment', r.status === 403);
r = await B('GET', `/api/diagrams/${dId}/shares`);
check('view role cannot manage links', r.status === 404);
r = await B('POST', `/api/diagrams/${dId}/access`, { type: 'user', subjectId: carol.id, access: 'view' });
check('view role cannot grant access', r.status === 404);
r = await B('DELETE', `/api/diagrams/${dId}`);
check('only the owner can delete', r.status === 403);
const grantId = (await A('GET', `/api/diagrams/${dId}/access`)).json.find((x) => x.subjectId === bob.id).id;
await A('PATCH', `/api/access/${grantId}`, { access: 'comment' });
r = await B('POST', `/api/diagrams/${dId}/comments`, { key: 'public.users', text: 'Is email unique?' });
const bobComment = r.json;
check('upgraded to comment: can comment', r.status === 200 && bobComment.author === 'Bob');
r = await B('PUT', `/api/diagrams/${dId}`, { dbml: 'x' });
check('comment role still cannot edit', r.status === 403);
// group grant: highest level wins (direct comment + group edit => edit)
r = await A('POST', `/api/diagrams/${dId}/access`, { type: 'group', subjectId: g1, access: 'edit' });
check('owner shares with a group (edit)', r.status === 200);
r = await B('PUT', `/api/diagrams/${dId}`, { dbml: 'Table users {\n  id int [pk]\n  email varchar\n}\n', title: 'pwned', source: { connId: 'x' } });
check('group edit grant lets a member change the DBML', r.status === 200);
r = await A('GET', `/api/diagrams/${dId}`);
check('editors change content only (title and connection link untouched)', r.json.dbml.includes('email') && r.json.title === 'Shop' && r.json.source?.connId === connId);
r = await B('GET', `/api/diagrams/${dId}`);
check('the highest of direct and group grants applies', r.json.role === 'edit');
// administrators manage every diagram of the organisation, but never see its connection link or credentials
r = await ADMIN('GET', `/api/diagrams/${dId}`);
check('an administrator can open any diagram (role admin, no connection link)', r.status === 200 && r.json.role === 'admin' && r.json.source === null && r.json.ownerName === 'Alice');
r = await ADMIN('GET', '/api/diagrams');
check('...and sees it in the organisation list', r.json.some((d) => d.id === dId && d.role === 'admin' && d.ownerName === 'Alice'));
r = await ADMIN('PUT', `/api/diagrams/${dId}`, { title: 'Shop (by admin)', source: { connId: 'x' } });
r = await A('GET', `/api/diagrams/${dId}`);
check('an administrator can edit it (title included) without touching the connection link', r.json.title === 'Shop (by admin)' && r.json.source?.connId === connId);
await A('PUT', `/api/diagrams/${dId}`, { title: 'Shop' });
r = await ADMIN('POST', '/api/schemas', { id: connId });
check("an administrator still cannot use another account's saved connections", r.status === 404);
r = await ADMIN('GET', `/api/diagrams/${dId}/access`);
check('an administrator can manage sharing of any diagram', r.status === 200 && r.json.length === 2);
r = await A('GET', `/api/diagrams/${dId}/access`);
check('owner lists who has access', r.json.length === 2 && r.json.some((x) => x.type === 'group' && x.name === `Data-${run}` && x.members === 2));
await ADMIN('DELETE', `/api/admin/groups/${g1}/members/${bob.id}`);
r = await B('GET', `/api/diagrams/${dId}`);
check('leaving the group removes the group-granted level', r.json.role === 'comment');
r = await A('DELETE', `/api/diagrams/${dId}/comments/${bobComment.id}`);
check('owner can delete a comment by someone else', r.status === 200);
await ADMIN('PUT', `/api/admin/groups/${g1}/members/${bob.id}`);
await ADMIN('DELETE', `/api/admin/groups/${g1}`);
r = await B('GET', `/api/diagrams/${dId}`);
check('deleting a group removes its grants', r.json.role === 'comment');
await A('DELETE', `/api/access/${grantId}`);
r = await B('GET', `/api/diagrams/${dId}`);
check('revoking the last grant hides the diagram again', r.status === 404);

// ---------------- link sharing (still works, independent of people/groups)
r = await A('POST', `/api/diagrams/${dId}/shares`, { access: 'view' }); const view = r.json;
r = await A('POST', `/api/diagrams/${dId}/shares`, { access: 'comment' }); const cmt = r.json;
r = await A('POST', `/api/diagrams/${dId}/shares`, { access: 'edit' }); const edit = r.json;
r = await anon('GET', `/api/shared/${view.token}`);
check('anonymous can read through a view link', r.status === 200 && r.json.access === 'view' && !('source' in r.json));
r = await anon('POST', `/api/shared/${cmt.token}/comments`, { key: 'k', text: 'hi' });
check('anonymous cannot comment (login required)', r.status === 401);
r = await B('POST', `/api/shared/${view.token}/comments`, { key: 'k', text: 'hi' });
check('view link does not allow comments', r.status === 403);
r = await B('POST', `/api/shared/${cmt.token}/comments`, { key: 'k', text: 'ok' });
check('comment link lets a signed-in user comment', r.status === 200);
r = await B('PUT', `/api/shared/${edit.token}`, { dbml: 'Table linked {\n  id int\n}\n' });
check('edit link lets a signed-in user change the DBML', r.status === 200);
await A('DELETE', `/api/shares/${edit.id}`);
r = await anon('GET', `/api/shared/${edit.token}`);
check('revoked link stops working', r.status === 404);

// ---------------- delete a user
r = await ADMIN('DELETE', `/api/admin/users/${carol.id}`);
check('admin deletes a user', r.status === 200);
r = await anon('POST', '/api/auth/login', { email: carol.email, password: 'carol new long password' });
check('a deleted user cannot sign in', r.status === 401);

// ---------------- settings
r = await ADMIN('PUT', '/api/admin/settings', { orgName: `Acme ${run}`, allowSignup: true });
check('admin saves organisation name and opens sign-up', r.status === 200 && r.json.orgName === `Acme ${run}` && r.json.allowSignup === true);
r = await anon('GET', '/api/auth/me');
check('the organisation name is public (login screen)', r.json.org === `Acme ${run}` && r.json.signup === true);
r = await anon('POST', '/api/auth/register', { email: `self-${run}@example.com`, password: pw, name: 'Self' });
check('with sign-up open, self-registration creates a plain member', r.status === 200 && r.json.user.role === 'member');
await ADMIN('PUT', '/api/admin/settings', { orgName: '', allowSignup: false });
r = await A('PUT', '/api/admin/settings', { orgName: 'hack' });
check('a member cannot change settings', r.status === 403);

// ---------------- logout / SPA / headers
r = await A('POST', '/api/auth/logout');
r = await A('GET', '/api/diagrams');
check('logout invalidates the session', r.status === 401);
const html = await fetch(`${BASE}/s/${view.token}`);
check('share URL serves the app (SPA fallback)', html.status === 200 && /text\/html/.test(html.headers.get('content-type') ?? ''));
check('security headers present', html.headers.get('x-content-type-options') === 'nosniff' && /default-src 'self'/.test(html.headers.get('content-security-policy') ?? ''));

// ---------------- SSRF policy (unit)
check('private/loopback/link-local ranges are detected', ['10.1.2.3', '172.20.0.5', '192.168.0.1', '127.0.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1'].every(isPrivateIp) && !['8.8.8.8', '2001:db8::1'].some(isPrivateIp));
let blocked = 0;
for (const h of ['127.0.0.1', '169.254.169.254', '10.0.0.5']) { try { await assertHostAllowed(h, { DB_HOST_POLICY: 'public-only' }); } catch { blocked++; } }
check('public-only policy blocks internal addresses', blocked === 3);
try { await assertHostAllowed('8.8.8.8', { DB_HOST_POLICY: 'public-only' }); check('public-only policy allows public IPs', true); } catch (e) { check('public-only policy allows public IPs', false, e.message); }
let allowOk = false, denyOk = false;
try { await assertHostAllowed('db.internal', { DB_HOST_POLICY: 'allowlist', DB_HOST_ALLOWLIST: 'db.internal, other' }); allowOk = true; } catch { /* */ }
try { await assertHostAllowed('evil', { DB_HOST_POLICY: 'allowlist', DB_HOST_ALLOWLIST: 'db.internal' }); } catch { denyOk = true; }
check('allowlist policy', allowOk && denyOk);

r = await ADMIN('DELETE', `/api/diagrams/${dId}`);
check('an administrator can delete any diagram', r.status === 200);
r = await ADMIN('GET', `/api/diagrams/${dId}`);
check('...and it no longer exists', r.status === 404);
// cleanup of what this run created
for (const u of [alice, bob]) await ADMIN('DELETE', `/api/admin/users/${u.id}`);
await ADMIN('DELETE', `/api/admin/groups/${g2}`);

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
