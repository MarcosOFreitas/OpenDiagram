// pure check of the view column lineage (no stack needed):  node server/test-lineage.mjs
import assert from 'node:assert/strict';
import { columnSources, viewColumnLineage } from './src/lineage.js';

const T = (schema, name, ...columns) => ({ schema, name, columns });
const tables = [T('shop', 'customers', 'id', 'name', 'email'), T('shop', 'orders', 'id', 'customer_id', 'status', 'total'), T('shop', 'order_items', 'order_id', 'qty', 'price')];
const catalog = new Map(tables.map((t) => [`${t.schema}.${t.name}`, t]));
const srcOf = (sql, col, sch = 'shop') => { const m = columnSources(sql, catalog, sch); return m && [...(m.get(col) || new Map()).keys()].sort(); };

// plain join with aliases and an expression
const j = 'SELECT c.id AS customer_id, c.name, o.id AS order_id, upper(o.status) AS st, (o.total * 2) AS dbl FROM shop.customers c JOIN shop.orders o ON o.customer_id = c.id';
assert.deepEqual(srcOf(j, 'customer_id'), ['shop.customers.id']);
assert.deepEqual(srcOf(j, 'name'), ['shop.customers.name']);
assert.deepEqual(srcOf(j, 'st'), ['shop.orders.status']);
assert.deepEqual(srcOf(j, 'dbl'), ['shop.orders.total']);

// an expression over two tables, aggregates, unqualified columns that exist in one table only
const agg = 'SELECT status, count(*) AS n, sum(total) AS revenue, qty FROM shop.orders, shop.order_items GROUP BY status, qty';
assert.deepEqual(srcOf(agg, 'status'), ['shop.orders.status']);
assert.deepEqual(srcOf(agg, 'revenue'), ['shop.orders.total']);
assert.deepEqual(srcOf(agg, 'n'), [], 'count(*) uses no column');
assert.deepEqual(srcOf(agg, 'qty'), ['shop.order_items.qty']);
assert.deepEqual(srcOf('SELECT o.total + i.price AS combined FROM shop.orders o JOIN shop.order_items i ON i.order_id = o.id', 'combined'), ['shop.order_items.price', 'shop.orders.total']);

// star expansion, t.* and unqualified table names resolved in the view's schema
assert.deepEqual(srcOf('SELECT * FROM orders', 'status'), ['shop.orders.status']);
assert.deepEqual(srcOf('SELECT o.*, c.email FROM shop.orders o JOIN shop.customers c ON c.id = o.customer_id', 'total'), ['shop.orders.total']);
assert.deepEqual(srcOf('SELECT o.*, c.email FROM shop.orders o JOIN shop.customers c ON c.id = o.customer_id', 'email'), ['shop.customers.email']);

// sub-select in FROM, CTE, UNION, scalar sub-select
assert.deepEqual(srcOf('SELECT x.cnt, o.id FROM shop.orders o LEFT JOIN (SELECT order_id, count(qty) AS cnt FROM shop.order_items GROUP BY order_id) x ON x.order_id = o.id', 'cnt'), ['shop.order_items.qty']);
assert.deepEqual(srcOf('WITH big AS (SELECT id, total AS amount FROM shop.orders WHERE total > 10) SELECT amount AS a FROM big', 'a'), ['shop.orders.total']);
assert.deepEqual(srcOf('SELECT id AS k FROM shop.orders UNION ALL SELECT id FROM shop.customers', 'k'), ['shop.customers.id', 'shop.orders.id']);
assert.deepEqual(srcOf('SELECT o.id, (SELECT max(i.price) FROM shop.order_items i WHERE i.order_id = o.id) AS top FROM shop.orders o', 'top'), ['shop.order_items.price']);

// view on view: the inner view is a source like any table
const withView = new Map([...catalog, ['shop.v1', T('shop', 'v1', 'customer_id', 'name')]]);
assert.deepEqual([...columnSources('SELECT name FROM shop.v1', withView, 'shop').get('name').keys()], ['shop.v1.name']);

// what cannot be read gives no mapping, never an exception
assert.equal(columnSources('SELECT a FROM x CONNECT BY PRIOR a = b', catalog, 'shop'), null);
assert.equal(columnSources('not sql at all', catalog, 'shop'), null);
assert.equal(columnSources('SELECT * FROM somewhere_else', catalog, 'shop'), null, 'star over a table outside the import');
assert.equal(columnSources('x'.repeat(30000), catalog, 'shop'), null);

// whole model
const model = [...tables, { ...T('shop', 'v_orders', 'customer_id', 'name', 'status', 'n'), view: 'SELECT c.id AS customer_id, c.name, o.status, count(*) AS n FROM shop.customers c JOIN shop.orders o ON o.customer_id = c.id GROUP BY c.id, c.name, o.status' }];
const l = viewColumnLineage(model);
assert.equal(l.length, 1);
assert.deepEqual(l[0].target, { schema: 'shop', name: 'v_orders' });
assert.deepEqual(l[0].columns.map((c) => c.column), ['customer_id', 'name', 'status']);
assert.deepEqual(l[0].columns[2].from, [{ schema: 'shop', name: 'orders', column: 'status' }]);
// Oracle: upper-case names and quoted identifiers
const ora = [T('SHOP', 'ORDERS', 'ID', 'STATUS'), { ...T('SHOP', 'V_O', 'ID', 'ST'), view: 'SELECT o.id, o.status AS "ST" FROM orders o' }];
const lo = viewColumnLineage(ora);
assert.deepEqual(lo[0].columns, [{ column: 'ID', from: [{ schema: 'SHOP', name: 'ORDERS', column: 'ID' }] }, { column: 'ST', from: [{ schema: 'SHOP', name: 'ORDERS', column: 'STATUS' }] }]);
console.log('view column lineage ok');
