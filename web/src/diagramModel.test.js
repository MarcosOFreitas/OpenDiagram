// @vitest-environment node
import { describe, test, expect } from 'vitest';
import { parse, viewKindOf, withGroups, keepGroups, diffSummary, readable, qid, cid, pid, edgeShown } from './diagramModel.js';

const DBML = `Table shop.customers { id int [pk] }
Table shop.orders { id int [pk]
  customer_id int }
Ref: shop.orders.customer_id > shop.customers.id
`;

describe('parse', () => {
  test('tables, refs and groups', () => {
    const p = parse(`${DBML}\nTableGroup Sales [color: #3498DB] {\n  shop.orders\n}\n`);
    expect(p.tables.map((t) => t.id)).toEqual(['shop.customers', 'shop.orders']);
    expect(p.refs).toHaveLength(1);
    expect(cid(p.refs[0])).toBe('shop.orders');
    expect(pid(p.refs[0])).toBe('shop.customers');
    expect(p.groups).toEqual([{ name: 'Sales', color: '#3498DB', tables: ['shop.orders'] }]);
  });
  test('syntax error: no throw, error + diagnostics with positions', () => {
    const p = parse('Table {');
    expect(p.error).toBeTruthy();
    expect(p.diags[0]).toMatchObject({ line: expect.any(Number), col: expect.any(Number) });
  });
  test('view kind comes from the table note, with or without the full DDL', () => {
    const p = parse(`Table s.v1 {
  a int
  Note: '''VIEW'''
}
Table s.v2 {
  a int
  Note: '''MATERIALIZED VIEW
CREATE MATERIALIZED VIEW s.v2 AS
select 1;'''
}
Table s.t {
  a int
  Note: 'my VIEW of things'
}
`);
    expect(p.error).toBeUndefined();
    expect(p.tables.map((t) => t.viewKind)).toEqual(['View', 'Mat. view', '']);
  });
});

describe('viewKindOf', () => {
  test.each([['VIEW', 'View'], ['MATERIALIZED VIEW', 'Mat. view'], ['VIEW\nCREATE VIEW x AS select 1;', 'View'], ['MATERIALIZED VIEW\nCREATE MATERIALIZED VIEW x AS select 1', 'Mat. view'], ['a VIEW b', ''], ['', ''], [undefined, '']])('%j -> %j', (n, k) => expect(viewKindOf(n)).toBe(k));
  test('accepts the parser note object', () => expect(viewKindOf({ value: 'VIEW' })).toBe('View'));
});

describe('withGroups / keepGroups (refresh keeps the user TableGroups)', () => {
  test('appends the groups and drops members that no longer exist; empty groups vanish', () => {
    const out = withGroups(DBML, [{ name: 'A', color: '#111111', tables: ['shop.orders', 'shop.gone'] }, { name: 'Dead', tables: ['shop.gone'] }]);
    const g = parse(out).groups;
    expect(g).toEqual([{ name: 'A', color: '#111111', tables: ['shop.orders'] }]);
  });
  test('no groups or unparsable DBML: unchanged', () => {
    expect(withGroups(DBML, [])).toBe(DBML);
    expect(withGroups('Table {', [{ name: 'A', tables: ['x.y'] }])).toBe('Table {');
  });
  test('names that need quoting are quoted and survive a parse', () => {
    expect(qid('plain_1')).toBe('plain_1');
    expect(qid('has space')).toBe('"has space"');
    const out = withGroups('Table "my s"."my t" { id int }\n', [{ name: 'Big group', tables: ['my s.my t'] }]);
    expect(parse(out).groups[0]).toMatchObject({ name: 'Big group', tables: ['my s.my t'] });
  });
  test('keepGroups: new import text + the old groups; hand-written lineage survives, (auto) lineage is regenerated', () => {
    const old = `${DBML}\nTableGroup Sales {\n  shop.orders\n}\n// lineage: shop.orders -> shop.customers\n`;
    const out = keepGroups(old, DBML);
    expect(parse(out).groups.map((g) => g.name)).toEqual(['Sales']);
    expect(out).toContain('// lineage: shop.orders -> shop.customers');
  });
  test('keepGroups with unparsable old text returns the new text', () => expect(keepGroups('Table {', DBML)).toBe(DBML));
});

describe('diffSummary', () => {
  const add = `${DBML}Table shop.items { id int }\n`;
  test('added', () => expect(diffSummary(DBML, add)).toBe('+1 table(s)'));
  test('removed', () => expect(diffSummary(add, DBML)).toBe('−1 table(s)'));
  test('changed column list', () => expect(diffSummary(DBML, DBML.replace('customer_id int', 'customer_id bigint'))).toBe('1 changed'));
  test('nothing structural', () => expect(diffSummary(DBML, `${DBML}// comment\n`)).toBe('indexes/relationships/comments changed'));
  test('unparsable', () => expect(diffSummary('Table {', DBML)).toBe('schema changed'));
});

describe('readable', () => {
  test('dark text on light header, white on dark, junk input does not throw', () => {
    expect(readable('#ffffff')).toBe('#111827');
    expect(readable('#000000')).toBe('#fff');
    expect(readable('#F39C12')).toBe('#111827'); // orange: white would fail 4.5:1
    expect(['#fff', '#111827']).toContain(readable('nonsense'));
  });
});

describe('edgeShown (which lines the canvas draws)', () => {
  const ref = { source: 'a', target: 'b', data: { kind: 'ref' } }, lin = { source: 'a', target: 'b', data: { kind: 'lineage' } };
  const none = new Set();
  test('everything by default', () => { expect(edgeShown(ref, { hidden: none })).toBe(true); expect(edgeShown(lin, { hidden: none })).toBe(true); });
  test('a line that touches a hidden table is not drawn', () => {
    expect(edgeShown(ref, { hidden: new Set(['a']) })).toBe(false);
    expect(edgeShown(lin, { hidden: new Set(['b']) })).toBe(false);
  });
  test('lineage off hides only the lineage arrows', () => {
    expect(edgeShown(lin, { hidden: none, lineageOn: false })).toBe(false);
    expect(edgeShown(ref, { hidden: none, lineageOn: false })).toBe(true);
  });
  test('"Hide relationship lines" hides the relationships and keeps the lineage arrows', () => {
    expect(edgeShown(ref, { hidden: none, hideRefs: true })).toBe(false);
    expect(edgeShown(lin, { hidden: none, hideRefs: true })).toBe(true);
    expect(edgeShown(lin, { hidden: none, hideRefs: true, lineageOn: false })).toBe(false);
  });
  test('off by default: no flag, no change', () => expect(edgeShown(ref, { hidden: none, hideRefs: undefined })).toBe(true));
});
