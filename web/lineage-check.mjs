// quick check of the lineage comment parser:  node web/lineage-check.mjs
import assert from 'node:assert/strict';
import { lineageEdges, closure, MANUAL } from './src/lineage.js';

const T = (schema, name, ...cols) => ({ id: `${schema}.${name}`, schema, name, fields: cols.map((name) => ({ name })) });
const tables = [T('public', 'orders', 'id', 'total'), T('public', 'items', 'order_id', 'price'), T('sales', 'v_sum', 'total'), T('sales', 'mv_sum', 'total'), T('public', 'Odd Name', 'x')];

let e = lineageEdges('// lineage: sales.v_sum <- orders(id, total), items\n', tables);
assert.equal(e.length, 2);
assert.deepEqual(e.map((x) => [x.source, x.target]), [['public.orders', 'sales.v_sum'], ['public.items', 'sales.v_sum']]);
assert.deepEqual(e[0].sCols, ['id', 'total']);
assert.equal(e[0].manual, false);

e = lineageEdges('//lineage:  sales.v_sum.total <- public.orders.total , items.price', tables);
assert.equal(e.length, 2);
assert.deepEqual(e[0].tCols, ['total']); assert.deepEqual(e[0].sCols, ['total']); assert.equal(e[0].manual, true);
assert.deepEqual(e[1].sCols, ['price']);
assert.deepEqual(e[0].maps, [{ s: 'total', t: 'total' }]); assert.deepEqual(e[1].maps, [{ s: 'price', t: 'total' }]);
assert.deepEqual(lineageEdges('// lineage(auto): sales.v_sum <- orders(id)\n', tables)[0].maps, []);

e = lineageEdges('// lineage: v_sum <- orders\n// lineage: sales.v_sum <- orders(id)\n', tables);
assert.equal(e.length, 1, 'same pair on two lines is merged');
assert.deepEqual(e[0].sCols, ['id']);

e = lineageEdges('// lineage: sales.v_sum <- "Odd Name", nothing_here, v_sum\n', tables);
assert.equal(e.length, 1, 'unknown names and self references are ignored');
assert.equal(e[0].source, 'public.Odd Name');

assert.deepEqual(lineageEdges('Table a {}\n// just a comment\n', tables), []);
e = lineageEdges('// lineage(auto): sales.v_sum <- orders(id)\n// lineage: sales.v_sum <- items\n', tables);
assert.equal(e.length, 2, 'both the generated and the hand-written line count');
assert.ok(MANUAL.test('// lineage: a <- b') && !MANUAL.test('// lineage(auto): a <- b'));

const chain = lineageEdges('// lineage: sales.v_sum <- orders\n// lineage: sales.mv_sum <- sales.v_sum\n// lineage: orders <- items\n', tables);
const c = closure(chain, 'sales.v_sum');
assert.deepEqual([...c.up].sort(), ['public.items', 'public.orders']);
assert.deepEqual([...c.down], ['sales.mv_sum']);
const cyc = closure([{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }], 'a');
assert.deepEqual([...cyc.up], ['b']); assert.deepEqual([...cyc.down], ['b']);
console.log('lineage parser ok');
