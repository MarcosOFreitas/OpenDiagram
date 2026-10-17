// e2e check of the Oracle TLS modes against demo-oracle-tls (a TLS proxy in front of demo-oracle; `docker compose -f docker-compose.yml -f docker-compose.demo-tls.yml --profile oracle up -d`):
//   TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... node server/test-oracle-tls.mjs      (BASE=http://localhost:3000 by default)
// The proxy's certificate is self-signed with CN=oracle.demo.test and is trusted by the app through NODE_EXTRA_CA_CERTS, which only docker-compose.demo-tls.yml sets (see demo/oracle-tls).
const BASE = process.env.BASE || 'http://localhost:3000';
const E = process.env.TEST_ADMIN_EMAIL, P = process.env.TEST_ADMIN_PASSWORD;
if (!E || !P) { console.error('set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD'); process.exit(2); }
let cookie = '', fail = 0;
const call = async (m, u, b) => { const r = await fetch(BASE + u, { method: m, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: b && JSON.stringify(b) }); const s = r.headers.get('set-cookie'); if (s) cookie = s.split(';')[0]; return { status: r.status, json: await r.json().catch(() => ({})) }; };
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${String(detail).slice(0, 140)}` : ''}`); if (!ok) fail++; };
await call('POST', '/api/auth/login', { email: E, password: P });
const ora = (host, tls, extra = {}) => call('POST', '/api/schemas', { type: 'oracle', host, port: 2484, database: 'FREEPDB1', user: 'shop', password: 'shop', tls, ...extra });
const ok = (r) => r.status === 200 && r.json.schemas?.includes('SHOP');

let r = await ora('oracle.demo.test', 'verify');
check('verify: the certificate chain and the host name match', ok(r), r.json.error);
r = await ora('demo-oracle-tls', 'verify');
check('verify: a host name that is not the certificate\'s fails', r.status !== 200, r.json.error);
r = await ora('demo-oracle-tls', 'verify', { serverDn: 'CN=oracle.demo.test' });
check('verify + serverDn: the expected DN of the certificate is accepted', ok(r), r.json.error);
r = await ora('demo-oracle-tls', 'verify', { serverDn: 'CN=somebody.else' });
check('verify + serverDn: a different DN is refused', r.status !== 200, r.json.error);
r = await ora('demo-oracle-tls', 'noverify');
check('noverify: the host name check is skipped', ok(r), r.json.error);
r = await ora('oracle.demo.test', 'off');
check('TLS off against a TCPS port fails cleanly', r.status !== 200, r.json.error);
r = await ora('demo-oracle', 'verify');
check('verify against the plain (TCP-only) listener port fails', (await call('POST', '/api/schemas', { type: 'oracle', host: 'demo-oracle', port: 1521, database: 'FREEPDB1', user: 'shop', password: 'shop', tls: 'verify' })).status !== 200);
r = await ora('oracle.demo.test', 'verify', { serverDn: 'CN=x" (EVIL=1' });
check('a server DN that tries to break the descriptor is rejected', r.status === 400, r.json.error);
console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
