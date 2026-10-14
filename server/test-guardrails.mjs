// e2e checks against the running stack: `node server/test-guardrails.mjs` (app on :3000, demo-pg, demo-pg-tls up; needs TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD)
import { execSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:3000';
let cookie = '';
const post = async (path, body) => {
  const r = await fetch(`${BASE}/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: r.status, ...(await r.json()) };
};
// the API requires an account: sign in with the test administrator (docker compose exec app node src/cli.js create-admin <email> <password>)
if (!process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_PASSWORD) { console.error('set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD'); process.exit(2); }
const login = await post('auth/login', { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD });
if (login.status !== 200) { console.error('admin sign-in failed:', login.error); process.exit(2); }
const pg = (user, password, extra = {}) => ({ type: 'postgres', host: 'demo-pg', port: 5432, database: 'demo', user, password, ...extra });
let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); if (!ok) fail++; };

// 1. privilege guardrail
for (const [user, pass, expectWarn] of [['postgres', 'demo', true], ['writer', 'writer', true], ['reader', 'reader', false]]) {
  const r = await post('schemas', pg(user, pass));
  check(`privileges ${user}`, r.status === 200 && (r.warnings?.length > 0) === expectWarn, JSON.stringify(r.warnings ?? r.error));
}
// 2. strict mode blocks excess privileges, passes a clean reader
let r = await post('import', { ...pg('writer', 'writer', { blockWritable: true }), schemas: ['shop'] });
check('strict blocks writer', r.status === 403, r.error?.slice(0, 90));
r = await post('import', { ...pg('reader', 'reader', { blockWritable: true }), schemas: ['shop'] });
check('strict allows reader', r.status === 200 && r.tables >= 4, `${r.tables} tables`);

// 2b. table picker: list tables (read-only), import filtered by schema.table
r = await post('tables', { ...pg('reader', 'reader'), schemas: ['shop'] });
check('list tables', r.status === 200 && r.tables?.length >= 4 && r.tables.every((t) => t.schema === 'shop' && t.name), `${r.tables?.length} tables`);
const one = r.tables?.[0];
r = await post('import', { ...pg('reader', 'reader'), schemas: ['shop'], tables: [`${one?.schema}.${one?.name}`] });
check('import only the picked schema.table', r.status === 200 && r.tables === 1, `${r.tables} tables`);
r = await post('tables', { ...pg('reader', 'reader'), schemas: [] });
check('list tables needs a schema', r.status === 400);

// 3. the session itself is read-only even for a superuser (checked straight against the DB with the same options the app uses)
const sql = `begin read only; create table shop.should_fail(id int);`;
try { execSync(`docker compose exec -T demo-pg psql -U postgres -d demo -v ON_ERROR_STOP=1 -c "${sql}"`, { stdio: 'pipe' }); check('read-only txn rejects DDL', false, 'DDL succeeded'); }
catch (e) { check('read-only txn rejects DDL', /read-only transaction/.test(String(e.stderr)), String(e.stderr).trim().split('\n')[0]); }

// 4. Postgres TLS modes against demo-pg-tls (self-signed)
const tlsBase = { ...pg('postgres', 'demo'), host: 'demo-pg-tls' };
const ca = execSync('docker compose exec -T demo-pg-tls cat /certs/server.crt', { encoding: 'utf8' });
r = await post('schemas', { ...tlsBase, tls: 'off' });
check('TLS off still connects (server allows plaintext)', r.status === 200);
r = await post('schemas', { ...tlsBase, tls: 'verify' });
check('verify w/o CA rejects self-signed', r.status !== 200, r.error?.slice(0, 70));
r = await post('schemas', { ...tlsBase, tls: 'verify', caPem: ca });
check('verify with CA PEM connects', r.status === 200, r.error);
r = await post('schemas', { ...tlsBase, tls: 'noverify' });
check('noverify connects', r.status === 200, r.error);
r = await post('schemas', { ...pg('postgres', 'demo'), tls: 'verify', caPem: ca });
check('verify on non-TLS server fails', r.status !== 200, r.error?.slice(0, 70));

// 5. Oracle descriptor hardening + TLS to a plaintext listener must fail cleanly
r = await post('schemas', { type: 'oracle', host: 'x)(EVIL=1', port: 1521, database: 'FREEPDB1', user: 'u', password: 'p' });
check('oracle rejects descriptor injection', r.status === 400, r.error);
r = await post('schemas', { type: 'oracle', host: 'demo-oracle', port: 1521, database: 'FREEPDB1', user: 'shop', password: 'shop', tls: 'verify' });
check('oracle tcps against plain listener fails (no hang)', r.status !== 200, r.error?.slice(0, 90));

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
