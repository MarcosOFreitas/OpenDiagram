// @vitest-environment node
// Column handles are drawn only for the columns some edge connects (a 100-table diagram had ~4,400 handles, four per column, each one
// a subscriber of React Flow's store). These tests pin that every handle an edge asks for exists: an edge to a missing handle is not drawn.
import { describe, test, expect } from 'vitest';
import { parse, handleColumns, edgesOf } from './diagramModel.js';
import { TEMPLATES } from './templates.js';
import { stressDbml } from '../../tools/stressdbml.mjs';

const cols = (dbml) => { const p = parse(dbml); expect(p.error).toBeUndefined(); return { p, h: handleColumns(p) }; };
const of = (h, table) => [...(h.get(table) || [])].sort();

describe('handleColumns', () => {
  test('a reference: the column on each side, nothing else', () => {
    const { h } = cols('Table s.a {\n  id int [pk]\n  x int\n}\nTable s.b {\n  id int [pk]\n  a_id int\n  y int\n}\nRef: s.b.a_id > s.a.id\n');
    expect(of(h, 's.a')).toEqual(['id']);
    expect(of(h, 's.b')).toEqual(['a_id']);
  });

  test('composite, self and repeated references, names with spaces, inline refs', () => {
    const { h } = cols([
      'Table "my s"."my t" {', '  "the id" int [pk]', '  "parent id" int [ref: > "my s"."my t"."the id"]', '}',
      'Table c {', '  a int', '  b int', '  k int', '}',
      'Table d {', '  a int', '  b int', '}',
      'Ref: c.(a, b) > d.(a, b)', 'Ref: c.k > d.a', 'Ref: c.a - d.b',
    ].join('\n'));
    expect(of(h, 'my s.my t')).toEqual(['parent id', 'the id']);
    expect(of(h, 'public.c')).toEqual(['a', 'b', 'k']);
    expect(of(h, 'public.d')).toEqual(['a', 'b']);
  });

  test('data lineage: mapped columns, and the listed ones of a table-level arrow', () => {
    const { h } = cols([
      'Table sales.orders {', '  id int', '  total int', '  note text', '}',
      'Table sales.v_sum {', '  id int', '  total int', '}',
      'Table sales.v_ids {', '  id int', '}',
      '// lineage: sales.v_sum.total <- sales.orders.total',
      '// lineage: sales.v_ids <- sales.orders(id)',
    ].join('\n'));
    expect(of(h, 'sales.orders')).toEqual(['id', 'total']);
    expect(of(h, 'sales.v_sum')).toEqual(['total']);
    expect(of(h, 'sales.orders')).not.toContain('note');
  });

  test('a table without relationships needs no column handle', () => {
    expect(of(cols('Table lonely {\n  id int\n}\n').h, 'public.lonely')).toEqual([]);
  });
});

describe('every handle an edge asks for exists', () => {
  // the handle ids App.jsx gives an edge (both sides, since the side depends on where the tables are)
  const wanted = (e) => (e.data.kind === 'lineage'
    ? (e.data.sCols.length === 1 && e.data.tCols.length === 1 ? [[e.source, e.data.sCols[0]], [e.target, e.data.tCols[0]]] : [])
    : [[e.source, e.data.sf], [e.target, e.data.tf]]);
  const cases = [...TEMPLATES.map((t) => [t.name, t.dbml]), ...[50, 100, 200].map((n) => [`stress ${n}`, stressDbml(n)])];
  test.each(cases)('%s', (_, dbml) => {
    const p = parse(dbml); expect(p.error).toBeUndefined();
    const h = handleColumns(p), edges = edgesOf(p);
    expect(edges.length).toBeGreaterThan(0);
    for (const e of edges) for (const [table, col] of wanted(e)) expect(h.get(table)?.has(col), `${e.id}: ${table}.${col}`).toBe(true);
  });
});
