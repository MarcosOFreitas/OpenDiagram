import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble, oraNotNull, explainDbError } from '../src/introspect.js';

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
