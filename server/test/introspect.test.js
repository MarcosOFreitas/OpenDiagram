import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { assemble, oraNotNull, explainDbError, pgColumn, oraColumn, pgConfig, myConfig, oraConnectString, pgWith } from '../src/introspect.js';

const t = (schema, name, extra = {}) => ({ schema, name, comment: null, ...extra });
const c = (schema, table, name) => ({ schema, table, col: { name, type: 'int', nullable: true } });

test('columns, primary keys and triggers attach to their table; rows of unknown tables are ignored', () => {
  const m = assemble(
    [t('s', 'a')], [c('s', 'a', 'id'), c('s', 'ghost', 'x')], [{ schema: 's', table: 'a', cols: ['id'] }], [], [],
    [{ schema: 's', table: 'a', name: 'trg', def: 'before insert' }, { schema: 's', table: 'ghost', name: 'g', def: 'x' }],
  );
  assert.equal(m.tables.length, 1);
  assert.deepEqual([m.tables[0].columns.map((x) => x.name), m.tables[0].pk, m.tables[0].triggers.length], [['id'], ['id'], 1]);
});

test('check constraints attach to their table, partitioning rides on the table row; both empty for a plain table', () => {
  const m = assemble([t('s', 'a', { partition: 'RANGE (d)' }), t('s', 'b')], [], [], [], [], [], [], [], [], [],
    [{ schema: 's', table: 'a', name: 'a_q_check', expr: 'q > 0' }, { schema: 's', table: 'ghost', name: 'g', expr: 'x' }]);
  const [a, b] = m.tables;
  assert.deepEqual([a.partition, a.checks], ['RANGE (d)', [{ name: 'a_q_check', expr: 'q > 0' }]]);
  assert.deepEqual([b.partition, b.checks], [null, []]);
});

test("Oracle: the NOT NULL of a column is a check constraint in the catalog; only that system form is skipped", () => {
  assert.equal(oraNotNull('"QTY" IS NOT NULL'), true);
  assert.equal(oraNotNull('"Order Id" IS NOT NULL'), true);
  assert.equal(oraNotNull('qty IS NOT NULL'), false); // written by hand: a real check
  assert.equal(oraNotNull('"QTY" IS NOT NULL AND "QTY" > 0'), false);
});

test('an index identical to the primary key is dropped, other indexes stay', () => {
  const m = assemble([t('s', 'a')], [], [{ schema: 's', table: 'a', cols: ['id'] }], [], [
    { schema: 's', table: 'a', name: 'a_pk', unique: true, columns: ['id'] },
    { schema: 's', table: 'a', name: 'a_u', unique: true, columns: ['id', 'x'] },
    { schema: 's', table: 'a', name: 'a_n', unique: false, columns: ['id'] },
  ]);
  assert.deepEqual(m.tables[0].indexes.map((i) => i.name), ['a_u', 'a_n']);
});

test('foreign keys to tables outside the import are dropped', () => {
  const fk = (from, to) => ({ name: 'fk', from: { schema: 's', name: from, columns: ['x'] }, to: { schema: 's', name: to, columns: ['id'] } });
  const m = assemble([t('s', 'a'), t('s', 'b')], [], [], [fk('a', 'b'), fk('a', 'outside'), fk('outside', 'b')], []);
  assert.equal(m.refs.length, 1);
});

test('views keep their definition and kind (null for tables)', () => {
  const m = assemble([t('s', 'v', { view: 'select 1', viewKind: 'MATERIALIZED VIEW' }), t('s', 'a')], [], [], [], []);
  assert.deepEqual(m.tables.map((x) => [x.view, x.viewKind]), [['select 1', 'MATERIALIZED VIEW'], [null, null]]);
});

test('table lineage is kept only between tables of the import, never to itself', () => {
  const l = (from, to) => ({ target: { schema: 's', name: from }, source: { schema: 's', name: to }, columns: ['id'] });
  const m = assemble([t('s', 'v'), t('s', 'a')], [], [], [], [], [], [], [], [l('v', 'a'), l('v', 'v'), l('v', 'outside'), l('outside', 'a')]);
  assert.equal(m.lineage.length, 1);
  assert.deepEqual(m.lineage[0].sources.map((s) => s.name), ['a']);
});

test('sequences: the tables (and columns) that use one are attached; tables outside the import and repeats do not count', () => {
  const seq = { schema: 's', name: 'q', desc: 'start 1' }, free = { schema: 's', name: 'free', desc: 'start 1' };
  const use = (table, column) => ({ seq: { schema: 's', name: 'q' }, table: { schema: 's', name: table }, column });
  const m = assemble([t('s', 'a'), t('s', 'b')], [], [], [], [], [], [], [seq, free], [], [use('a', 'id'), use('a', 'id'), use('a', 'alt'), use('b'), use('ghost', 'x')]);
  assert.deepEqual(m.sequences[0].usedBy, [{ schema: 's', name: 'a', columns: ['id', 'alt'] }, { schema: 's', name: 'b', columns: [] }]);
  assert.deepEqual(m.sequences[1].usedBy, []); // used by nothing: stays loose
});

import { filterModel } from '../src/introspect.js';
const model = () => ({
  tables: [t('shop', 'a'), t('shop', 'b'), t('audit', 'b'), t('shop', 'v')],
  refs: [{ name: 'r1', from: { schema: 'shop', name: 'a' }, to: { schema: 'shop', name: 'b' } }, { name: 'r2', from: { schema: 'shop', name: 'a' }, to: { schema: 'audit', name: 'b' } }],
  lineage: [{ target: { schema: 'shop', name: 'v' }, sources: [{ schema: 'shop', name: 'a' }, { schema: 'shop', name: 'b' }] }],
});
const names = (m) => m.tables.map((x) => `${x.schema}.${x.name}`);

test('table selection on the server: [] or nothing is every table, a list is exactly those, never more', () => {
  assert.equal(filterModel(model(), []).tables.length, 4);
  assert.equal(filterModel(model(), undefined).tables.length, 4);
  assert.equal(filterModel(model(), null).tables.length, 4);
  assert.deepEqual(names(filterModel(model(), ['shop.a'])), ['shop.a']);
  assert.deepEqual(names(filterModel(model(), ['SHOP.A', 'audit.b'])), ['shop.a', 'audit.b']); // case does not matter
  assert.deepEqual(names(filterModel(model(), ['b'])), ['shop.b', 'audit.b']); // a plain name matches in every schema
  assert.deepEqual(names(filterModel(model(), ['shop.b'])), ['shop.b']); // schema.name matches only that one
});
test('relationships and lineage follow the selected tables only', () => {
  const m = filterModel(model(), ['shop.a', 'shop.b', 'shop.v']);
  assert.deepEqual(m.refs.map((r) => r.name), ['r1']);
  assert.deepEqual(m.lineage[0].sources.map((s) => s.name), ['a', 'b']);
  assert.deepEqual(filterModel(model(), ['shop.a', 'shop.v']).lineage[0].sources.map((s) => s.name), ['a']);
  assert.equal(filterModel(model(), ['shop.b']).lineage.length, 0);
});
test('a chosen table the database no longer has is reported, not silently dropped', () => {
  const m = filterModel(model(), ['shop.a', 'shop.gone', 'audit.nope']);
  assert.deepEqual(names(m), ['shop.a']);
  assert.deepEqual(m.missing, ['shop.gone', 'audit.nope']);
  assert.deepEqual(filterModel(model(), ['shop.a']).missing, []);
  assert.deepEqual(filterModel(model(), []).missing, []);
});

test('database errors in plain words, the original kept in brackets, as a 502; errors that already carry a status are left alone', () => {
  const c = { type: 'postgres', host: 'db.example.com', port: '', database: 'shop' };
  const err = (props, message = 'driver text') => Object.assign(new Error(message), props);
  const say = (e, conn = c) => explainDbError(e, conn).message;
  assert.match(say(err({ code: 'ENOTFOUND' }, 'getaddrinfo ENOTFOUND db.example.com')), /^Host "db\.example\.com" was not found.*\(getaddrinfo ENOTFOUND db\.example\.com\)$/);
  assert.match(say(err({ code: 'ECONNREFUSED' })), /Nothing answers on db\.example\.com:5432/);
  assert.match(say(err({ code: 'ETIMEDOUT' })), /No answer from db\.example\.com:5432/);
  assert.match(say(err({}, 'timeout expired')), /No answer from/);
  assert.match(say(err({ code: '28P01' })), /refused the user name or password/);
  assert.match(say(err({ code: 'ER_ACCESS_DENIED_ERROR' }), { ...c, type: 'mysql' }), /refused the user name or password/);
  assert.match(say(err({}, 'ORA-01017: invalid credential or not authorized; logon denied'), { ...c, type: 'oracle' }), /refused the user name or password/);
  assert.match(say(err({ code: '3D000' })), /Database "shop" does not exist/);
  assert.match(say(err({ code: 'ER_BAD_DB_ERROR' }), { ...c, type: 'mysql' }), /Database "shop" does not exist/);
  assert.match(say(err({}, 'NJS-518: cannot connect to Oracle Database. Service "XE" is not registered with the listener'), { ...c, type: 'oracle', database: 'XE', port: '' }), /service "XE"/);
  assert.match(say(err({ code: 'SELF_SIGNED_CERT_IN_CHAIN' })), /certificate was not accepted/);
  assert.match(say(err({}, 'The server does not support SSL connections')), /does not accept TLS/);
  assert.match(say(err({ code: 'ECONNREFUSED' }), { ...c, type: 'mysql', port: '' }), /:3306/);
  assert.equal(explainDbError(err({ code: 'ECONNREFUSED' })).statusCode, 502);
  assert.equal(say(err({}, 'something new')), 'something new'); // unknown: unchanged
  const own = Object.assign(new Error('invalid host or service name'), { statusCode: 400 });
  assert.equal(explainDbError(own, c), own);
  assert.equal(own.message, 'invalid host or service name');
});

test('a PostgreSQL partition is not a table of the diagram (its parent says PARTITIONED BY): a stored selection that names one does not report it missing', () => {
  const m = { tables: [{ schema: 'shop', name: 'events', columns: [] }, { schema: 'shop', name: 'orders', columns: [] }], refs: [], lineage: [], partitions: ['shop.events_2026'] };
  const out = filterModel(m, ['shop.events', 'shop.events_2026', 'shop.gone']);
  assert.deepEqual(out.tables.map((t) => t.name), ['events']);
  assert.deepEqual(out.missing, ['shop.gone']);
});

test('PostgreSQL columns: serial and identity are increment (no nextval default); a generated column says so in its note, not as a default', () => {
  const r = (o) => ({ schema: 's', table: 't', attname: 'c', type: 'integer', nn: true, def: null, cmt: null, ident: '', gen: '', owned: false, ...o });
  assert.deepEqual(pgColumn(r({ def: "nextval('s.t_c_seq'::regclass)", owned: true })), { name: 'c', type: 'integer', nullable: false, default: undefined, comment: undefined, increment: true });
  assert.equal(pgColumn(r({ def: "nextval('s.other_seq'::regclass)", owned: false })).default, "nextval('s.other_seq'::regclass)"); // a sequence the column does not own stays a default
  assert.equal(pgColumn(r({ ident: 'd' })).increment, true);
  assert.equal(pgColumn(r({ ident: 'a' })).increment, true);
  const g = pgColumn(r({ gen: 's', def: 'price * qty', cmt: 'Total' }));
  assert.deepEqual([g.default, g.comment, g.increment], [undefined, 'Total\nGENERATED ALWAYS AS (price * qty) STORED', undefined]);
  assert.deepEqual(pgColumn(r({ def: '0' })), { name: 'c', type: 'integer', nullable: false, default: '0', comment: undefined });
});

test('Oracle columns: identity is increment (no sequence default); a virtual column says so in its note', () => {
  const r = (o) => ({ COLUMN_NAME: 'C', DATA_TYPE: 'NUMBER', DATA_PRECISION: 10, DATA_SCALE: 0, NULLABLE: 'N', DATA_DEFAULT: null, COMMENTS: null, IDENTITY_COLUMN: 'NO', VIRTUAL_COLUMN: 'NO', ...o });
  const id = oraColumn(r({ IDENTITY_COLUMN: 'YES', DATA_DEFAULT: '"SHOP"."ISEQ$$_7301".nextval' }));
  assert.deepEqual([id.increment, id.default], [true, undefined]);
  const v = oraColumn(r({ VIRTUAL_COLUMN: 'YES', DATA_DEFAULT: '"PRICE"*"QTY" ', COMMENTS: 'Total' }));
  assert.deepEqual([v.default, v.comment], [undefined, 'Total\nGENERATED ALWAYS AS ("PRICE"*"QTY") VIRTUAL']);
  assert.equal(oraColumn(r({ DATA_DEFAULT: "'new' " })).default, "'new'");
});

test('a partial index keeps its WHERE (assemble passes it on)', () => {
  const m = assemble([t('s', 'a')], [], [], [], [{ schema: 's', table: 'a', name: 'ix', unique: true, type: 'btree', columns: ['email'], where: 'active' }]);
  assert.equal(m.tables[0].indexes[0].where, 'active');
});

test('a partial unique index on the primary-key columns is not the primary key: it is kept (seen on the demo)', () => {
  const m = assemble([t('s', 'a')], [], [{ schema: 's', table: 'a', cols: ['id'] }], [], [
    { schema: 's', table: 'a', name: 'a_pkey_copy', unique: true, type: 'btree', columns: ['id'] },
    { schema: 's', table: 'a', name: 'one_unpaid', unique: true, type: 'btree', columns: ['id'], where: 'NOT paid' },
  ]);
  assert.deepEqual(m.tables[0].indexes.map((i) => i.name), ['one_unpaid']);
});

test('a generated expression that PostgreSQL wraps in parentheses is not wrapped twice', () => {
  const r = { schema: 's', table: 't', attname: 'gross', type: 'numeric(10,2)', nn: false, def: '(net + vat)', cmt: null, ident: '', gen: 's', owned: false };
  assert.equal(pgColumn(r).comment, 'GENERATED ALWAYS AS (net + vat) STORED');
  assert.equal(pgColumn({ ...r, def: '(a + 1) * (b + 1)' }).comment, 'GENERATED ALWAYS AS ((a + 1) * (b + 1)) STORED');
});

test('a pinned address is where the drivers connect; PostgreSQL TLS still checks the name, MySQL and Oracle verify keep the name (their drivers check only the host they connect to)', () => {
  const c = { host: 'db.example.com', address: '203.0.113.7', port: '', database: 'FREEPDB1', user: 'u', password: 'p' };
  assert.equal(pgConfig({ ...c, tls: 'off' }).host, '203.0.113.7');
  const v = pgConfig({ ...c, tls: 'verify' });
  assert.deepEqual([v.host, v.ssl.servername, v.ssl.rejectUnauthorized], ['203.0.113.7', 'db.example.com', true]);
  assert.equal(pgConfig({ ...c, address: undefined, tls: 'verify' }).ssl.servername, undefined);
  assert.equal(pgConfig({ ...c, address: undefined, tls: 'off' }).host, 'db.example.com');
  assert.equal(myConfig({ ...c, tls: 'off' }).host, '203.0.113.7');
  assert.equal(myConfig({ ...c, tls: 'noverify' }).host, '203.0.113.7');
  assert.equal(myConfig({ ...c, tls: 'verify' }).host, 'db.example.com');
  assert.match(oraConnectString({ ...c, tls: 'off' }), /\(HOST=203\.0\.113\.7\)/);
  assert.match(oraConnectString({ ...c, tls: 'verify' }), /\(HOST=db\.example\.com\)/);
});

test('MySQL wraps a rejected certificate as HANDSHAKE_SSL_ERROR (seen in the e2e): it is still explained as a certificate problem', () => {
  const e = Object.assign(new Error('self-signed certificate in certificate chain'), { code: 'HANDSHAKE_SSL_ERROR' });
  assert.match(explainDbError(e, { type: 'mysql', host: 'db', port: '' }).message, /^The server's certificate was not accepted.*\(self-signed certificate in certificate chain\)$/);
  const other = Object.assign(new Error('wrong version number'), { code: 'HANDSHAKE_SSL_ERROR' });
  assert.equal(explainDbError(other, { type: 'mysql', host: 'db' }).message, 'wrong version number'); // another handshake failure is not a certificate problem
});

test('a PostgreSQL server that hangs up in the middle of a query fails that request, it does not crash the app (release audit)', async () => {
  const srv = net.createServer((s) => s.once('data', () => { // the startup message: accepted with no password
    s.write(Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0])); // AuthenticationOk
    s.write(Buffer.from([0x5a, 0, 0, 0, 5, 0x49])); // ReadyForQuery
    s.once('data', () => s.destroy()); // the first query: the connection is cut
  }));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    await assert.rejects(pgWith({ host: '127.0.0.1', port: srv.address().port, database: 'd', user: 'u', password: 'p' }, (cl) => cl.query('select 1')), /terminated|closed|ECONNRESET/i);
    await new Promise((r) => setTimeout(r, 100)); // a late 'error' event of the client would crash the process here
  } finally { srv.close(); }
});
