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

// ---------------- versions: edit conflicts and history
const T1 = 'Table t1 {\n  id int [pk]\n}\n', T2 = `${T1}\nTable t2 {\n  id int [pk]\n}\n`;
r = await A('POST', '/api/diagrams', { title: 'Versions', dbml: T1 });
const vId = r.json.id;
await A('POST', `/api/diagrams/${vId}/access`, { type: 'user', subjectId: bob.id, access: 'edit' });
r = await A('GET', `/api/diagrams/${vId}`);
check('a new diagram starts at version 1', r.json.version === 1);
r = await A('PUT', `/api/diagrams/${vId}`, { dbml: T2, baseVersion: 1 });
check('a save with the current baseVersion bumps the version', r.status === 200 && r.json.version === 2, JSON.stringify(r.json));
r = await A('PUT', `/api/diagrams/${vId}`, { dbml: T2, baseVersion: 2 });
check('a save that changes nothing does not bump the version', r.status === 200 && r.json.version === 2);
r = await A('PUT', `/api/diagrams/${vId}`, { dbml: T1, baseVersion: 1 });
check('a stale baseVersion is refused with 409 and the current version', r.status === 409 && r.json.code === 'conflict' && r.json.version === 2, JSON.stringify(r.json));
r = await A('GET', `/api/diagrams/${vId}`);
check('...and the stored content was not overwritten', r.json.dbml === T2 && r.json.version === 2);
r = await A('PUT', `/api/diagrams/${vId}`, { title: 'Versions 2' });
check('a save without baseVersion is still accepted (scripts)', r.status === 200 && r.json.version === 3);
r = await B('PUT', `/api/diagrams/${vId}`, { dbml: `${T2}\nTable t3 {\n  id int\n}\n`, baseVersion: 3 });
check('an editor saves with the current version', r.status === 200 && r.json.version === 4);
r = await A('PUT', `/api/diagrams/${vId}`, { dbml: T1, baseVersion: 3 });
check('the owner, now stale, gets a conflict instead of overwriting the editor', r.status === 409 && r.json.version === 4);
r = await A('GET', `/api/diagrams/${vId}/versions`);
const hist = r.json;
check('history lists a starting point, the owner entry and the editor entry (current first)',
  Array.isArray(hist) && hist.length === 3 && hist[0].current === true && hist[0].author === 'Bob' && hist[2].summary === 'starting point', JSON.stringify(hist));
check('an entry summarises what changed', /added t2/.test(hist[1].summary) && /added t3/.test(hist[0].summary), `${hist[1]?.summary} | ${hist[0]?.summary}`);
r = await A('POST', `/api/diagrams/${vId}/versions`, { label: 'Release 1' });
check('the current state can be given a name', r.status === 200);
r = await A('GET', `/api/diagrams/${vId}/versions`);
check('...and the name is on the latest entry', r.json[0].label === 'Release 1' && r.json.length === 3);
r = await A('GET', `/api/diagrams/${vId}/versions/${hist[2].id}`);
check('an entry can be read in full', r.status === 200 && r.json.dbml === T1 && r.json.title === 'Versions');
r = await A('POST', `/api/diagrams/${vId}/versions/${hist[2].id}/restore`);
check('restoring saves the old content as a new version', r.status === 200 && r.json.version === 5, JSON.stringify(r.json));
r = await A('GET', `/api/diagrams/${vId}`);
check('...the diagram has the old content and nothing was lost from history', r.json.dbml === T1 && r.json.version === 5);
r = await A('GET', `/api/diagrams/${vId}/versions`);
check('...the named entry is still there', r.json.some((v) => v.label === 'Release 1') && r.json[0].current);
await A('POST', `/api/diagrams/${vId}/access`, { type: 'user', subjectId: bob.id, access: 'view' });
r = await B('GET', `/api/diagrams/${vId}/versions`);
check('people with only view access cannot read the history', r.status === 403, `status ${r.status}`);
r = await anon('GET', `/api/diagrams/${vId}/versions`);
check('anonymous cannot read the history', r.status === 401);
r = await A('GET', `/api/diagrams/${vId}`); const v0 = r.json.version, n0 = (await A('GET', `/api/diagrams/${vId}/versions`)).json.length;
r = await A('PUT', `/api/diagrams/${vId}`, { dbml: `${T2}
// a`, baseVersion: v0 });
r = await A('PUT', `/api/diagrams/${vId}`, { dbml: `${T2}
// b`, baseVersion: v0 + 1 });
check('quick saves by the same person share one history entry', (await A('GET', `/api/diagrams/${vId}/versions`)).json.length <= n0 + 1);
const n1 = (await A('GET', `/api/diagrams/${vId}/versions`)).json.length;
r = await A('PUT', `/api/diagrams/${vId}`, { dbml: `${T2}
// c`, baseVersion: v0 + 2, overwrite: true });
check('a save flagged overwrite always gets its own history entry', (await A('GET', `/api/diagrams/${vId}/versions`)).json.length === n1 + 1);
const n2 = (await A('GET', `/api/diagrams/${vId}/versions`)).json.length;
r = await A('PUT', `/api/diagrams/${vId}`, { dbml: `${T2}
// d`, baseVersion: v0 + 3, entry: 'refresh' });
r = await A('GET', `/api/diagrams/${vId}/versions`);
check('a save that follows a metadata refresh gets its own entry, marked as such', r.json.length === n2 + 1 && r.json[0].summary.startsWith('Refresh from database: '), r.json[0]?.summary);
r = await A('POST', `/api/diagrams/${vId}/versions`, { label: '  ' });
check('a version name is required', r.status === 400);
r = await A('POST', `/api/diagrams/${vId}/shares`, { access: 'edit' }); const vedit = r.json;
r = await B('GET', `/api/shared/${vedit.token}`);
const sv = r.json.version;
r = await B('PUT', `/api/shared/${vedit.token}`, { dbml: T2, baseVersion: sv - 1 });
check('an edit link also refuses a stale version', r.status === 409, JSON.stringify(r.json));
r = await B('PUT', `/api/shared/${vedit.token}`, { dbml: T2, baseVersion: sv });
check('...and accepts the current one', r.status === 200 && r.json.version === sv + 1);
await A('DELETE', `/api/diagrams/${vId}`);

// ---------------- shared connections (B1): registered by an administrator, used without seeing the secret, audited
const sc = { name: `Shared PG ${run}`, type: 'postgres', host: 'demo-pg', port: 5432, database: 'demo', user: 'reader', password: 'reader', tls: 'off' };
r = await A('POST', '/api/admin/connections', sc);
check('shared connections: a member cannot register one', r.status === 403);
r = await ADMIN('POST', '/api/admin/connections', { ...sc, host: '' });
check('shared connections: the required fields are checked', r.status === 400);
r = await ADMIN('POST', '/api/admin/connections', sc);
const sharedId = r.json.id;
check('shared connections: an administrator registers one', r.status === 200 && !!sharedId, JSON.stringify(r.json));
r = await ADMIN('GET', '/api/admin/connections');
const row = r.json.find((c) => c.id === sharedId);
check('shared connections: the administrator list shows the user but never the password', !!row && row.user === 'reader' && !JSON.stringify(row).includes('"password"') && row.shared === true && row.access.length === 0, JSON.stringify(row));
r = await B('GET', '/api/connections');
check('shared connections: without a grant a member does not see it', !r.json.some((c) => c.id === sharedId));
r = await B('POST', '/api/schemas', { id: sharedId });
check('shared connections: ...and cannot use it', r.status === 404);
r = await ADMIN('POST', '/api/admin/groups', { name: `Shared-${run}` }); const gs = r.json.id;
await ADMIN('PUT', `/api/admin/groups/${gs}/members/${bob.id}`);
r = await ADMIN('PUT', `/api/admin/connections/${sharedId}/access`, { users: [], groups: [gs, 999999] });
check('shared connections: the administrator grants it to a group (unknown ids are ignored)', r.status === 200);
r = await B('GET', '/api/connections');
const seen = r.json.find((c) => c.id === sharedId);
check('shared connections: a member of the group sees name, type, host and database', !!seen && seen.shared === true && seen.host === 'demo-pg' && seen.database === 'demo' && seen.name === sc.name, JSON.stringify(seen));
check('shared connections: ...but not the user, the password or the CA', seen && seen.user === '' && !('password' in seen) && seen.hasCa === false && seen.managed === false, JSON.stringify(seen));
r = await C('GET', '/api/connections');
check('shared connections: a person outside the group does not see it', !r.json.some((c) => c.id === sharedId));
r = await B('POST', '/api/schemas', { id: sharedId });
check('shared connections: a member can use it (test)', r.status === 200 && r.json.schemas.includes('shop'), JSON.stringify(r.json).slice(0, 120));
r = await B('POST', '/api/schemas', { id: sharedId, host: 'no-such-host.invalid', user: 'postgres', password: 'x' });
check('shared connections: a request cannot redirect the saved credentials to another host or user', r.status === 200, JSON.stringify(r.json).slice(0, 160));
r = await B('POST', '/api/import', { id: sharedId, schemas: ['shop'], purpose: 'refresh' });
check('shared connections: a member can import / refresh through it', r.status === 200 && r.json.tables > 0);
r = await B('POST', '/api/connections', { id: sharedId, name: 'hijack', type: 'postgres', host: 'x', port: 5432, database: 'd', user: 'u' });
check('shared connections: a member cannot edit it through the private route', r.status === 404);
r = await B('DELETE', `/api/connections/${sharedId}`);
const stillThere = (await ADMIN('GET', '/api/admin/connections')).json.some((c) => c.id === sharedId);
check('shared connections: ...nor delete it', stillThere);
r = await B('GET', '/api/admin/audit');
check('audit log: members cannot read it', r.status === 403);
r = await ADMIN('GET', `/api/admin/audit?q=${encodeURIComponent(sc.name)}`);
const acts = r.json.map((e) => e.action);
check('audit log: the uses of the shared connection are recorded with who and what', ['connection.test', 'connection.refresh'].every((a) => acts.includes(a)) && r.json.some((e) => e.actor === 'Bob' && e.ok === true && e.target === sc.name), JSON.stringify(r.json.slice(0, 3)));
check('audit log: no secrets in it', !JSON.stringify(r.json).includes('reader') || !r.json.some((e) => /password/i.test(`${e.detail}`)));
r = await ADMIN('GET', '/api/admin/audit?action=admin');
check('audit log: administrator actions are recorded', r.json.some((e) => e.action === 'admin.put' && /connections/.test(e.target)) && r.json.some((e) => e.action === 'admin.post'), JSON.stringify(r.json.slice(0, 2)));
check('audit log: ...without request bodies', !JSON.stringify(r.json).includes('"password"') && !JSON.stringify(r.json).includes(sc.password + '"'));
r = await ADMIN('GET', '/api/admin/audit.csv');
check('audit log: CSV export', r.status === 200 && typeof r.json === 'string' && r.json.startsWith('time (UTC),actor,action'), String(r.json).slice(0, 60));
// a private connection is not audited
await A('POST', '/api/schemas', { id: connId });
r = await ADMIN('GET', '/api/admin/audit?q=A%20pg');
check('audit log: the use of a private connection is not recorded', r.json.length === 0);
// a diagram linked to the shared connection: editors with access to the connection can refresh it, others do not even see the link
r = await A('POST', `/api/admin/connections`, sc);
await ADMIN('PUT', `/api/admin/groups/${gs}/members/${alice.id}`);
r = await A('POST', '/api/diagrams', { title: 'Linked', dbml: 'Table x {\n  id int\n}\n' }); const lId = r.json.id;
r = await A('PUT', `/api/diagrams/${lId}`, { source: { connId: sharedId, schemas: ['shop'], tables: [], at: 1 } });
r = await A('POST', `/api/diagrams/${lId}/access`, { type: 'user', subjectId: bob.id, access: 'edit' });
r = await A('POST', `/api/diagrams/${lId}/access`, { type: 'user', subjectId: carol.id, access: 'edit' });
r = await B('GET', `/api/diagrams/${lId}`);
check('shared connections: an editor with access to the connection sees the diagram link', r.json.source?.connId === sharedId, JSON.stringify(r.json.source));
r = await C('GET', `/api/diagrams/${lId}`);
check('shared connections: an editor without access to it gets no link', r.json.source === null);
r = await B('POST', '/api/import', { id: sharedId, schemas: ['shop'], purpose: 'refresh', diagramId: lId });
r = await ADMIN('GET', `/api/admin/audit?q=${lId}`);
check('audit log: a refresh records the diagram it was for', r.json.some((e) => e.action === 'connection.refresh' && e.diagramId === lId), JSON.stringify(r.json.slice(0, 2)));
r = await B('POST', '/api/import', { id: sharedId, schemas: ['shop'], diagramId: 'not-a-diagram-of-bob' });
r = await ADMIN('GET', '/api/admin/audit?action=connection.import');
check('audit log: a diagram id the person cannot open is not recorded', r.json.length > 0 && r.json.every((e) => e.diagramId === null || e.diagramId !== 'not-a-diagram-of-bob'));
// filters of the Audit log: by person, by what it was about (shared connection / diagram / users), by type
const bobId = (await ADMIN('GET', '/api/admin/audit?action=connection')).json.find((e) => e.actor === 'Bob')?.actorId;
r = await ADMIN('GET', `/api/admin/audit?actorId=${bobId}`);
check('audit filter: by person', !!bobId && r.json.length > 0 && r.json.every((e) => e.actorId === bobId));
r = await ADMIN('GET', `/api/admin/audit?connectionId=${sharedId}`);
check('audit filter: by shared connection (its uses and the administrator changes to it)', r.json.some((e) => e.action.startsWith('connection.')) && r.json.some((e) => e.action.startsWith('admin.')) && r.json.every((e) => e.connectionId === sharedId));
r = await ADMIN('GET', `/api/admin/audit?diagramId=${lId}`);
check('audit filter: by diagram', r.json.length > 0 && r.json.every((e) => e.diagramId === lId));
r = await ADMIN('GET', '/api/admin/audit?scope=users');
check('audit filter: what an administrator action was about (users)', r.json.length > 0 && r.json.every((e) => e.action.startsWith('admin.') && e.target.startsWith('/users')));
r = await ADMIN('GET', '/api/admin/audit?action=admin.put,admin.patch');
check('audit filter: by type, several prefixes (changed)', r.json.length > 0 && r.json.every((e) => e.action === 'admin.put' || e.action === 'admin.patch'));
r = await ADMIN('GET', '/api/admin/audit?action=connection.import,connection.refresh');
check('audit filter: by type (imported or refreshed)', r.json.length > 0 && r.json.every((e) => e.action === 'connection.import' || e.action === 'connection.refresh'));
r = await ADMIN('GET', `/api/admin/audit?actorId=${bobId}&action=connection.refresh&connectionId=${sharedId}`);
check('audit filter: filters combine', r.json.length > 0 && r.json.every((e) => e.actorId === bobId && e.action === 'connection.refresh' && e.connectionId === sharedId));
r = await ADMIN('GET', "/api/admin/audit?actorId=1%27%20or%201%3D1&scope=users%27--");
check('audit filter: odd input is not an injection', r.status === 200 && r.json.length === 0);
r = await ADMIN('GET', '/api/admin/audit.csv?action=connection.import');
check('audit filter: the CSV honours the filters', r.status === 200 && !r.json.includes('admin.put'));
r = await ADMIN('GET', '/api/admin/audit/facets');
check('audit facets: the people, shared connections and diagrams that appear in the log', r.status === 200 && r.json.actors.some((x) => x.id === bobId && x.name === 'Bob') && r.json.connections.some((x) => x.id === sharedId && x.name === sc.name) && r.json.diagrams.some((x) => x.id === lId), JSON.stringify(r.json).slice(0, 160));
r = await B('GET', '/api/admin/audit/facets');
check('audit facets: members cannot read them', r.status === 403);
await A('DELETE', `/api/diagrams/${lId}`);
// revoking and deleting
r = await ADMIN('PUT', `/api/admin/connections/${sharedId}/access`, { users: [], groups: [] });
r = await B('POST', '/api/schemas', { id: sharedId });
check('shared connections: revoking the grant stops the use at once', r.status === 404);
await ADMIN('PUT', `/api/admin/connections/${sharedId}/access`, { users: [bob.id], groups: [] });
r = await B('POST', '/api/schemas', { id: sharedId });
check('shared connections: a grant to one person works too', r.status === 200);
r = await ADMIN('DELETE', `/api/admin/connections/${sharedId}`);
check('shared connections: an administrator deletes it', r.status === 200);
r = await B('POST', '/api/schemas', { id: sharedId });
check('shared connections: ...and it stops working', r.status === 404);
await ADMIN('DELETE', `/api/admin/groups/${gs}`);

// ---------------- presence: who has the diagram open
r = await A('POST', '/api/diagrams', { title: 'Presence', dbml: 'Table p {\n  id int\n}\n' });
const pId = r.json.id;
await A('POST', `/api/diagrams/${pId}/access`, { type: 'user', subjectId: bob.id, access: 'view' });
r = await A('POST', `/api/diagrams/${pId}/presence`, { tab: 'tab-alice-1' });
check('presence: alone on the diagram, with its version', r.status === 200 && r.json.viewers.length === 0 && r.json.version === 1, JSON.stringify(r.json));
r = await B('POST', `/api/diagrams/${pId}/presence`, { tab: 'tab-bob-1', sel: 'public.p', editing: false });
check('presence: the second person sees the first', r.json.viewers.length === 1 && r.json.viewers[0].name === 'Alice' && /^#/.test(r.json.viewers[0].color), JSON.stringify(r.json));
r = await A('POST', `/api/diagrams/${pId}/presence`, { tab: 'tab-alice-1' });
check('presence: the first sees the second with what they selected', r.json.viewers.length === 1 && r.json.viewers[0].name === 'Bob' && r.json.viewers[0].sel === 'public.p' && !('email' in r.json.viewers[0]), JSON.stringify(r.json));
r = await A('POST', `/api/diagrams/${pId}/presence`, { tab: 'tab-alice-2', editing: true });
check('presence: a second tab of the same person is not shown to themselves', r.json.viewers.length === 1);
r = await B('POST', `/api/diagrams/${pId}/presence`, { tab: 'tab-bob-1' });
check('presence: two tabs of one person count once for the others, editing flag travels', r.json.viewers.length === 1 && r.json.viewers[0].editing === true, JSON.stringify(r.json));
r = await A('POST', `/api/diagrams/${pId}/shares`, { access: 'view' }); const plink = r.json;
r = await anon('POST', `/api/shared/${plink.token}/presence`, { tab: 'tab-guest-1' });
check('presence: a link visitor sees the people and is "Guest" to them', r.status === 200 && r.json.viewers.length === 2);
r = await A('POST', `/api/diagrams/${pId}/presence`, { tab: 'tab-alice-1' });
check('presence: the guest is listed as Guest', r.json.viewers.some((v) => v.name === 'Guest'), JSON.stringify(r.json));
r = await B('POST', `/api/diagrams/${pId}/presence`, { tab: 'tab-bob-1', leave: true });
r = await A('POST', `/api/diagrams/${pId}/presence`, { tab: 'tab-alice-1' });
check('presence: leaving removes the person at once', !r.json.viewers.some((v) => v.name === 'Bob'), JSON.stringify(r.json));
r = await A('POST', `/api/diagrams/${pId}/presence`, { tab: 'x' });
check('presence: an invalid tab id is refused', r.status === 400);
r = await C('POST', `/api/diagrams/${pId}/presence`, { tab: 'tab-carol-1' });
check('presence: people without access get 404 and are not listed', r.status === 404);
r = await anon('POST', `/api/diagrams/${pId}/presence`, { tab: 'tab-anon-1' });
check('presence: anonymous cannot use the account route', r.status === 401);
await A('DELETE', `/api/diagrams/${pId}`);

// ---------------- password-protected links
r = await A('POST', `/api/diagrams/${dId}/shares`, { access: 'view', password: 'abc' });
check('link password must have 6+ characters', r.status === 400);
r = await A('POST', `/api/diagrams/${dId}/shares`, { access: 'comment', password: 'link-secret' }); const prot = r.json;
check('a link can be created with a password (never returned)', r.status === 200 && prot.hasPassword === true && !JSON.stringify(prot).includes('link-secret') && !('passwordHash' in prot));
r = await A('GET', `/api/diagrams/${dId}/shares`);
check('share list shows hasPassword, no hash', r.json.find((s) => s.id === prot.id)?.hasPassword === true && !JSON.stringify(r.json).includes('scrypt'));
r = await anon('GET', `/api/shared/${prot.token}`);
check('protected link asks for the password', r.status === 401 && r.json.code === 'share_password');
r = await anon('GET', `/api/shared/${prot.token}`, undefined, { 'x-share-password': 'wrong-one' });
check('wrong password is refused', r.status === 401 && r.json.code === 'share_password');
r = await anon('GET', `/api/shared/${prot.token}`, undefined, { 'x-share-password': encodeURIComponent('link-secret') });
check('right password opens the diagram', r.status === 200 && r.json.dbml !== undefined && !('passwordHash' in r.json));
r = await B('POST', `/api/shared/${prot.token}/comments`, { key: 'k', text: 'no password' });
check('comments through a protected link also need the password', r.status === 401 && r.json.code === 'share_password');
r = await B('POST', `/api/shared/${prot.token}/comments`, { key: 'k', text: 'with password' }, { 'x-share-password': 'link-secret' });
check('...and work with it', r.status === 200);
r = await A('PATCH', `/api/shares/${prot.id}`, { password: 'another-secret' });
await anon('GET', `/api/shared/${prot.token}`, undefined, { 'x-share-password': 'link-secret' });
r = await anon('GET', `/api/shared/${prot.token}`, undefined, { 'x-share-password': 'link-secret' });
check('changing the password invalidates the old one', r.status === 401);
r = await A('PATCH', `/api/shares/${prot.id}`, { password: '' });
r = await anon('GET', `/api/shared/${prot.token}`);
check('removing the password opens the link again', r.status === 200);
await A('POST', `/api/diagrams/${dId}/shares`, { access: 'view', password: 'throttle-me' }).then(async (x) => {
  let last;
  for (let i = 0; i < 12; i++) last = await anon('GET', `/api/shared/${x.json.token}`, undefined, { 'x-share-password': `bad-${i}` });
  check('repeated wrong passwords are throttled', last.status === 429);
  await A('DELETE', `/api/shares/${x.json.id}`);
});
await A('DELETE', `/api/shares/${prot.id}`);

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
// ---------------- sessions, sign-in log, link expiry, closing an account
{
  const S2 = client(), S3 = client();
  const kd = (await ADMIN('POST', '/api/diagrams', { title: `Links ${run}`, dbml: 'Table t { id int }' })).json.id;
  await S2('POST', '/api/auth/login', { email: alice.email, password: alicePw });
  await S3('POST', '/api/auth/login', { email: alice.email, password: alicePw });
  r = await S2('GET', '/api/auth/sessions');
  check('sessions: the person lists their devices, one is marked current', r.status === 200 && r.json.length >= 2 && r.json.filter((s) => s.current).length === 1 && r.json.every((s) => s.id && !('token_hash' in s)), JSON.stringify(r.json[0]));
  const other = r.json.find((s) => !s.current);
  r = await S2('DELETE', `/api/auth/sessions/${r.json.find((s) => s.current).id}`);
  check('sessions: the one in use cannot be "revoked" (that is sign out)', r.status === 404);
  r = await S2('DELETE', `/api/auth/sessions/${other.id}`);
  check('sessions: ending another one works', r.status === 200 && r.json.ended === 1);
  r = await S2('DELETE', '/api/auth/sessions');
  check('sessions: end all the others', r.status === 200);
  r = await S3('GET', '/api/auth/me');
  check('sessions: a session that was ended no longer works', r.json.user === null || r.status === 401, JSON.stringify(r.json).slice(0, 80));
  r = await client()('GET', '/api/auth/sessions');
  check('sessions: need a sign-in', r.status === 401);

  r = await ADMIN('GET', '/api/admin/audit?action=auth&limit=200');
  const acts = new Set(r.json.map((e) => e.action));
  check('audit: sign-ins, failed sign-ins and ended sessions are recorded', ['auth.login', 'auth.login_failed', 'auth.session_revoked', 'auth.password_changed'].every((a) => acts.has(a)), [...acts].join(','));
  check('audit: a failed sign-in keeps the e-mail tried and the address, never the password', r.json.some((e) => e.action === 'auth.login_failed' && e.target === alice.email && /· .*\d/.test(e.detail)) && !JSON.stringify(r.json).includes('wrong password!!'));

  r = await ADMIN('POST', `/api/diagrams/${kd}/shares`, { access: 'view', expiresInDays: 7 });
  const lk = r.json;
  check('links: created with an expiry', r.status === 200 && lk.expiresAt > Date.now() / 1000);
  r = await anon('GET', `/api/shared/${lk.token}`);
  check('links: open before it expires', r.status === 200);
  r = await ADMIN('POST', `/api/diagrams/${kd}/shares`, { access: 'view', expiresInDays: 400 });
  check('links: an expiry over 365 days is refused', r.status === 400);
  r = await ADMIN('GET', `/api/diagrams/${kd}/shares`);
  check('links: the owner sees when it expires', r.json.find((s) => s.id === lk.id)?.expired === false);
  await ADMIN('DELETE', `/api/diagrams/${kd}`);

  // recovery key: made while signed in, used signed out to choose a new password, once
  const RK = client();
  await RK('POST', '/api/auth/login', { email: alice.email, password: alicePw });
  r = await RK('GET', '/api/auth/recovery');
  check('recovery: none yet', r.status === 200 && r.json.has === false);
  r = await RK('POST', '/api/auth/recovery', { password: 'not my password' });
  check('recovery: making a key needs the password', r.status === 403);
  r = await RK('POST', '/api/auth/recovery', { password: alicePw });
  const rkey = r.json.key;
  check('recovery: the key is returned once, in groups', r.status === 200 && /^rk-([0-9a-f]{5}-){7}[0-9a-f]{5}$/.test(rkey));
  check('recovery: it is not returned again', JSON.stringify((await RK('GET', '/api/auth/recovery')).json).includes(rkey) === false);
  r = await client()('POST', '/api/auth/recover', { email: alice.email, key: 'rk-00000-00000-00000-00000-00000-00000-00000-00000', next: 'some other long password' });
  const wrong = r;
  r = await client()('POST', '/api/auth/recover', { email: `nobody-${run}@example.com`, key: rkey, next: 'some other long password' });
  check('recovery: a wrong key and an unknown e-mail get the same answer', wrong.status === 401 && r.status === 401 && wrong.json.error === r.json.error, wrong.json.error);
  const back = client();
  r = await back('POST', '/api/auth/recover', { email: alice.email.toUpperCase(), key: rkey.toUpperCase(), next: 'recovered long password' });
  check('recovery: the key chooses a new password and signs in', r.status === 200 && (await back('GET', '/api/auth/me')).json.user?.email === alice.email);
  r = await RK('GET', '/api/auth/me');
  check('recovery: every older session ended', r.json.user === null);
  r = await client()('POST', '/api/auth/recover', { email: alice.email, key: rkey, next: 'yet another long password' });
  check('recovery: the key works once', r.status === 401);
  r = await ADMIN('GET', '/api/admin/audit?action=auth&limit=300');
  const acts2 = new Set(r.json.map((e) => e.action));
  check('audit: key made, password recovered and a failed recovery are recorded', ['auth.recovery_key_created', 'auth.password_recovered', 'auth.recovery_failed'].every((a) => acts2.has(a)) && !JSON.stringify(r.json).includes(rkey), [...acts2].join(','));
  await ADMIN('POST', `/api/admin/users/${alice.id}/reset-password`, { password: pw }); // leave alice in a known state for the cleanup

  const D2 = client();
  r = await ADMIN('POST', '/api/admin/users', { email: `leaver-${run}@example.com`, name: 'Leaver', password: pw });
  const leaver = r.json.user;
  await D2('POST', '/api/auth/login', { email: leaver.email, password: pw });
  await D2('POST', '/api/auth/password', { current: pw, next: 'leaver new long password' });
  const ld = (await D2('POST', '/api/diagrams', { title: `Leaver diagram ${run}`, dbml: 'Table t { id int }' })).json.id;
  r = await D2('DELETE', '/api/auth/account', { password: 'not my password' });
  check('closing an account needs the right password', r.status === 403);
  r = await D2('DELETE', '/api/auth/account', { password: 'leaver new long password' });
  check('closing an account works and signs the person out', r.status === 200 && (await D2('GET', '/api/auth/me')).json.user === null);
  r = await anon('POST', '/api/auth/login', { email: leaver.email, password: 'leaver new long password' });
  check('...the old e-mail and password no longer sign in', r.status === 401);
  r = await ADMIN('GET', '/api/admin/closed-diagrams');
  const wait = r.json.find((d) => d.id === ld);
  check('...the diagram waits for an administrator for 7 days', !!wait && wait.deletesAt - wait.closedAt === 7 * 86400 && wait.formerOwner === 'Leaver');
  r = await ADMIN('GET', '/api/admin/users');
  check('...and the closed account is not in the user list', !r.json.some((u) => u.email === leaver.email || u.id === leaver.id));
  r = await ADMIN('POST', `/api/admin/closed-diagrams/${ld}/adopt`, { userId: alice.id });
  check('an administrator hands it to a person', r.status === 200 && (await ADMIN('GET', `/api/diagrams/${ld}`)).json.ownerName === 'Alice');
  await ADMIN('DELETE', `/api/diagrams/${ld}`);
  r = await ADMIN('POST', `/api/admin/closed-diagrams/${ld}/adopt`, { userId: alice.id });
  check('only a waiting diagram can be handed over', r.status === 404);
  r = await ADMIN('PUT', '/api/admin/settings', { sessionDays: 0 });
  check('session length outside 1-90 days is refused', r.status === 400);
}
// cleanup of what this run created
for (const u of [alice, bob]) await ADMIN('DELETE', `/api/admin/users/${u.id}`);
await ADMIN('DELETE', `/api/admin/groups/${g2}`);

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
