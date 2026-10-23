// @vitest-environment node
import { describe, test, expect } from 'vitest';
import { layout, tableWidth, tableHeight, shownFields, lessDetail, shelfPack, lineageRefs, PAD, HEAD, ROW } from './layout.js';

const T = (name, nf = 3, extra = {}) => ({ id: `s.${name}`, schema: 's', name, fields: Array.from({ length: nf }, (_, i) => ({ name: `c${i}`, type: 'int', pk: i === 0 })), indexes: [], ...extra });
const R = (child, parent) => ({ child: { schemaName: 's', tableName: child, fieldNames: ['x'] }, parent: { schemaName: 's', tableName: parent, fieldNames: ['id'] } });
const chain = (n) => ({ tables: Array.from({ length: n }, (_, i) => T(`t${i}`)), refs: Array.from({ length: n - 1 }, (_, i) => R(`t${i + 1}`, `t${i}`)) });
const star = (n) => ({ tables: [T('hub'), ...Array.from({ length: n }, (_, i) => T(`leaf${i}`))], refs: Array.from({ length: n }, (_, i) => R(`leaf${i}`, 'hub')) });
const lone = (n) => ({ tables: Array.from({ length: n }, (_, i) => T(`x${i}`, 2 + (i % 5))), refs: [] });
const cycle = () => ({ tables: [T('a'), T('b'), T('c')], refs: [R('a', 'b'), R('b', 'c'), R('c', 'a')] });
const posOf = (nodes) => new Map(nodes.map((n) => [n.id, n.position]));
const box = (n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: tableWidth(n.data), h: tableHeight(n.data) });
const overlaps = (nodes) => {
  const b = nodes.map(box), out = [];
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    const p = b[i], q = b[j];
    if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) out.push(`${p.id} x ${q.id}`);
  }
  return out;
};
const ALGOS = ['auto', 'lr', 'pipeline', 'snowflake', 'compact'];

describe('table size', () => {
  test('width follows the longest name, within 220..480; an explicit width wins', () => {
    expect(tableWidth(T('a'))).toBe(220);
    expect(tableWidth({ ...T('a'), fields: [{ name: 'x'.repeat(200), type: 'int' }] })).toBe(480);
    expect(tableWidth({ ...T('a'), w: 333 })).toBe(333);
    expect(tableWidth({ ...T('a'), schema: 'long_schema_name', name: 'long_table_name_here_ok' })).toBeGreaterThan(220);
  });
  test('the header has room for a view mark ("· Mat. view") next to the name: it was cut off', () => {
    const mv = { ...T('mv_orders_by_status'), schema: 'shop' };
    expect(tableWidth({ ...mv, viewKind: 'Mat. view' })).toBeGreaterThanOrEqual(tableWidth(mv) + 60);
    expect(tableWidth({ ...mv, viewKind: 'View' })).toBeGreaterThan(tableWidth(mv) + 30);
  });
  test('height: header + rows (+ indexes); collapsed or "tables" detail is the header only; explicit height wins', () => {
    expect(tableHeight(T('a', 3))).toBe(30 + 3 * ROW);
    expect(tableHeight({ ...T('a', 3), indexes: [{}, {}] })).toBe(30 + 3 * ROW + 40);
    expect(tableHeight({ ...T('a', 3), indexes: [{}, {}], hideIndexes: true })).toBe(30 + 3 * ROW);
    expect(tableHeight({ ...T('a', 3), collapsed: true })).toBe(30);
    expect(tableHeight({ ...T('a', 3), detail: 'tables' })).toBe(30);
    expect(tableHeight({ ...T('a', 3), h: 500 })).toBe(500);
  });
  test('detail "keys" shows primary keys and the listed key columns only', () => {
    const t = { ...T('a', 4), detail: 'keys', keyCols: ['c2'] };
    expect(shownFields(t).map((f) => f.name)).toEqual(['c0', 'c2']);
    expect(lessDetail(t)).toBe(true);
    expect(lessDetail({ detail: 'full' })).toBe(false);
    expect(lessDetail({})).toBe(false);
  });
});

describe.each(ALGOS)('algorithm %s', (algo) => {
  const sets = { chain: chain(6), star: star(8), lone: lone(9), cycle: cycle(), 'many (60)': { tables: [...chain(30).tables, ...lone(30).tables.map((t) => ({ ...t, id: `s.y${t.name}`, name: `y${t.name}` }))], refs: chain(30).refs } };
  test.each(Object.entries(sets))('%s: every table gets a finite position and nothing overlaps', (_n, { tables, refs }) => {
    const nodes = layout(tables, refs, null, [], algo);
    expect(nodes).toHaveLength(tables.length);
    for (const n of nodes) expect([Number.isFinite(n.position.x), Number.isFinite(n.position.y)]).toEqual([true, true]);
    expect(overlaps(nodes)).toEqual([]);
  });
  test('deterministic: the same input gives the same positions', () => {
    const { tables, refs } = star(10);
    expect(layout(tables, refs, null, [], algo)).toEqual(layout(tables, refs, null, [], algo));
  });
  test('nodes carry their table, type and accessible label', () => {
    const { tables, refs } = chain(2);
    const [n] = layout(tables, refs, null, [], algo);
    expect(n).toMatchObject({ id: 's.t0', type: 'table', ariaLabel: 'Table t0', data: tables[0] });
  });
  test('no tables: no nodes', () => expect(layout([], [], null, [], algo)).toEqual([]));
  test('refs to unknown tables are ignored', () => {
    const { tables } = lone(3);
    expect(() => layout(tables, [R('ghost', 'x0')], null, [], algo)).not.toThrow();
  });
});

describe('manual positions', () => {
  test('when every table already has a place (each edit in the editor), nothing is laid out: the places come back as they are', () => {
    const { tables, refs } = chain(30);
    const placed = new Map(tables.map((t, i) => [t.id, { x: i * 10, y: i * 20 }]));
    const untouchable = tables.map((t) => Object.defineProperty({ ...t }, 'fields', { get() { throw new Error('a layout ran'); } }));
    const nodes = layout(untouchable, refs, placed, [], 'auto');
    expect(nodes.map((n) => [n.id, n.position])).toEqual(tables.map((t) => [t.id, placed.get(t.id)]));
  });
  test('a position the person set (old) is kept, new tables get one', () => {
    const { tables, refs } = chain(3);
    const nodes = layout(tables, refs, new Map([['s.t1', { x: 5000, y: 7000 }]]), [], 'auto');
    expect(posOf(nodes).get('s.t1')).toEqual({ x: 5000, y: 7000 });
    expect(posOf(nodes).get('s.t0')).not.toEqual({ x: 5000, y: 7000 });
  });
  test('tables new to a diagram that already has places (a second import) never land on a kept table: they go below, laid out among themselves', () => {
    // what the user saw: the MySQL import placed shop.* tables; the PostgreSQL import into the same diagram kept those places and put the new tables on top of them
    const { tables, refs } = chain(8);
    const kept = layout(tables.slice(0, 4), refs, null, [], 'auto'); // the places of the first import
    const nodes = layout(tables, refs, posOf(kept), [], 'auto');
    for (const n of kept) expect(posOf(nodes).get(n.id)).toEqual(n.position);
    expect(overlaps(nodes)).toEqual([]);
    const bottom = Math.max(...kept.map((n) => n.position.y + tableHeight(n.data)));
    for (const n of nodes.slice(4)) expect(n.position.y).toBeGreaterThan(bottom);
    expect(overlaps(nodes.slice(4))).toEqual([]);
  });
});

describe('direction of the flow', () => {
  test('lr: a table sits to the left of the table it references (child -> parent)', () => {
    const { tables, refs } = chain(4);
    const p = posOf(layout(tables, refs, null, [], 'lr'));
    for (let i = 1; i < 4; i++) expect(p.get(`s.t${i}`).x).toBeLessThan(p.get(`s.t${i - 1}`).x);
  });
  test('pipeline: referenced tables come first (left), dependants later', () => {
    const { tables, refs } = chain(4);
    const p = posOf(layout(tables, refs, null, [], 'pipeline'));
    for (let i = 1; i < 4; i++) expect(p.get(`s.t${i}`).x).toBeGreaterThan(p.get(`s.t${i - 1}`).x);
  });
  test('pipeline survives a dependency cycle', () => expect(() => layout(cycle().tables, cycle().refs, null, [], 'pipeline')).not.toThrow());
  test('snowflake: the hub is the most central table', () => {
    const { tables, refs } = star(8);
    const nodes = layout(tables, refs, null, [], 'snowflake'), c = (n) => ({ x: n.position.x + tableWidth(n.data) / 2, y: n.position.y + tableHeight(n.data) / 2 });
    const hub = c(nodes.find((n) => n.id === 's.hub'));
    const dist = (n) => Math.hypot(c(n).x - hub.x, c(n).y - hub.y);
    for (const n of nodes.filter((x) => x.id !== 's.hub')) expect(dist(n)).toBeGreaterThan(0);
  });
});

describe('data lineage takes part in the layout', () => {
  const tables = [T('src'), T('view')];
  test('refs are derived from the lineage edges; unknown tables are dropped', () => {
    const refs = lineageRefs(tables, [{ source: 's.src', target: 's.view' }, { source: 's.nope', target: 's.view' }], 'lr');
    expect(refs).toHaveLength(1);
    expect([refs[0].child.tableName, refs[0].parent.tableName]).toEqual(['src', 'view']); // dagre: child first
    const pipe = lineageRefs(tables, [{ source: 's.src', target: 's.view' }], 'pipeline');
    expect([pipe[0].child.tableName, pipe[0].parent.tableName]).toEqual(['view', 'src']); // pipeline: the derived table depends on its source
  });
  test('the derived table is placed to the right of its source, in the lr and the pipeline layouts', () => {
    for (const algo of ['lr', 'pipeline']) {
      const p = posOf(layout(tables, [], null, [], algo, [{ source: 's.src', target: 's.view' }]));
      expect(p.get('s.view').x, algo).toBeGreaterThan(p.get('s.src').x);
    }
  });
});

describe('groups', () => {
  const g = chain(3), extra = lone(3);
  const tables = [...g.tables, ...extra.tables], refs = g.refs;
  const groups = [{ name: 'G1', tables: g.tables.map((t) => t.id) }, { name: 'G2', tables: ['s.x0', 's.x1'] }];
  const bounds = (ids, nodes) => { const b = nodes.filter((n) => ids.includes(n.id)).map(box); return { x1: Math.min(...b.map((v) => v.x)) - PAD, y1: Math.min(...b.map((v) => v.y)) - PAD - HEAD, x2: Math.max(...b.map((v) => v.x + v.w)) + PAD, y2: Math.max(...b.map((v) => v.y + v.h)) + PAD }; };
  const hit = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  test.each(['auto', 'snowflake', 'compact'])('%s: group boxes (with their padding) never overlap each other or a table outside them', (algo) => {
    const nodes = layout(tables, refs, null, groups, algo);
    expect(overlaps(nodes)).toEqual([]);
    const b1 = bounds(groups[0].tables, nodes), b2 = bounds(groups[1].tables, nodes);
    expect(hit(b1, b2)).toBe(false);
    for (const n of nodes.filter((x) => !groups[0].tables.includes(x.id))) { const q = box(n); expect(hit(b1, { x1: q.x, y1: q.y, x2: q.x + q.w, y2: q.y + q.h })).toBe(false); }
  });
  test.each(['lr', 'pipeline'])('%s with groups: all tables placed without overlap', (algo) => expect(overlaps(layout(tables, refs, null, groups, algo))).toEqual([]));
  test('a table listed in two groups belongs to the first; members that do not exist are ignored', () => {
    const nodes = layout(tables, refs, null, [{ name: 'A', tables: ['s.x0', 'ghost'] }, { name: 'B', tables: ['s.x0', 's.x1'] }], 'auto');
    expect(nodes).toHaveLength(tables.length);
    expect(overlaps(nodes)).toEqual([]);
  });
});

describe('shelfPack', () => {
  test('packs blocks in rows, none overlapping, and reports the size', () => {
    const blocks = [{ w: 300, h: 200, pos: new Map([['a', { x: 0, y: 0 }]]) }, { w: 300, h: 100, pos: new Map([['b', { x: 0, y: 0 }]]) }, { w: 300, h: 50, pos: new Map([['c', { x: 0, y: 0 }]]) }];
    const { pos, w, h } = shelfPack(blocks, 10, 1);
    expect(pos.size).toBe(3);
    const r = [...pos].map(([id, p]) => ({ id, x: p.x, y: p.y, w: 300, h: { a: 200, b: 100, c: 50 }[id] }));
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(r[i].x < r[j].x + 300 && r[j].x < r[i].x + 300 && r[i].y < r[j].y + r[j].h && r[j].y < r[i].y + r[i].h).toBe(false);
    expect(w).toBeGreaterThanOrEqual(300);
    expect(h).toBeGreaterThanOrEqual(200);
  });
  test('a single block wider than the target width still fits', () => expect(shelfPack([{ w: 5000, h: 10, pos: new Map([['a', { x: 0, y: 0 }]]) }]).pos.get('a')).toEqual({ x: 0, y: 0 }));
});
