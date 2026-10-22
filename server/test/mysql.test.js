// MySQL / MariaDB driver, the parts that need no server: connection options, the read-only session, the privilege allowlist and
// the mapping of catalog rows. The demo server checks the rest (server/test-guardrails.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { myConfig, myWith, myGrantWarnings, myColumn, myTableRow } from '../src/introspect.js';

const conn = { type: 'mysql', host: 'db.example.com', port: '', database: '', user: 'u', password: 'p', tls: 'off' };

test('connection options: no generated code, no local files, no multiple statements, short connect timeout; default port', () => {
  const o = myConfig(conn);
  assert.equal(o.disableEval, true);
  assert.ok(o.flags.includes('-LOCAL_FILES'));
  assert.equal(o.infileStreamFactory, undefined);
  assert.ok(!o.multipleStatements);
  assert.equal(o.connectTimeout, 8000);
  assert.equal(o.port, 3306);
  assert.equal(o.database, undefined); // the Database field is optional for MySQL
  assert.equal(myConfig({ ...conn, database: 'shop', port: '3307' }).database, 'shop');
});

test('TLS modes: off, noverify (encrypted, not checked), verify (chain and host name, optional CA)', () => {
  assert.equal(myConfig(conn).ssl, undefined);
  assert.deepEqual(myConfig({ ...conn, tls: 'noverify' }).ssl, { rejectUnauthorized: false });
  assert.deepEqual(myConfig({ ...conn, tls: 'verify' }).ssl, { rejectUnauthorized: true });
  assert.deepEqual(myConfig({ ...conn, tls: 'verify', caPem: 'PEM' }).ssl, { rejectUnauthorized: true, ca: 'PEM' });
});

test('the session is read-only before anything runs, and always rolled back and closed, also when the work fails', async () => {
  const sent = [];
  let closed = 0;
  const connect = async () => ({ query: async (sql) => { sent.push(sql); return [[]]; }, end: async () => { closed++; } });
  await myWith(conn, async (c) => { await c.query('select 1'); }, connect);
  assert.deepEqual(sent, ['SET SESSION TRANSACTION READ ONLY', 'SET SESSION max_execution_time = 30000', 'START TRANSACTION READ ONLY', 'select 1', 'ROLLBACK']);
  sent.length = 0;
  await assert.rejects(myWith(conn, async () => { throw new Error('boom'); }, connect), /boom/);
  assert.equal(sent.at(-1), 'ROLLBACK');
  assert.equal(closed, 2);
});

test('privileges: an allowlist; anything else on the global scope or a selected database is a warning, with its scope', () => {
  const reader = ['GRANT USAGE ON *.* TO `reader`@`%`', 'GRANT SELECT, SHOW VIEW ON `shop`.* TO `reader`@`%`'];
  assert.deepEqual(myGrantWarnings(reader, ['shop']), []);
  const writer = ['GRANT USAGE ON *.* TO `writer`@`%`', 'GRANT SELECT, INSERT, UPDATE, DELETE ON `shop`.* TO `writer`@`%`'];
  assert.deepEqual(myGrantWarnings(writer, ['shop']), ['has INSERT, UPDATE, DELETE on shop.*']);
  assert.deepEqual(myGrantWarnings(writer, ['other']), []); // grants on a database that is not imported do not matter
  const root = ['GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP ON *.* TO `root`@`%` WITH GRANT OPTION', 'GRANT APPLICATION_PASSWORD_ADMIN,AUDIT_ADMIN,BACKUP_ADMIN,BINLOG_ADMIN,CONNECTION_ADMIN ON *.* TO `root`@`%` WITH GRANT OPTION', 'GRANT PROXY ON ``@`` TO `root`@`%` WITH GRANT OPTION'];
  const w = myGrantWarnings(root, ['shop']);
  assert.ok(w.some((x) => /INSERT/.test(x) && /\*\.\*/.test(x)), w.join(' | '));
  assert.ok(w.some((x) => /BACKUP_ADMIN/.test(x)), w.join(' | '));
  assert.ok(w.some((x) => /grant/i.test(x)), w.join(' | '));
  assert.ok(w.some((x) => /PROXY/.test(x)), w.join(' | '));
});

test('privileges: EXECUTE, ALL PRIVILEGES, table-level and column-level grants, database name patterns, role grants', () => {
  assert.deepEqual(myGrantWarnings(['GRANT SELECT, EXECUTE ON `shop`.* TO `a`@`%`'], ['shop']), ['has EXECUTE on shop.*']);
  assert.deepEqual(myGrantWarnings(['GRANT ALL PRIVILEGES ON `shop`.* TO `a`@`%`'], ['shop']), ['has ALL PRIVILEGES on shop.*']);
  assert.deepEqual(myGrantWarnings(['GRANT INSERT ON `shop`.`orders` TO `a`@`%`'], ['shop']), ['has INSERT on shop.orders']);
  assert.deepEqual(myGrantWarnings(['GRANT SELECT (`id`), UPDATE (`total`) ON `shop`.`orders` TO `a`@`%`'], ['shop']), ['has UPDATE on shop.orders']);
  assert.deepEqual(myGrantWarnings(['GRANT UPDATE ON `sh\\_%`.* TO `a`@`%`'], ['sh_op']), ['has UPDATE on sh\\_%.*']); // a pattern that covers a selected database
  assert.deepEqual(myGrantWarnings(['GRANT UPDATE ON `x\\_%`.* TO `a`@`%`'], ['shop']), []);
  assert.deepEqual(myGrantWarnings(['GRANT `app_read`@`%` TO `a`@`%`'], ['shop']), []); // a role: its privileges are listed by SHOW GRANTS ... USING
});

test('columns: the type as MySQL writes it, enum columns become a DBML enum, defaults, auto increment', () => {
  const row = (o) => ({ TABLE_SCHEMA: 'shop', TABLE_NAME: 'orders', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null, EXTRA: '', COLUMN_COMMENT: '', ...o });
  assert.deepEqual(myColumn(row({ COLUMN_NAME: 'id', DATA_TYPE: 'int', COLUMN_TYPE: 'int unsigned', EXTRA: 'auto_increment' })).col,
    { name: 'id', type: 'int unsigned', nullable: false, default: undefined, comment: undefined, increment: true });
  const e = myColumn(row({ COLUMN_NAME: 'status', DATA_TYPE: 'enum', COLUMN_TYPE: "enum('new','it''s done','paid')", COLUMN_DEFAULT: 'new', COLUMN_COMMENT: 'state' }));
  assert.equal(e.col.type, 'shop.orders_status');
  assert.equal(e.col.default, "'new'");
  assert.equal(e.col.comment, 'state');
  assert.deepEqual(e.enum, { schema: 'shop', name: 'orders_status', values: ['new', "it's done", 'paid'] });
  assert.equal(myColumn(row({ COLUMN_NAME: 'note', DATA_TYPE: 'varchar', COLUMN_TYPE: 'varchar(20)', IS_NULLABLE: 'YES', COLUMN_DEFAULT: "o'k" })).col.default, "'o''k'");
  assert.equal(myColumn(row({ COLUMN_NAME: 'qty', DATA_TYPE: 'int', COLUMN_TYPE: 'int', COLUMN_DEFAULT: '0' })).col.default, '0');
  assert.equal(myColumn(row({ COLUMN_NAME: 'at', DATA_TYPE: 'timestamp', COLUMN_TYPE: 'timestamp', COLUMN_DEFAULT: 'CURRENT_TIMESTAMP', EXTRA: 'DEFAULT_GENERATED' })).col.default, 'CURRENT_TIMESTAMP');
  assert.equal(myColumn(row({ COLUMN_NAME: 'n', DATA_TYPE: 'varchar', COLUMN_TYPE: 'varchar(5)', IS_NULLABLE: 'YES', COLUMN_DEFAULT: null })).col.default, undefined);
});

test('tables: a view is marked once (MySQL fills TABLE_COMMENT with "VIEW" for every view) and its lineage reads backticks as quotes', () => {
  const v = myTableRow({ s: 'shop', n: 'v', t: 'VIEW', cm: 'VIEW' }, 'select `o`.`id` AS `id` from `shop`.`orders` `o`');
  assert.equal(v.comment, undefined);
  assert.equal(v.viewKind, 'VIEW');
  assert.equal(v.lineageSql, 'select "o"."id" AS "id" from "shop"."orders" "o"');
  assert.equal(v.view, 'select `o`.`id` AS `id` from `shop`.`orders` `o`'); // the DDL keeps MySQL's own text
  const t = myTableRow({ s: 'shop', n: 'orders', t: 'BASE TABLE', cm: 'Orders' });
  assert.deepEqual([t.comment, t.view, t.viewKind], ['Orders', null, null]);
});

test('MariaDB: no max_execution_time, so the 30 s limit is set with max_statement_time (seconds); the session stays read-only', async () => {
  const sent = [];
  const connect = async () => ({ query: async (sql) => { sent.push(sql); if (/max_execution_time/.test(sql)) throw new Error("Unknown system variable 'max_execution_time'"); return [[]]; }, end: async () => {} });
  await myWith(conn, async (c) => { await c.query('select 1'); }, connect);
  assert.deepEqual(sent, ['SET SESSION TRANSACTION READ ONLY', 'SET SESSION max_execution_time = 30000', 'SET SESSION max_statement_time = 30', 'START TRANSACTION READ ONLY', 'select 1', 'ROLLBACK']);
});

test('MariaDB defaults: literals already quoted, expressions bare, the text NULL for no default', () => {
  const row = (o) => ({ TABLE_SCHEMA: 'shop', TABLE_NAME: 'orders', IS_NULLABLE: 'YES', EXTRA: '', COLUMN_COMMENT: '', COLUMN_NAME: 'c', DATA_TYPE: 'varchar', COLUMN_TYPE: 'varchar(20)', ...o });
  const maria = { mariadb: true };
  assert.equal(myColumn(row({ COLUMN_DEFAULT: "'new'" }), maria).col.default, "'new'");
  assert.equal(myColumn(row({ COLUMN_DEFAULT: "'it''s'" }), maria).col.default, "'it''s'");
  assert.equal(myColumn(row({ COLUMN_DEFAULT: 'current_timestamp()', DATA_TYPE: 'timestamp', COLUMN_TYPE: 'timestamp' }), maria).col.default, 'current_timestamp()');
  assert.equal(myColumn(row({ COLUMN_DEFAULT: '0.00', DATA_TYPE: 'decimal', COLUMN_TYPE: 'decimal(12,2)' }), maria).col.default, '0.00');
  assert.equal(myColumn(row({ COLUMN_DEFAULT: 'NULL' }), maria).col.default, undefined);
  assert.equal(myColumn(row({ COLUMN_DEFAULT: "'NULL'" }), maria).col.default, "'NULL'"); // the string 'NULL' is a real default
});
