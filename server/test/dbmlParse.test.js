// The server reads DBML with the light parse (.specs/14-release-v1.md, item 9): it must give what @dbml/core's own Parser gives for
// 'dbmlv2' (the copy in web/src/dbmlParse.js has the same test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Parser, ModelExporter } from '@dbml/core';
import { parseDbml } from '../src/dbmlParse.js';

const viaCore = (t) => new Parser().parse(t, 'dbmlv2');
const asJson = (db) => ModelExporter.export(db, 'json', false);
const caught = (f) => { try { f(); } catch (e) { return e; } };

const DBML = `Project shop {
  database_type: 'PostgreSQL'
  Note: 'demo'
}
Enum shop.status {
  new
  paid [note: 'money in']
}
Table shop.customers [note: 'who buys'] {
  id int [pk, increment]
  email varchar(200) [not null, unique, note: 'login']
  created_at timestamp [default: \`now()\`]
  checks {
    \`id > 0\` [name: 'pos']
  }
}
Table shop.orders {
  id int [pk]
  customer_id int
  status shop.status [default: 'new']
  total numeric(10,2) [check: \`total >= 0\`]
  indexes {
    (customer_id, status) [name: 'by_customer']
    total [unique, note: 'WHERE total > 0']
  }
}
Ref fk: shop.orders.customer_id > shop.customers.id [delete: cascade, update: no action]
Table shop.items {
  order_id int [ref: > shop.orders.id]
}
TableGroup sales [color: #3498DB] {
  shop.customers
  shop.orders
}
Note sticky {
  'remember me'
}
// lineage: shop.orders <- shop.customers
`;

test('the same database as @dbml/core\'s Parser for a diagram with a project, enums, keys, indexes, checks, refs, groups and notes', () => {
  assert.equal(asJson(parseDbml(DBML)), asJson(viaCore(DBML)));
});

test('the same errors (CompilerError with diags) for DBML that does not parse', () => {
  const bad = 'Table a {\n  id int [pk\n}\nRef: a.x > b.y\n';
  const mine = caught(() => parseDbml(bad)), theirs = caught(() => viaCore(bad));
  assert.ok(mine?.diags?.length > 0);
  assert.deepEqual(mine.diags, theirs.diags);
});
