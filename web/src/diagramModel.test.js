// @vitest-environment node
import { describe, test, expect } from 'vitest';
import { parse, viewKindOf, withGroups, keepGroups, diffSummary, readable, qid, cid, pid, edgeShown, nodeChanges, bentPath, savePayload } from './diagramModel.js';

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

describe('nodeChanges', () => {
  // TableGroup boxes (`g:<name>`) are derived from their tables on every render; letting React Flow's measurements of them into the
  // nodes state made a new array, new boxes, a new measurement, and so on: 45 React commits a second with the diagram idle
  test('drops the measurements of the derived group boxes and keeps everything else', () => {
    const changes = [
      { type: 'dimensions', id: 'g:Sales', dimensions: { width: 300, height: 200 } },
      { type: 'dimensions', id: 'shop.orders', dimensions: { width: 220, height: 180 } },
      { type: 'position', id: 'g:Sales', position: { x: 1, y: 2 } },
      { type: 'select', id: 'shop.orders', selected: true },
    ];
    expect(nodeChanges(changes)).toEqual(changes.slice(1));
  });
});

describe('bentPath: a relationship line whose label was dragged passes through the label in the chosen line style', () => {
  const s = { x: 0, y: 0 }, t = { x: 100, y: 100 };
  const pts = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);
  test('curved: a quadratic curve whose middle is the label', () => {
    const { d, x, y } = bentPath('default', s, t, { x: 80, y: 20 });
    expect(d).toMatch(/^M0,0 Q/);
    const [, , cx, cy, ex, ey] = pts(d);
    expect([(0 + 2 * cx + ex) / 4, (0 + 2 * cy + ey) / 4]).toEqual([80, 20]); // B(0.5)
    expect([x, y]).toEqual([80, 20]);
  });
  test('straight: two straight segments meeting at the label', () => expect(bentPath('straight', s, t, { x: 80, y: 20 })).toEqual({ d: 'M0,0 L80,20 L100,100', x: 80, y: 20 }));
  test('step: the vertical segment moves to the label; the label stays on it when dragged above or below both ends', () => {
    expect(bentPath('step', s, t, { x: 30, y: 40 })).toEqual({ d: 'M0,0 L30,0 L30,100 L100,100', x: 30, y: 40 });
    expect(bentPath('step', s, { x: 100, y: 20 }, { x: 50, y: -40 })).toEqual({ d: 'M0,0 L50,0 L50,20 L100,20', x: 50, y: 0 });
    // both ends on the same side (seen in the browser): a bracket out to the label, never a spike that leaves the label off the line
    expect(bentPath('step', { x: 1538, y: 179.5 }, { x: 1538, y: 157.5 }, { x: 1616, y: -121.5 })).toEqual({ d: 'M1538,179.5 L1616,179.5 L1616,157.5 L1538,157.5', x: 1616, y: 157.5 });
  });
  test('rounded (smoothstep): the step route with rounded corners, never the curve', () => {
    const { d } = bentPath('smoothstep', s, t, { x: 30, y: 40 });
    expect(d.startsWith('M0,0 L')).toBe(true);
    expect(d.endsWith('L100,100')).toBe(true);
    expect(d.match(/Q/g)).toHaveLength(2); // one bend per corner
    expect(d).toContain('Q30,0 ');
    expect(bentPath('smoothstep', s, { x: 100, y: 4 }, { x: 50, y: 2 }).d).toContain('L48,0 Q50,0 50,2'); // the radius never exceeds half a short segment
  });
});

describe('savePayload: what an autosave sends, by who saves', () => {
  const d = { title: 'T', dbml: 'Table a { id int }', source: { connId: 'c1' }, layout: { a: { x: 1, y: 2 } } };
  test('the owner: title, DBML, connection link and layout', () => expect(savePayload({ ...d, isOwner: true, access: 'owner' })).toEqual({ title: 'T', dbml: d.dbml, source: { connId: 'c1' }, layout: d.layout }));
  test('an administrator on someone else\'s diagram: never the connection link', () => expect(savePayload({ ...d, isOwner: false, access: 'admin' })).toEqual({ title: 'T', dbml: d.dbml, layout: d.layout }));
  test('an editor, and anyone through an edit link: DBML and layout only', () => {
    expect(savePayload({ ...d, isOwner: false, access: 'edit' })).toEqual({ dbml: d.dbml, layout: d.layout });
    expect(savePayload({ ...d, isOwner: true, access: 'owner' }, true)).toEqual({ dbml: d.dbml, layout: d.layout });
  });
  test('no layout yet is an empty one, no link is null', () => expect(savePayload({ dbml: 'x', isOwner: true })).toEqual({ title: undefined, dbml: 'x', source: null, layout: {} }));
});
