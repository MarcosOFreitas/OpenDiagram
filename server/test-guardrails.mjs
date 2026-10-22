// e2e checks against the running stack: `node server/test-guardrails.mjs` (app on :3000, demo-pg, demo-pg-tls, demo-mysql up; needs TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD)
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

const r2 = await post('import', { ...pg('reader', 'reader'), schemas: ['shop'] });
// 2c. A1 objects: enum, view (grey Table + definition), materialized view, sequence, trigger
r = await post('import', { ...pg('reader', 'reader'), schemas: ['shop'] });
check('A1 enum', r.dbml.includes('Enum shop.order_state {'));
check('A1 view as a Table with its comment and the VIEW marker, structure only by default', r.dbml.includes(`Table shop.v_customer_orders [note: '''\nOrders with customer name\n\nVIEW\n'''`) && !/CREATE (MATERIALIZED )?VIEW/.test(r.dbml));
check('A1 materialized view marker, structure only by default', r.dbml.includes("Table shop.mv_orders_by_status [note: '''\nMATERIALIZED VIEW\n'''"));
const full = await post('import', { ...pg('reader', 'reader'), schemas: ['shop'], ddl: true });
check('ddl option: a view gets its full CREATE VIEW ... AS statement', full.dbml.includes(`Table shop.v_customer_orders [note: '''\nOrders with customer name\n\nVIEW\nCREATE VIEW shop.v_customer_orders AS\n`) && /CREATE VIEW shop\.v_customer_orders AS\n[\s\S]*?;\n'''/.test(full.dbml));
check('ddl option: ...and a materialized view its CREATE MATERIALIZED VIEW ... AS statement', full.dbml.includes("MATERIALIZED VIEW\nCREATE MATERIALIZED VIEW shop.mv_orders_by_status AS\n"));
check('ddl option: columns, relationships and lineage are the same with and without it', (full.dbml.match(/\/\/ lineage.*/g) || []).join('|') === (r.dbml.match(/\/\/ lineage.*/g) || []).join('|') && full.tables === r.tables && full.refs === r.refs);
const notTrue = await post('import', { ...pg('reader', 'reader'), schemas: ['shop'], ddl: 'true' });
check('ddl option: only the boolean true turns it on', !/CREATE (MATERIALIZED )?VIEW/.test(notTrue.dbml));
check('lineage: a view lists its source tables and the columns it uses', /\/\/ lineage\(auto\): shop\.v_customer_orders <- shop\.customers\([^)]*name[^)]*\), shop\.orders\(/.test(r.dbml), (r.dbml.match(/\/\/ lineage.*/g) || []).join(' | '));
check('lineage: each output column of a view is mapped to its source column', ['customer_id <- shop.customers.id', 'name <- shop.customers.name', 'order_id <- shop.orders.id', 'status <- shop.orders.status'].every((m) => r.dbml.includes(`// lineage(auto): shop.v_customer_orders.${m}`)), (r.dbml.match(/\/\/ lineage\(auto\): shop\.v_customer_orders\.\w+ <-.*/g) || []).join(' | '));
check('lineage: an aggregate output (count(*)) gets no column mapping', !/shop\.mv_orders_by_status\.total/.test(r.dbml));
check('lineage: a materialized view too', /\/\/ lineage\(auto\): shop\.mv_orders_by_status <- shop\.orders\([^)]*status/.test(r.dbml));
r.lineageOnly = await post('import', { ...pg('reader', 'reader'), schemas: ['shop'], tables: ['shop.v_customer_orders', 'shop.orders'] });
check('lineage: sources outside the picked tables are dropped', /<- shop\.orders\(/.test(r.lineageOnly.dbml) && !/shop\.customers\(/.test(r.lineageOnly.dbml.match(/\/\/ lineage.*/g)?.join(' ')), r.lineageOnly.dbml.match(/\/\/ lineage.*/g)?.join(' | '));
check('A1 sequence note (serial sequences skipped)', r.dbml.includes('Note "shop.invoice_seq" {') && !r.dbml.includes('Note "shop.customers_id_seq"'));
check('A1 sequence used by a column default goes into the note of its table', r.dbml.includes("Table shop.tickets [note: '''\nSEQUENCES\nshop.ticket_seq (id): bigint") && !r.dbml.includes('Note "shop.ticket_seq"'));
check('A1 trigger in table note', r.dbml.includes('TRIGGERS\ntrg_orders_touch: CREATE TRIGGER'));
r = await post('tables', { ...pg('reader', 'reader'), schemas: ['shop'] });
check('list tables flags views', r.tables.filter((t) => t.view).length === 2, JSON.stringify(r.tables.filter((t) => t.view).map((t) => t.name)));

check('multi-line comment becomes a triple-quoted note', r2.dbml.includes(`note: '''
Stock keeping unit:
1 = internal;
2 = supplier
'''`));

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

// 5b. table selection (.specs/12): [] = all, a list = exactly those, never more; a chosen table that is gone is reported; the same for a personal and a shared connection
{
  const call = async (method, path, body) => { const x = await fetch(`${BASE}/api/${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: x.status, ...(await x.json()) }; };
  const psql = (sql) => execSync(`docker compose exec -T demo-pg psql -U postgres -d demo -v ON_ERROR_STOP=1 -c "${sql}"`, { stdio: 'pipe' });
  const personal = (await post('connections', { name: 'sel-personal', ...pg('reader', 'reader'), tls: 'off', blockWritable: true })).id;
  const shared = (await call('POST', 'admin/connections', { type: 'postgres', name: 'sel-shared', host: 'demo-pg', port: 5432, database: 'demo', user: 'reader', password: 'reader', tls: 'off' })).id;
  const tabs = (r) => r.dbml.match(/^Table [^ ]+/gm)?.map((l) => l.slice(6)).sort() ?? [];
  const imp = (id, tables) => post('import', { id, schemas: ['shop'], tables });
  for (const [kind, id] of [['personal', personal], ['shared', shared]]) {
    const all = await imp(id, []);
    check(`selection (${kind}): [] imports every table`, all.status === 200 && all.tables >= 7, `${all.tables} tables`);
    const none = await imp(id, undefined);
    check(`selection (${kind}): no list is the same as []`, none.tables === all.tables);
    const two = await imp(id, ['shop.orders', 'shop.customers']);
    check(`selection (${kind}): a list is exactly those`, two.tables === 2 && tabs(two).join() === 'shop.customers,shop.orders', tabs(two).join());
    const plain = await imp(id, ['orders']);
    check(`selection (${kind}): a plain name matches`, plain.tables === 1);
    const gone = await imp(id, ['shop.orders', 'shop.gone']);
    check(`selection (${kind}): a chosen table that does not exist is reported`, gone.tables === 1 && JSON.stringify(gone.missing) === '["shop.gone"]', JSON.stringify(gone.missing));
    check(`selection (${kind}): nothing is reported missing for [] and for a complete list`, all.missing.length === 0 && two.missing.length === 0);
  }
  // a table created after the import: "all" brings it in at the next refresh, a list does not
  try {
    psql('create table shop.late_table (id int)');
    for (const [kind, id] of [['personal', personal], ['shared', shared]]) {
      const all = await imp(id, []), list = await imp(id, ['shop.orders', 'shop.customers']);
      check(`selection (${kind}): a table the database gets later is imported with "all"`, tabs(all).includes('shop.late_table'));
      check(`selection (${kind}): ...and not with an explicit list`, !tabs(list).includes('shop.late_table'));
    }
  } finally { try { psql('drop table if exists shop.late_table'); } catch { /* */ } }
  await call('DELETE', `connections/${personal}`); await call('DELETE', `admin/connections/${shared}`);
}

// 6. scheduled refresh on the server: a linked diagram whose last import is "old" is re-read by the next one-minute round with no page open (takes up to ~2 minutes)
const call = async (method, path, body) => { const x = await fetch(`${BASE}/api/${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, ...(await x.json()) }; };
const sc = await post('connections', { name: 'sched-e2e', ...pg('reader', 'reader'), tls: 'off', blockWritable: true, refreshMinutes: 5 });
const sd = await post('diagrams', { title: 'sched e2e' });
await call('PUT', `diagrams/${sd.id}`, { dbml: 'Table shop.stale { id int }\n', source: { connId: sc.id, schemas: ['shop'], tables: null, at: 1000, gen: 'old' } });
let got;
for (let i = 0; i < 30 && !got?.refresh; i++) { await new Promise((ok) => setTimeout(ok, 5000)); got = await call('GET', `diagrams/${sd.id}`); }
const hist = await call('GET', `diagrams/${sd.id}/versions`);
check('scheduled refresh ran with no page open', !!got?.refresh && got.refresh.lastError === null && /shop\.customers/.test(got.dbml), JSON.stringify(got?.refresh));
check('  saved as "Refresh from database" by "Scheduled refresh"', hist[0]?.author === 'Scheduled refresh' && /^Refresh from database/.test(hist[0]?.summary), `${hist[0]?.author}: ${hist[0]?.summary}`);
await call('DELETE', `diagrams/${sd.id}`); await call('DELETE', `connections/${sc.id}`);

// 7. MySQL (demo-mysql, MySQL 8.4): the same guardrails as PostgreSQL (.specs/14-release-v1.md, item 7)
const my = (user, password, extra = {}) => ({ type: 'mysql', host: 'demo-mysql', port: 3306, database: '', user, password, tls: 'off', ...extra });
for (const [user, pass, expectWarn] of [['root', 'demo', true], ['writer', 'writer', true], ['reader', 'reader', false]]) {
  const x = await post('schemas', my(user, pass));
  check(`mysql privileges ${user}`, x.status === 200 && (x.warnings?.length > 0) === expectWarn && x.schemas?.includes('shop') && !x.schemas.some((s) => ['mysql', 'sys', 'information_schema', 'performance_schema'].includes(s)), JSON.stringify(x.warnings ?? x.error));
}
r = await post('import', { ...my('writer', 'writer', { blockWritable: true }), schemas: ['shop'] });
check('mysql strict blocks writer', r.status === 403, r.error?.slice(0, 90));
r = await post('import', { ...my('reader', 'reader', { blockWritable: true }), schemas: ['shop'] });
check('mysql strict allows reader', r.status === 200 && r.tables >= 4, `${r.tables} tables`);
check('mysql enum column -> DBML enum', /Enum shop\.orders_status \{\n {2}new\n {2}paid\n {2}shipped\n\}/.test(r.dbml ?? ''), (r.dbml ?? '').match(/Enum[^}]*}/)?.[0]);
check('mysql auto increment, unsigned type, default and relationship', /id "int unsigned" \[pk, increment\]/.test(r.dbml ?? '') && /default: `'new'`/.test(r.dbml ?? '') && /Ref[^\n]*shop\.orders\.customer_id > shop\.customers\.id \[delete: cascade\]/.test(r.dbml ?? ''), (r.dbml ?? '').slice(0, 200));
check('mysql view marked once in its note', /Table shop\.v_order_totals \[note: '''\nVIEW\n'''\]/.test(r.dbml ?? ''), (r.dbml ?? '').match(/Table shop\.v_order_totals[^}]*?'''\]/)?.[0]);
check('mysql view column lineage', /lineage\(auto\): shop\.v_order_totals\.name <- shop\.customers\.name/.test(r.dbml ?? ''));
const asRoot = await post('import', { ...my('root', 'demo'), schemas: ['shop'] }); // MySQL shows triggers only to an account with the TRIGGER privilege, so not to a read-only one
check('mysql trigger in its table note (root)', /TRIGGERS\ntrg_orders_touch/.test(asRoot.dbml ?? ''), asRoot.error);
r = await post('tables', { ...my('reader', 'reader'), schemas: ['shop'] });
check('mysql list tables flags the view', r.status === 200 && r.tables?.length >= 4 && r.tables.filter((t) => t.view).map((t) => t.name).join() === 'v_order_totals', JSON.stringify(r.tables));
r = await post('import', { ...my('reader', 'reader'), schemas: ['shop'], tables: ['shop.orders'] });
check('mysql import only the picked table', r.status === 200 && r.tables === 1, `${r.tables} tables`);
// the session statements the app sends make a write fail, for root too (straight against the server, as for PostgreSQL)
const mysqlCli = (stmts) => execSync(`docker compose exec -T demo-mysql mysql -uroot -pdemo shop -e "${stmts}"`, { stdio: 'pipe' });
try { mysqlCli("SET SESSION TRANSACTION READ ONLY; START TRANSACTION READ ONLY; INSERT INTO customers (name, email) VALUES ('x', 'x@example.com');"); check('mysql read-only session rejects INSERT as root', false, 'INSERT succeeded'); }
catch (e) { check('mysql read-only session rejects INSERT as root', /READ ONLY transaction/i.test(String(e.stderr)), String(e.stderr).trim().split('\n').pop()); }
// TLS: the server's auto-generated certificate (its name never matches the host)
r = await post('schemas', my('reader', 'reader', { tls: 'noverify' }));
check('mysql tls noverify connects', r.status === 200, r.error);
r = await post('schemas', my('reader', 'reader', { tls: 'verify' }));
check('mysql tls verify refuses the auto-generated certificate', r.status >= 400 && /certificate|self[- ]signed|altnames|hostname/i.test(r.error ?? ''), r.error);

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
