import { describe, test, expect } from 'vitest';
import { Parser } from '@dbml/core';
import { buildModel, toMarkdown, ordered, commentMap, slug, tid, display, constraints, linkCols } from './docsModel.js';
import { lineageEdges } from './lineage.js';

const DBML = `
Table shop.customers [note: 'People who buy'] {
  id int [pk, increment]
  email varchar(120) [unique, not null, note: 'login']
}
Table shop.orders {
  id int [pk]
  customer_id int [not null, default: 0]
  status varchar [default: 'new']
  total numeric [default: \`1 + 1\`]
  indexes { (customer_id, status) [name: 'ix_cs'] }
}
Table shop.v_totals { total numeric }
Table audit.log { id int }
Ref fk_orders_customer: shop.orders.customer_id > shop.customers.id [delete: cascade]
TableGroup Sales [color: #3498DB] {
  shop.customers
  shop.orders
}
Enum shop.state { new\n done }
// lineage: shop.v_totals.total <- shop.orders.total
`;
const parse = (t = DBML) => new Parser().parse(t, 'dbmlv2');
const model = (t = DBML) => { const db = parse(t); return buildModel(db, lineageEdges(t, db.schemas.flatMap((s) => s.tables).map((x) => ({ id: tid(x.schema.name, x.name), schema: x.schema.name, name: x.name, fields: x.fields.map((f) => ({ name: f.name })) })))); };

describe('buildModel', () => {
  const m = model();
  test('tables, fields and constraints', () => {
    const c = m.byId.get('shop.customers');
    expect(m.tables.map((t) => t.id)).toEqual(['shop.customers', 'shop.orders', 'shop.v_totals', 'audit.log']);
    expect(c.note).toBe('People who buy');
    expect(constraints(c.fields[0])).toEqual(['PK', 'AI']);
    expect(constraints(c.fields[1])).toEqual(['NN', 'UQ']);
    expect(c.fields[1].note).toBe('login');
  });
  test('defaults: expression in backticks, string quoted, number plain', () => {
    const o = m.byId.get('shop.orders').fields;
    expect([o[1].default, o[2].default, o[3].default]).toEqual(['0', "'new'", '`1 + 1`']);
  });
  test('refs: cardinality, actions, field links and incoming', () => {
    expect(m.refs).toHaveLength(1);
    expect(m.refs[0]).toMatchObject({ name: 'fk_orders_customer', card: '*:1', onDelete: 'cascade', from: { id: 'shop.orders' }, to: { id: 'shop.customers' } });
    expect(m.byId.get('shop.orders').fields[1].refs).toEqual([{ id: 'shop.customers', col: 'id', card: '*:1' }]);
    expect(m.byId.get('shop.customers').incoming).toHaveLength(1);
  });
  test('groups, indexes, enums', () => {
    expect(m.groups).toEqual([{ name: 'Sales', color: '#3498DB', note: '', tables: ['shop.customers', 'shop.orders'] }]);
    expect(m.byId.get('shop.orders').groups).toEqual(['Sales']);
    expect(m.byId.get('shop.orders').indexes[0]).toMatchObject({ name: 'ix_cs', cols: ['customer_id', 'status'] });
    expect(m.enums[0]).toMatchObject({ name: 'state' });
  });
  test('lineage fills builtFrom / feeds on both ends', () => {
    expect(m.byId.get('shop.v_totals').builtFrom.map((x) => x.id)).toEqual(['shop.orders']);
    expect(m.byId.get('shop.orders').feeds.map((x) => x.id)).toEqual(['shop.v_totals']);
  });
});

describe('ordered', () => {
  test('grouped tables first, then the rest', () => {
    const s = ordered(model());
    expect(s.map((x) => x.title)).toEqual(['Sales', 'Other tables']);
    expect(s[1].tables.map((t) => t.id)).toEqual(['shop.v_totals', 'audit.log']);
  });
  test('no groups: one section called Tables', () => expect(ordered(model('Table a { id int }')).map((x) => x.title)).toEqual(['Tables']));
});

describe('small helpers', () => {
  test('tid / display / slug', () => {
    expect(tid('', 'a')).toBe('public.a');
    expect(display({ schema: 'public', name: 'a' })).toBe('a');
    expect(display({ schema: 'shop', name: 'a' })).toBe('shop.a');
    expect(slug('shop.my table')).toBe('t_shop_my_table');
  });
  test('commentMap groups by key', () => {
    const m = commentMap([{ key: 'a', text: '1' }, { key: 'b', text: '2' }, { key: 'a', text: '3' }]);
    expect(m.get('a').map((c) => c.text)).toEqual(['1', '3']);
    expect(commentMap().size).toBe(0);
  });
  test('linkCols', () => {
    expect(linkCols({ maps: [{ s: 'a', t: 'b' }] })).toBe(' (a -> b)');
    expect(linkCols({ cols: ['x', 'y'], tCols: ['z'] })).toBe(' (x, y -> z)');
    expect(linkCols({})).toBe('');
  });
});

describe('toMarkdown', () => {
  const md = toMarkdown(model(), 'Shop docs', [{ key: 'shop.customers', author: 'Ana', text: 'check **this**' }]);
  test('has the title, every table and a column table', () => {
    expect(md).toContain('# Shop docs');
    for (const n of ['shop.customers', 'shop.orders', 'audit.log']) expect(md).toContain(n);
    expect(md).toContain('| `email` | varchar(120) | NN, UQ |');
    expect(md).toContain('- INDEX (customer_id, status) — ix_cs');
    expect(md).toContain('**Built from** (data lineage)');
    expect(md).toContain('**Referenced by**');
    expect(md).toContain('on delete cascade');
  });
  test('a comment on the table is rendered with its author', () => expect(md).toContain('> **Comment (Ana):** check **this**'));
  test('escapes pipes and newlines in cells', () => {
    const t = 'Table a {\n  x int [note: \'a | b\']\n}';
    expect(toMarkdown(model(t), 'T')).toContain('a \\| b');
  });
  test('does not throw without comments or changelog', () => expect(() => toMarkdown(model(), 'T')).not.toThrow());
});
