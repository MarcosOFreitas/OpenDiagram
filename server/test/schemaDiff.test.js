// The structural diff between two versions of a diagram (.specs/14-release-v1.md, item 8): pairs of DBML, parsed by @dbml/core
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Parser } from '@dbml/core';
import { schemaDiff, diffLines, summaryLine } from '../src/schemaDiff.js';

const db = (text) => new Parser().parse(text, 'dbmlv2');
const lines = (a, b) => diffLines(schemaDiff(db(a), db(b))).map((l) => `${'  '.repeat(l.depth)}${l.op} ${l.text}`);

const BASE = `Enum shop.state {
  new
  paid
}
Table shop.orders [note: 'Orders'] {
  id int [pk, increment]
  status shop.state [not null, default: 'new']
  total "decimal(12,2)" [default: 0, note: 'sum']
  code varchar(20) [unique]
  created_at timestamp [default: \`now()\`]
  indexes {
    (status, created_at) [name: 'ix_s', type: btree]
    code [unique, note: 'WHERE code IS NOT NULL']
  }
  checks {
    \`total >= 0\` [name: 'pos_total']
  }
}
Table items {
  order_id int
  line int
  qty int [check: \`qty > 0\`]
  indexes {
    (order_id, line) [pk]
  }
}
Ref fk_items_order: items.order_id > shop.orders.id [delete: cascade]
`;

test('the same structure gives no change; layout and documentation do not count (groups, colours, sticky notes, lineage, Project)', () => {
  const decorated = `Project p {
  database_type: 'PostgreSQL'
}
${BASE.replace("Table shop.orders [note: 'Orders']", "Table shop.orders [headercolor: #3498DB, note: 'Orders']")}
TableGroup g [color: #ff0000] {
  shop.orders
}
Note sticky {
  'hello'
}
// lineage: items <- shop.orders
`;
  assert.deepEqual(schemaDiff(db(BASE), db(decorated)), []);
  assert.equal(summaryLine([]), 'No structural change');
});

test('tables added and removed; a renamed table is one removed and one added', () => {
  const after = BASE.replace('Table items {', 'Table order_lines {').replace('Ref fk_items_order: items.order_id', 'Ref fk_items_order: order_lines.order_id') + 'Table shop.invoices {\n  id int [pk]\n}\n';
  assert.deepEqual(lines(BASE, after), ['- items', '+ order_lines', '+ shop.invoices']);
  assert.equal(summaryLine(schemaDiff(db(BASE), db(after))), '2 tables added, 1 table removed');
});

test('columns: added, removed (a rename is both), and every property that changed on one line', () => {
  const after = BASE
    .replace("status shop.state [not null, default: 'new']", "status varchar(20) [default: 'paid']")
    .replace('code varchar(20) [unique]', 'code varchar(20)')
    .replace("total \"decimal(12,2)\" [default: 0, note: 'sum']", "amount \"decimal(12,2)\" [default: 0, note: 'sum']")
    .replace('  created_at timestamp [default: `now()`]\n', '  created_at timestamp [default: `now()`]\n  paid_at timestamp [not null]\n');
  assert.deepEqual(lines(BASE, after), [
    '~ shop.orders',
    "  ~ column status: type shop.state → varchar(20); not null → null; default 'new' → 'paid'",
    '  - column total',
    '  ~ column code: unique → not unique',
    '  + column amount decimal(12,2) default 0',
    '  + column paid_at timestamp not null',
  ]);
});

test('the primary key is one table-level item, single or composite; auto-increment is a column property', () => {
  const after = BASE.replace('(order_id, line) [pk]', '(order_id, line, qty) [pk]').replace('id int [pk, increment]', 'id int [pk]');
  assert.deepEqual(lines(BASE, after), ['~ items', '  ~ primary key (order_id, line) → (order_id, line, qty)', '~ shop.orders', '  ~ column id: auto-increment → no auto-increment']);
});

test('indexes match by their columns and uniqueness: name, type and note changes are one item; other columns are a removal plus an addition', () => {
  const after = BASE
    .replace("(status, created_at) [name: 'ix_s', type: btree]", "(status, created_at) [name: 'ix_status', type: hash]")
    .replace("code [unique, note: 'WHERE code IS NOT NULL']", "code [unique, note: 'WHERE code <> \\'\\'']\n    (total) [name: 'ix_total']");
  assert.deepEqual(lines(BASE, after), [
    '~ shop.orders',
    '  ~ index (status, created_at): name ix_s → ix_status; type btree → hash',
    '  ~ unique index (code): note changed',
    '  + index (total)',
  ]);
});

test('relationships match by their two ends and sit under the referencing table: actions, name and cardinality are changes', () => {
  const after = BASE.replace('Ref fk_items_order: items.order_id > shop.orders.id [delete: cascade]', 'Ref fk_items: items.order_id > shop.orders.id\nRef: items.line - shop.orders.id');
  assert.deepEqual(lines(BASE, after), [
    '~ items',
    '  ~ relationship items.order_id > shop.orders.id: name fk_items_order → fk_items; on delete cascade → no action',
    '  + relationship items.line - shop.orders.id',
  ]);
});

test('enums: values added and removed on one line; enums added and removed', () => {
  const after = BASE.replace('Enum shop.state {\n  new\n  paid\n}', 'Enum shop.state {\n  new\n  shipped\n}\nEnum shop.kind {\n  a\n}');
  assert.deepEqual(lines(BASE, after), ['+ enum shop.kind', '~ enum shop.state: + shipped; - paid']); // by name, like the tables
  assert.equal(summaryLine(schemaDiff(db(BASE), db(after))), '1 enum added, 1 enum changed');
});

test('checks match by name, or by expression when unnamed (so a changed unnamed check is a removal plus an addition)', () => {
  const after = BASE.replace('`total >= 0` [name: \'pos_total\']', '`total > 0` [name: \'pos_total\']').replace('qty int [check: `qty > 0`]', 'qty int [check: `qty >= 1`]');
  assert.deepEqual(lines(BASE, after), ['~ items', '  - check: qty > 0', '  + check: qty >= 1', '~ shop.orders', '  ~ check pos_total: total >= 0 → total > 0']);
});

test('notes of tables, columns and indexes count as "note changed", without their text', () => {
  const after = BASE.replace("[note: 'Orders']", "[note: 'All orders']").replace("note: 'sum'", "note: 'total with tax'");
  assert.deepEqual(lines(BASE, after), ['~ shop.orders', '  ~ note changed', '  ~ column total: note changed']);
});

test('the summary counts tables and enums; diffLines keeps the order: tables by name, then enums', () => {
  const after = BASE.replace("note: 'sum'", "note: 'x'") + 'Table a_first {\n  id int\n}\n';
  const changes = schemaDiff(db(BASE), db(after));
  assert.equal(summaryLine(changes), '1 table added, 1 table changed');
  assert.deepEqual(diffLines(changes).map((l) => l.text), ['a_first', 'shop.orders', 'column total: note changed']);
});
