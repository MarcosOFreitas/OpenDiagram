// Layout of the diagram: table sizes and the positions of every algorithm (pure: tables and refs in, positions out)
import dagre from '@dagrejs/dagre';
import { cid, pid } from './diagramModel.js';

export const PAD = 22, HEAD = 18; // a TableGroup box: padding around its tables + the title strip above them (layout and drawn box must agree)
export const ROW = 22;
// default width from the content: the longest column name always fits, the type gets what is left (min 220, max 480); the header
// fits the name, a view mark (" · Mat. view", smaller type) and the schema
export const tableWidth = (t) => {
  const head = t.name.length * 7.5 + (t.viewKind ? (t.viewKind.length + 3) * 6 : 0) + (t.schema !== 'public' ? t.schema.length * 5.5 + 12 : 0) + 44;
  const rows = t.fields.map((f) => f.name.length * 7 + Math.min(String(f.type || '').length, 24) * 6 + 74);
  return t.w || Math.max(220, Math.min(480, Math.round(Math.max(head, ...rows))));
};
// detail level: full (all) | names (no types/indexes) | keys (only primary/foreign key columns) | tables (header only)
export const shownFields = (t) => (t.detail === 'keys' ? t.fields.filter((f) => f.pk || (t.keyCols || []).includes(f.name)) : t.fields);
export const lessDetail = (t) => !!t.detail && t.detail !== 'full';
export const tableHeight = (t) => (t.collapsed || t.detail === 'tables' ? 30 : t.h || 30 + shownFields(t).length * ROW + (t.hideIndexes || lessDetail(t) ? 0 : t.indexes.length * 20));

// dagre on a set of tables -> Map id -> top-left position
export function dagrePositions(tables, refs, groups = [], rankdir = 'LR') {
  const g = new dagre.graphlib.Graph({ compound: true }).setGraph({ rankdir, nodesep: 36, ranksep: 90 }).setDefaultEdgeLabel(() => ({}));
  tables.forEach((t) => g.setNode(t.id, { width: tableWidth(t), height: tableHeight(t) }));
  const grouped = new Set();
  groups.forEach((gr) => {
    g.setNode(`g:${gr.name}`, {});
    gr.tables.forEach((id) => { if (g.hasNode(id) && !grouped.has(id)) { g.setParent(id, `g:${gr.name}`); grouped.add(id); } });
  });
  refs.forEach((r) => {
    const a = cid(r), b = pid(r);
    if (g.hasNode(a) && g.hasNode(b)) g.setEdge(a, b);
  });
  dagre.layout(g);
  return new Map(tables.map((t) => { const p = g.node(t.id); return [t.id, { x: p.x - tableWidth(t) / 2, y: p.y - tableHeight(t) / 2 }]; }));
}

// Many tables: dagre alone puts every table without relationships in one huge column. Lay out each connected
// component on its own (dagre), tables without relationships in a grid, then pack the blocks in rows (~wide screen).
// Snowflake: the most connected table in the center, its neighbours in rings (breadth-first levels) around it
export function snowflakeBlock(ts, cr) {
  const byId = new Map(ts.map((t) => [t.id, t])), adj = new Map(ts.map((t) => [t.id, new Set()]));
  cr.forEach((r) => { const a = cid(r), b = pid(r); if (a !== b && adj.has(a) && adj.has(b)) { adj.get(a).add(b); adj.get(b).add(a); } });
  const center = [...ts].sort((a, b) => adj.get(b.id).size - adj.get(a.id).size || a.id.localeCompare(b.id))[0];
  const level = new Map([[center.id, 0]]), parentOf = new Map(), rings = [[center]];
  let frontier = [center.id];
  while (frontier.length) {
    const next = [];
    for (const id of frontier) for (const n of [...adj.get(id)].sort()) if (!level.has(n)) { level.set(n, level.get(id) + 1); parentOf.set(n, id); next.push(n); }
    if (next.length) rings.push(next.map((i) => byId.get(i)));
    frontier = next;
  }
  const rad = (t) => Math.hypot(tableWidth(t), tableHeight(t)) / 2; // circle around a table
  const centers = new Map([[center.id, { x: 0, y: 0, a: 0 }]]);
  let prevR = 0, prevHalf = rad(center);
  for (let k = 1; k < rings.length; k++) {
    const ring = [...rings[k]].sort((a, b) => (centers.get(parentOf.get(a.id))?.a ?? 0) - (centers.get(parentOf.get(b.id))?.a ?? 0) || a.id.localeCompare(b.id)); // children next to their parent
    const half = Math.max(...ring.map(rad));
    const R = Math.max(ring.reduce((sum, t) => sum + 2 * rad(t) + 50, 0) / (2 * Math.PI), prevR + prevHalf + half + 70);
    ring.forEach((t, i) => { const a = (i / ring.length) * 2 * Math.PI - Math.PI / 2; centers.set(t.id, { x: R * Math.cos(a), y: R * Math.sin(a), a }); });
    prevR = R; prevHalf = half;
  }
  const raw = ts.map((t) => { const c = centers.get(t.id); return [t.id, { x: c.x - tableWidth(t) / 2, y: c.y - tableHeight(t) / 2 }, t]; });
  const minX = Math.min(...raw.map(([, p]) => p.x)), minY = Math.min(...raw.map(([, p]) => p.y));
  const pos = new Map(raw.map(([id, p]) => [id, { x: p.x - minX, y: p.y - minY }]));
  return { pos, w: Math.max(...raw.map(([, p, t]) => p.x - minX + tableWidth(t))), h: Math.max(...raw.map(([, p, t]) => p.y - minY + tableHeight(t))) };
}

// Pipeline: stages left to right by dependency (referenced tables first). With TableGroups every group is a stage (its box included);
// without groups the stages are the dependency ranks. Tables are stacked vertically, wrapping into sub-columns when a stage gets too tall.
export function pipelinePositions(tables, refs, groups) {
  const MAXH = 2600;
  const byId = new Map(tables.map((t) => [t.id, t]));
  const edges = refs.map((r) => [cid(r), pid(r)]).filter(([a, b]) => a !== b && byId.has(a) && byId.has(b));
  const rankOf = (ids, deps) => { // longest dependency chain; cycles are cut where they are first met
    const memo = new Map(), seen = new Set();
    const rank = (id) => {
      if (memo.has(id)) return memo.get(id);
      if (seen.has(id)) return 0;
      seen.add(id);
      let r = 0;
      for (const d of deps.get(id) || []) r = Math.max(r, rank(d) + 1);
      seen.delete(id); memo.set(id, r);
      return r;
    };
    ids.forEach(rank);
    return memo;
  };
  const used = new Set(), units = [];
  if (groups.length) {
    for (const gr of groups) { const ts = gr.tables.filter((id) => byId.has(id) && !used.has(id)).map((id) => { used.add(id); return byId.get(id); }); if (ts.length) units.push({ ts, box: true }); }
    const rest = tables.filter((t) => !used.has(t.id));
    if (rest.length) units.push({ ts: rest, box: false });
  } else {
    const deps = new Map(); edges.forEach(([a, b]) => { if (!deps.has(a)) deps.set(a, new Set()); deps.get(a).add(b); });
    const rk = rankOf(tables.map((t) => t.id), deps), cols = new Map();
    tables.forEach((t) => { const r = rk.get(t.id) || 0; if (!cols.has(r)) cols.set(r, []); cols.get(r).push(t); });
    [...cols.keys()].sort((a, b) => a - b).forEach((r) => units.push({ ts: cols.get(r), box: false }));
  }
  if (groups.length) { // order the stages by the dependencies between units
    const of = new Map(); units.forEach((u, i) => u.ts.forEach((t) => of.set(t.id, i)));
    const deps = new Map(); edges.forEach(([a, b]) => { const x = of.get(a), y = of.get(b); if (x !== y) { if (!deps.has(x)) deps.set(x, new Set()); deps.get(x).add(y); } });
    const rk = rankOf(units.map((_, i) => i), deps);
    units.forEach((u, i) => { u.rank = rk.get(i) || 0; u.i = i; });
    units.sort((a, b) => a.rank - b.rank || (a.box === b.box ? a.i - b.i : a.box ? -1 : 1));
  }
  const out = new Map(); let x = 0;
  for (const u of units) {
    const sorted = [...u.ts].sort((a, b) => a.id.localeCompare(b.id)), pad = u.box ? PAD : 0, top = u.box ? PAD + HEAD : 0;
    const colW = Math.max(...sorted.map(tableWidth)), subs = [[]], hs = [0];
    sorted.forEach((t) => { const h = tableHeight(t) + 36; if (hs[hs.length - 1] + h > MAXH && subs[subs.length - 1].length) { subs.push([]); hs.push(0); } subs[subs.length - 1].push([t, hs[hs.length - 1]]); hs[hs.length - 1] += h; });
    subs.forEach((col, ci) => col.forEach(([t, y]) => out.set(t.id, { x: x + pad + ci * (colW + 36), y: top + y })));
    x += subs.length * (colW + 36) - 36 + pad * 2 + 110;
  }
  return out;
}

// blocks of a set of tables: one per connected component (own dagre run) plus one grid for the tables without relationships
export function blocksOf(tables, refs, mode = 'auto') { // mode: auto (dagre per component) | snowflake | compact (everything in the balanced columns)
  const parent = new Map(tables.map((t) => [t.id, t.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const ends = refs.map((r) => [cid(r), pid(r)]).filter(([a, b]) => parent.has(a) && parent.has(b));
  ends.forEach(([a, b]) => parent.set(find(a), find(b)));
  const comps = new Map();
  tables.forEach((t) => { const r = find(t.id); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(t); });
  const blocks = [], loose = [];
  for (const ts of comps.values()) {
    if (mode === 'compact' || ts.length === 1) { loose.push(...ts); continue; }
    const ids = new Set(ts.map((t) => t.id));
    const cr = refs.filter((r) => ids.has(cid(r)) && ids.has(pid(r)));
    if (mode === 'snowflake' && ts.length > 2) { blocks.push(snowflakeBlock(ts, cr)); continue; }
    const size = (pos) => ({ pos, w: Math.max(...ts.map((t) => pos.get(t.id).x + tableWidth(t))), h: Math.max(...ts.map((t) => pos.get(t.id).y + tableHeight(t))) });
    let best = size(dagrePositions(ts, cr));
    if (ts.length > 12) { // big component: left-to-right or top-to-bottom, whichever is closer to a wide screen
      const alt = size(dagrePositions(ts, cr, [], 'TB')), off = (b) => Math.abs(Math.log(b.w / b.h / 1.6));
      if (off(alt) < off(best)) best = alt;
    }
    blocks.push(best);
  }
  if (loose.length) { // balanced columns, in name order: each table goes to the shortest column, tall tables do not stretch a whole row
    const colW = Math.max(...loose.map(tableWidth)) + 36;
    const avgH = loose.reduce((s, t) => s + tableHeight(t), 0) / loose.length;
    const cols = Math.max(1, Math.min(loose.length, Math.ceil(Math.sqrt(loose.length * 1.6 * avgH / colW))));
    const pos = new Map(), colH = Array(cols).fill(0);
    loose.sort((a, b) => a.id.localeCompare(b.id)).forEach((t) => {
      const c = colH.indexOf(Math.min(...colH));
      pos.set(t.id, { x: c * colW, y: colH[c] }); colH[c] += tableHeight(t) + 36;
    });
    blocks.push({ w: cols * colW - 36, h: Math.max(...colH) - 36, pos });
  }
  return blocks;
}

// pack blocks in rows (~wide screen): -> { pos: Map id -> {x, y}, w, h }
export function shelfPack(blocks, gap = 60, aspect = 1.8) {
  const area = blocks.reduce((s, b) => s + (b.w + gap) * (b.h + gap), 0);
  const maxW = Math.max(Math.sqrt(area) * aspect, ...blocks.map((b) => b.w));
  const pos = new Map(); let x = 0, y = 0, rowH = 0, w = 0;
  [...blocks].sort((a, b) => b.h - a.h).forEach((b) => {
    if (x && x + b.w > maxW) { y += rowH + gap; x = 0; rowH = 0; }
    b.pos.forEach((p, id) => pos.set(id, { x: x + p.x, y: y + p.y }));
    x += b.w + gap; rowH = Math.max(rowH, b.h); w = Math.max(w, x - gap);
  });
  return { pos, w, h: y + rowH };
}

// Groups: every TableGroup is laid out on its own and becomes one block with room for its box (22px padding + 18px title),
// so boxes never overlap; ungrouped tables are blocks as usual; then all blocks are packed together.
export function groupedPositions(tables, refs, groups, mode = 'auto') {
  const byId = new Map(tables.map((t) => [t.id, t])), used = new Set(), blocks = [];
  for (const gr of groups) {
    const ts = gr.tables.filter((id) => byId.has(id) && !used.has(id)).map((id) => { used.add(id); return byId.get(id); });
    if (!ts.length) continue;
    const inner = shelfPack(blocksOf(ts, refs, mode), 36, 1.4);
    const pos = new Map([...inner.pos].map(([id, p]) => [id, { x: p.x + PAD, y: p.y + PAD + HEAD }]));
    blocks.push({ pos, w: inner.w + PAD * 2, h: inner.h + PAD * 2 + HEAD });
  }
  blocks.push(...blocksOf(tables.filter((t) => !used.has(t.id)), refs, mode));
  return shelfPack(blocks, 70).pos;
}

// data lineage as extra edges for the layout, in the shape of refs: the flow runs source -> derived table, so a derived table sits to the right of what it is built from
// (dagre puts `child` before `parent`; the pipeline ranks a table after what it depends on, so there the derived table is the child)
export function lineageRefs(tables, lineage, algo) {
  const byId = new Map(tables.map((t) => [t.id, t]));
  return lineage.filter((l) => byId.has(l.source) && byId.has(l.target)).map((l) => {
    const s = byId.get(l.source), t = byId.get(l.target), [c, p] = algo === 'pipeline' ? [t, s] : [s, t];
    return { child: { schemaName: c.schema, tableName: c.name, fieldNames: [] }, parent: { schemaName: p.schema, tableName: p.name, fieldNames: [] } };
  });
}

// algo: auto | lr (plain dagre, groups as clusters) | pipeline | snowflake | compact. lineage: edges of the data lineage that take part in the layout (empty when it is switched off)
export function layout(tables, refs, old, groups = [], algo = 'auto', lineage = []) {
  const kept = old ? tables.filter((t) => old.get(t.id)) : [];
  if (kept.length && kept.length < tables.length) { // tables new to a diagram that has places (a second import, a table typed in): laid out among themselves, below the kept ones, never on top of them
    const fresh = layout(tables.filter((t) => !old.get(t.id)), refs, null, groups, algo, lineage);
    const x0 = Math.min(...kept.map((t) => old.get(t.id).x)), y0 = Math.max(...kept.map((t) => old.get(t.id).y + tableHeight(t))) + 80;
    const fx = Math.min(...fresh.map((n) => n.position.x)), fy = Math.min(...fresh.map((n) => n.position.y));
    const at = new Map(fresh.map((n) => [n.id, { x: n.position.x - fx + x0, y: n.position.y - fy + y0 }]));
    return tables.map((t) => ({ id: t.id, type: 'table', ariaLabel: `Table ${t.name}`, position: old.get(t.id) || at.get(t.id), data: t }));
  }
  if (lineage.length) refs = [...refs, ...lineageRefs(tables, lineage, algo)];
  let pos;
  if (algo === 'lr') pos = dagrePositions(tables, refs, groups);
  else if (algo === 'pipeline') pos = pipelinePositions(tables, refs, groups);
  else if (groups.length) pos = groupedPositions(tables, refs, groups, algo); // one block per group
  else if (algo === 'auto' && tables.length < 25) pos = dagrePositions(tables, refs);
  else pos = shelfPack(blocksOf(tables, refs, algo)).pos;
  return tables.map((t) => ({ id: t.id, type: 'table', ariaLabel: `Table ${t.name}`, position: old?.get(t.id) || pos.get(t.id), data: t }));
}
