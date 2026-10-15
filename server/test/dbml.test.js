import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDbml } from '../src/dbml.js';

const col = (name, type = 'int', extra = {}) => ({ name, type, nullable: true, ...extra });
const table = (name, columns, extra = {}) => ({ schema: 'shop', name, pk: [], columns, indexes: [], ...extra });

test('empty model', () => assert.equal(toDbml({ tables: [], refs: [] }), '\n'));

test('single-column pk goes inline, not null is implied by pk, defaults and comments are written', () => {
  const out = toDbml({ tables: [table('t', [col('id', 'int', { nullable: false }), col('n', 'varchar(10)', { nullable: false, default: "'x'", comment: "it's" })], { pk: ['id'] })], refs: [] });
  assert.match(out, /Table shop\.t \{/);
  assert.match(out, /^ {2}id int \[pk\]$/m);
  assert.match(out, /^ {2}n varchar\(10\) \[not null, default: `'x'`, note: 'it\\'s'\]$/m);
});

test('composite pk is an index block', () => {
  const out = toDbml({ tables: [table('t', [col('a'), col('b')], { pk: ['a', 'b'] })], refs: [] });
  assert.match(out, /indexes \{\n {4}\(a, b\) \[pk\]\n {2}\}/);
});

test('names that are not plain identifiers are quoted; odd types are quoted', () => {
  const out = toDbml({ tables: [table('my table', [col('my col', 'timestamp with time zone')])], refs: [] });
  assert.match(out, /Table shop\."my table" \{/);
  assert.match(out, /"my col" "timestamp with time zone"/);
});

test('refs: composite columns and ON DELETE / UPDATE actions', () => {
  const side = (n, columns) => ({ schema: 'shop', name: n, columns });
  const out = toDbml({ tables: [], refs: [{ name: 'fk1', from: side('a', ['x', 'y']), to: side('b', ['x', 'y']), onDelete: 'cascade', onUpdate: 'no action' }] });
  assert.match(out, /^Ref fk1: shop\.a\.\(x, y\) > shop\.b\.\(x, y\) \[delete: cascade\]$/m);
});

test('a view: structure only by default; the note says VIEW / MATERIALIZED VIEW', () => {
  const v = table('v', [col('a')], { view: 'select 1', viewKind: 'VIEW' });
  const m = table('m', [col('a')], { view: 'select 2', viewKind: 'MATERIALIZED VIEW' });
  const out = toDbml({ tables: [v, m], refs: [] });
  assert.match(out, /Table shop\.v \[note: '''\nVIEW\n'''\]/);
  assert.match(out, /Table shop\.m \[note: '''\nMATERIALIZED VIEW\n'''\]/);
  assert.doesNotMatch(out, /select 1/);
});

test('ddl: true adds the CREATE statement (with a single trailing ;), and keeps the kind first', () => {
  const v = table('v', [col('a')], { view: 'select 1;  ', viewKind: 'VIEW' });
  const m = table('m', [col('a')], { view: 'select 2', viewKind: 'MATERIALIZED VIEW' });
  const out = toDbml({ tables: [v, m], refs: [] }, { ddl: true });
  assert.match(out, /VIEW\nCREATE VIEW shop\.v AS\nselect 1;\n'''/);
  assert.match(out, /MATERIALIZED VIEW\nCREATE MATERIALIZED VIEW shop\.m AS\nselect 2;\n'''/);
});

test('a ddl containing triple quotes cannot break out of the note', () => {
  const out = toDbml({ tables: [table('v', [col('a')], { view: "select ''' from x", viewKind: 'VIEW' })], refs: [] }, { ddl: true });
  assert.equal(out.split("'''").length - 1, 2); // only the opening and the closing marker
});

test('table comment, triggers and view share one note; a plain comment is a single-quoted string', () => {
  const out = toDbml({ tables: [table('t', [col('a')], { comment: 'hello', triggers: [{ name: 'trg', def: 'before insert' }] }), table('u', [col('a')], { comment: 'plain' })], refs: [] });
  assert.match(out, /hello\n\nTRIGGERS\ntrg: before insert/);
  assert.match(out, /Table shop\.u \[note: 'plain'\]/);
});

test('enums are written first and columns of that type reference them unquoted', () => {
  const out = toDbml({ enums: [{ schema: 'shop', name: 'mood', values: ['happy', 'very sad'] }], tables: [table('t', [col('m', 'shop.mood')])], refs: [] });
  assert.ok(out.indexOf('Enum shop.mood') < out.indexOf('Table shop.t'));
  assert.match(out, /"very sad"/);
  assert.match(out, /^ {2}m shop\.mood$/m);
});

test('lineage lines are comments; sequences are standalone notes', () => {
  const out = toDbml({
    tables: [], refs: [],
    lineage: [{ target: { schema: 's', name: 'v' }, sources: [{ schema: 's', name: 't', columns: ['a'] }], columns: [{ column: 'a', from: [{ schema: 's', name: 't', column: 'a' }] }] }],
    sequences: [{ schema: 's', name: 'seq', desc: 'start 1' }],
  });
  assert.match(out, /^\/\/ lineage\(auto\): s\.v <- s\.t\(a\)$/m);
  assert.match(out, /^\/\/ lineage\(auto\): s\.v\.a <- s\.t\.a$/m);
  assert.match(out, /Note "s\.seq" \{/);
});
