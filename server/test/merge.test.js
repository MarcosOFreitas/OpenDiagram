import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepGroups, structural, loadParser } from '../src/merge.js';

await loadParser();

// the same cases as the browser's web/src/diagramModel.test.js: the two copies must agree
const DBML = `Table shop.customers { id int [pk] }
Table shop.orders { id int [pk]
  customer_id int }
Ref: shop.orders.customer_id > shop.customers.id
`;

test('keepGroups: old groups come back (members that vanished are dropped), hand-written lineage survives, (auto) lineage is regenerated', () => {
  const old = `${DBML}Table shop.gone { id int }
Table shop.gone2 { id int }
TableGroup Sales [color: #111111] {
  shop.orders
  shop.gone
}
TableGroup Dead {
  shop.gone2
}
// lineage: shop.orders -> shop.customers
// lineage(auto): shop.orders -> shop.customers
`;
  const out = keepGroups(old, DBML);
  assert.equal(out, `${DBML}\n// lineage: shop.orders -> shop.customers\n\nTableGroup Sales [color: #111111] {\n  shop.orders\n}\n`);
});
test('names that need quoting are quoted', () => {
  const out = keepGroups('Table "my s"."my t" { id int }\nTableGroup "Big group" {\n  "my s"."my t"\n}\n', 'Table "my s"."my t" { id int }\n');
  assert.match(out, /TableGroup "Big group" \{\n  "my s"\."my t"\n\}/);
});
test('unparsable old text: the new text as it is', () => assert.equal(keepGroups('Table {', DBML), DBML));
test('no groups: unchanged', () => assert.equal(keepGroups(DBML, DBML), DBML));

test('structural: what a refresh changed in the structure, in the words of schemaDiff.js; null when nothing structural changed, a side does not parse or is too large to parse', () => {
  const add = `${DBML}Table shop.items { id int }\n`;
  assert.equal(structural(DBML, add), '1 table added');
  assert.equal(structural(add, DBML), '1 table removed');
  assert.equal(structural(DBML, DBML.replace('customer_id int', 'customer_id bigint')), '1 table changed');
  assert.equal(structural(DBML, `${DBML}// comment\n`), null);
  assert.equal(structural('Table {', DBML), null);
  assert.equal(structural(DBML, `${add}// ${'x'.repeat(500_000)}\n`), null);
});
