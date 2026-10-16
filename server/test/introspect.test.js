import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../src/introspect.js';

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
