import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, NodeResizer, Background, MiniMap, Handle, Position, useNodesState, useEdgesState, useReactFlow, useViewport, getNodesBounds, getViewportForBounds } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { Parser, exporter, importer } from '@dbml/core';
import { toPng, toSvg } from 'html-to-image';
import Editor from './Editor.jsx';
import Docs from './Docs.jsx';
import { DocsView, standaloneHtml } from './DocsPage.jsx';
import { buildModel, toMarkdown } from './docsModel.js';

import { api, store, errMsg, ago, sharePassword } from './api.js';
import AuthScreen, { PasswordForm } from './Auth.jsx';
import Admin from './Admin.jsx';
import Menu from './Menu.jsx';
import Library from './Library.jsx';
import SharePanel from './SharePanel.jsx';
import TablePicker, { matcher } from './TablePicker.jsx';
import TablesPanel from './TablesPanel.jsx';
import { BLANK, TEMPLATES } from './templates.js';

const tid = (schema, name) => `${schema || 'public'}.${name}`;

// DBML text -> {tables, refs, groups} for the diagram
function parse(text) {
  try {
    const db = new Parser().parse(text, 'dbmlv2');
    const tables = db.schemas.flatMap((s) => s.tables).map((t) => ({
      id: tid(t.schema.name, t.name), schema: t.schema.name, name: t.name, note: t.note, headerColor: t.headerColor,
      fields: t.fields.map((f) => ({ name: f.name, type: f.type.type_name, pk: f.pk, notNull: f.not_null, unique: f.unique, note: f.note })),
      indexes: t.indexes.map((i) => ({ name: i.name, unique: i.unique, pk: i.pk, cols: i.columns.map((c) => c.value) })),
    }));
    const refs = db.schemas.flatMap((s) => s.refs).map((r) => {
      const [a, b] = r.endpoints;
      const [child, parent] = a.relation === '*' || b.relation === '1' ? [a, b] : [b, a];
      return { name: r.name || '', id: r.name || `${tid(child.schemaName, child.tableName)}.${child.fieldNames}->${tid(parent.schemaName, parent.tableName)}`, child, parent };
    });
    const groups = db.schemas.flatMap((s) => s.tableGroups || []).map((g) => ({ name: g.name, color: g.color, tables: g.tables.map((t) => tid(t.schema?.name ?? t.schemaName, t.name)) }));
    return { tables, refs, groups, db };
  } catch (e) {
    return { error: errMsg(e), diags: e?.diags?.map((d) => ({ line: d.location?.start?.line ?? 1, col: d.location?.start?.column ?? 1, endLine: d.location?.end?.line, endCol: d.location?.end?.column, message: d.message ?? 'syntax error' })) ?? [] };
  }
}

const ROW = 22;
// default width from the content: the longest column name always fits, the type gets what is left (min 220, max 480)
const tableWidth = (t) => {
  const head = t.name.length * 7.5 + (t.schema !== 'public' ? t.schema.length * 5.5 + 12 : 0) + 44;
  const rows = t.fields.map((f) => f.name.length * 7 + Math.min(String(f.type || '').length, 24) * 6 + 74);
  return t.w || Math.max(220, Math.min(480, Math.round(Math.max(head, ...rows))));
};
const tableHeight = (t) => (t.collapsed ? 30 : t.h || 30 + t.fields.length * ROW + t.indexes.length * 20);

function TableNode({ data: t, selected }) {
  const fk = new Set(t.fkCols);
  const natural = 32 + t.fields.length * ROW + (t.hideIndexes ? 0 : t.indexes.length * 20); // height without a manual size
  const onResize = (_, p) => t.onSize(t.id, { w: Math.round(p.width), h: t.h || Math.abs(p.height - natural) > 4 ? Math.round(p.height) : undefined }); // a width-only drag keeps the height automatic
  return (
    <>
    <NodeResizer isVisible={!!selected && !t.collapsed} minWidth={160} maxWidth={900} minHeight={80} onResize={onResize} />
    <div className={`tbl ${t.dim ? 'dim' : ''} ${t.active ? 'active' : ''} ${t.h && !t.collapsed ? 'fixed' : ''}`} style={{ width: t.w || tableWidth(t), ...(t.h && !t.collapsed ? { height: t.h } : {}) }} title={t.note || ''}>
      <div className="tbl-h" style={t.headerColor ? { background: t.headerColor } : undefined} onDoubleClick={() => t.onToggle(t.id)}>
        <button className="tbl-t nodrag" title={t.collapsed ? 'Expand' : 'Collapse'} onClick={(e) => { e.stopPropagation(); t.onToggle(t.id); }}>{t.collapsed ? '▸' : '▾'}</button>
        <span className="tbl-n">{t.name}</span>{t.schema !== 'public' && <small>{t.schema}</small>}
        {t.collapsed && t.fields.map((f) => ( // a collapsed table keeps its relationship lines: connect them to the header
          <span key={f.name} style={{ display: 'contents' }}>
            <Handle type="target" position={Position.Left} id={`t:${f.name}`} className="hdl" />
            <Handle type="source" position={Position.Right} id={`s:${f.name}`} className="hdl" />
            <Handle type="source" position={Position.Left} id={`sl:${f.name}`} className="hdl" />
            <Handle type="target" position={Position.Right} id={`tr:${f.name}`} className="hdl" />
          </span>
        ))}
      </div>
      {!t.collapsed && <div className="tbl-body">
      {t.fields.map((f) => (
        <div key={f.name} className="tbl-c" title={`${f.name}: ${f.type}${f.note ? ` — ${f.note}` : ''}`}>
          <Handle type="target" position={Position.Left} id={`t:${f.name}`} className="hdl" />
          <span className="nm">
            {f.pk ? <i className="ic pk" title="primary key">🔑</i> : fk.has(f.name) ? <i className="ic fk" title="foreign key">⛓</i> : <i className="ic" />}
            <span className="nmt">{f.name}</span>{f.note && <i className="ic note" title={f.note}>✎</i>}
          </span>
          <span className="ty"><span className="tyt">{!t.hideTypes && f.type}</span>{(f.notNull || f.pk) && <b className="nn">NN</b>}</span>
          <Handle type="source" position={Position.Right} id={`s:${f.name}`} className="hdl" />
          <Handle type="source" position={Position.Left} id={`sl:${f.name}`} className="hdl" />
          <Handle type="target" position={Position.Right} id={`tr:${f.name}`} className="hdl" />
        </div>
      ))}
      {!t.hideIndexes && t.indexes.map((i, n) => <div key={n} className="tbl-i">{i.pk ? 'PK' : i.unique ? 'UQ' : 'IX'} ({i.cols.join(', ')}){i.name ? ` · ${i.name}` : ''}</div>)}
      </div>}
    </div>
    </>
  );
}

function GroupNode({ data: g }) {
  const c = g.color || '#6b7280';
  return (
    <div style={{ width: g.w, height: g.h, border: `1.5px dashed ${c}`, background: `${c}12`, borderRadius: 10, pointerEvents: 'none' }}>
      <div style={{ color: c, fontWeight: 700, fontSize: 12, padding: '4px 10px' }}>{g.name}</div>
    </div>
  );
}
const nodeTypes = { table: TableNode, grp: GroupNode };

// dagre on a set of tables -> Map id -> top-left position
function dagrePositions(tables, refs, groups = [], rankdir = 'LR') {
  const g = new dagre.graphlib.Graph({ compound: true }).setGraph({ rankdir, nodesep: 36, ranksep: 90 }).setDefaultEdgeLabel(() => ({}));
  tables.forEach((t) => g.setNode(t.id, { width: tableWidth(t), height: tableHeight(t) }));
  const grouped = new Set();
  groups.forEach((gr) => {
    g.setNode(`g:${gr.name}`, {});
    gr.tables.forEach((id) => { if (g.hasNode(id) && !grouped.has(id)) { g.setParent(id, `g:${gr.name}`); grouped.add(id); } });
  });
  refs.forEach((r) => {
    const a = tid(r.child.schemaName, r.child.tableName), b = tid(r.parent.schemaName, r.parent.tableName);
    if (g.hasNode(a) && g.hasNode(b)) g.setEdge(a, b);
  });
  dagre.layout(g);
  return new Map(tables.map((t) => { const p = g.node(t.id); return [t.id, { x: p.x - tableWidth(t) / 2, y: p.y - tableHeight(t) / 2 }]; }));
}

// Many tables: dagre alone puts every table without relationships in one huge column. Lay out each connected
// component on its own (dagre), tables without relationships in a grid, then pack the blocks in rows (~wide screen).
// Snowflake: the most connected table in the center, its neighbours in rings (breadth-first levels) around it
function snowflakeBlock(ts, cr) {
  const byId = new Map(ts.map((t) => [t.id, t])), adj = new Map(ts.map((t) => [t.id, new Set()]));
  cr.forEach((r) => { const a = tid(r.child.schemaName, r.child.tableName), b = tid(r.parent.schemaName, r.parent.tableName); if (a !== b && adj.has(a) && adj.has(b)) { adj.get(a).add(b); adj.get(b).add(a); } });
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
function pipelinePositions(tables, refs, groups) {
  const PAD = 22, HEAD = 18, MAXH = 2600;
  const byId = new Map(tables.map((t) => [t.id, t]));
  const edges = refs.map((r) => [tid(r.child.schemaName, r.child.tableName), tid(r.parent.schemaName, r.parent.tableName)]).filter(([a, b]) => a !== b && byId.has(a) && byId.has(b));
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
function blocksOf(tables, refs, mode = 'auto') { // mode: auto (dagre per component) | snowflake | compact (everything in the balanced columns)
  const parent = new Map(tables.map((t) => [t.id, t.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const ends = refs.map((r) => [tid(r.child.schemaName, r.child.tableName), tid(r.parent.schemaName, r.parent.tableName)]).filter(([a, b]) => parent.has(a) && parent.has(b));
  ends.forEach(([a, b]) => parent.set(find(a), find(b)));
  const comps = new Map();
  tables.forEach((t) => { const r = find(t.id); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(t); });
  const blocks = [], loose = [];
  for (const ts of comps.values()) {
    if (mode === 'compact' || ts.length === 1) { loose.push(...ts); continue; }
    const ids = new Set(ts.map((t) => t.id));
    const cr = refs.filter((r) => ids.has(tid(r.child.schemaName, r.child.tableName)) && ids.has(tid(r.parent.schemaName, r.parent.tableName)));
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
function shelfPack(blocks, gap = 60, aspect = 1.8) {
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
function groupedPositions(tables, refs, groups, mode = 'auto') {
  const byId = new Map(tables.map((t) => [t.id, t])), used = new Set(), PAD = 22, HEAD = 18, blocks = [];
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

// algo: auto | lr (plain dagre, groups as clusters) | pipeline | snowflake | compact
function layout(tables, refs, old, groups = [], algo = 'auto') {
  let pos;
  if (algo === 'lr') pos = dagrePositions(tables, refs, groups);
  else if (algo === 'pipeline') pos = pipelinePositions(tables, refs, groups);
  else if (groups.length) pos = groupedPositions(tables, refs, groups, algo); // one block per group
  else if (algo === 'auto' && tables.length < 25) pos = dagrePositions(tables, refs);
  else pos = shelfPack(blocksOf(tables, refs, algo)).pos;
  return tables.map((t) => ({ id: t.id, type: 'table', position: old?.get(t.id) || pos.get(t.id), data: t }));
}

const ALGOS = [
  { k: 'auto', name: 'Auto', desc: 'Packs each group and each connected cluster on its own. Best default, especially with many tables.' },
  { k: 'lr', name: 'Left to right', desc: 'Layered layout following the relationships. Best for long relationship chains.' },
  { k: 'pipeline', name: 'Pipeline', desc: 'Groups become stages from left to right by dependency, tables stacked vertically.' },
  { k: 'snowflake', name: 'Snowflake', desc: 'The most connected table in the center, related tables in rings around it.' },
  { k: 'compact', name: 'Compact', desc: 'Tables in a compact rectangle, ignoring relationships.' },
];
const EMPTY = { type: 'postgres', host: '', port: 5432, database: '', user: '', password: '', name: '', tls: 'off', caPem: '', clearCa: false, serverDn: '', blockWritable: false, refreshMinutes: 0 };
const REFRESH = [[0, 'Off (manual refresh only)'], [1, 'Every 1 minute'], [5, 'Every 5 minutes'], [15, 'Every 15 minutes'], [30, 'Every 30 minutes'], [60, 'Every hour']];

const qid = (x) => (/^[A-Za-z_]\w*$/.test(x) ? x : `"${x.replaceAll('"', '\\"')}"`);
// a refresh regenerates tables/refs from the database; keep the user's TableGroups (minus tables that no longer exist)
// append TableGroup blocks (members that are not in the diagram are dropped)
function withGroups(newDbml, groups) {
  const n = parse(newDbml);
  if (n.error || !groups?.length) return newDbml;
  const have = new Set(n.tables.map((t) => t.id));
  const blocks = groups.map((g) => ({ ...g, tables: g.tables.filter((id) => have.has(id)) })).filter((g) => g.tables.length).map((g) => {
    const members = g.tables.map((id) => { const [sc, ...rest] = id.split('.'); return `  ${qid(sc)}.${qid(rest.join('.'))}`; });
    return `TableGroup ${qid(g.name)}${g.color ? ` [color: ${g.color}]` : ''} {\n${members.join('\n')}\n}`;
  });
  return blocks.length ? `${newDbml.trimEnd()}\n\n${blocks.join('\n\n')}\n` : newDbml;
}
function keepGroups(oldDbml, newDbml) {
  const o = parse(oldDbml);
  return o.error ? newDbml : withGroups(newDbml, o.groups);
}
function diffSummary(oldDbml, newDbml) {
  const o = parse(oldDbml), n = parse(newDbml);
  if (o.error || n.error) return 'schema changed';
  const sig = (t) => t.fields.map((f) => `${f.name}:${f.type}`).join(',');
  const om = new Map(o.tables.map((t) => [t.id, sig(t)])), nm = new Map(n.tables.map((t) => [t.id, sig(t)]));
  let add = 0, rem = 0, chg = 0;
  for (const [k, v] of nm) { if (!om.has(k)) add++; else if (om.get(k) !== v) chg++; }
  for (const k of om.keys()) if (!nm.has(k)) rem++;
  const parts = [add && `+${add} table(s)`, rem && `−${rem} table(s)`, chg && `${chg} changed`].filter(Boolean);
  return parts.length ? parts.join(', ') : 'indexes/relationships/comments changed';
}
const EXPORTS = [
  ['dbml', 'DBML', '.dbml'], ['postgres', 'PostgreSQL', '.sql'], ['mysql', 'MySQL', '.sql'], ['mssql', 'SQL Server', '.sql'],
  ['oracle', 'Oracle', '.sql'], ['json', 'JSON', '.json'], ['png', 'PNG image', '.png'], ['svg', 'SVG image', '.svg'],
  ['docs-html', 'Documentation', '.html (standalone)'], ['docs-md', 'Documentation', '.md'],
];

function Workspace({ user, groups, org, shareToken, onLogin, onLogout, onUser, onOrg }) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();
  const shared = !!shareToken;
  const [doc, setDoc] = useState(null); // loaded diagram: { id, access, ownerName, isOwner }
  const [loadErr, setLoadErr] = useState('');
  const [needPass, setNeedPass] = useState(null); // protected share link: message shown above the password field
  const [unlockTick, setUnlockTick] = useState(0);
  const [diagrams, setDiagrams] = useState([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [editorW, setEditorW] = useState(() => Math.max(260, Math.min(1100, +store('editorW') || 380)));
  const [resizing, setResizing] = useState(false);
  const [saveState, setSaveState] = useState('saved'); // saved | saving | error
  const [layoutTick, setLayoutTick] = useState(0);
  // per-table width / collapsed state lives in the saved layout under '@sizes' ({ id: { w, c } })
  const setSize = useCallback((patch) => {
    const cur = layoutRef.current['@sizes'] || {}, next = { ...cur };
    for (const [id, v] of Object.entries(patch)) { const o = { ...cur[id], ...v }; if (!o.w) delete o.w; if (!o.h) delete o.h; if (!o.c) delete o.c; if (Object.keys(o).length) next[id] = o; else delete next[id]; }
    layoutRef.current = { ...layoutRef.current, '@sizes': next };
    setLayoutTick((k) => k + 1);
  }, []);
  const onSize = useCallback((id, v) => setSize({ [id]: v }), [setSize]);
  const onToggle = useCallback((id) => setSize({ [id]: { c: !(layoutRef.current['@sizes']?.[id]?.c) } }), [setSize]);
  const layoutRef = useRef({});
  // tables hidden from the canvas live in the saved layout under '@hidden' (a list of ids)
  const hidden = useMemo(() => new Set(layoutRef.current['@hidden'] || []), [layoutTick, doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const setHidden = (ids, hide) => {
    const cur = new Set(layoutRef.current['@hidden'] || []);
    ids.forEach((id) => (hide ? cur.add(id) : cur.delete(id)));
    const next = { ...layoutRef.current };
    if (cur.size) next['@hidden'] = [...cur]; else delete next['@hidden'];
    layoutRef.current = next; setLayoutTick((k) => k + 1);
  };
  const showOnly = (ids) => { const keep = new Set(ids); setHidden(parsed.tables.map((t) => t.id).filter((id) => !keep.has(id)), true); setHidden(ids, false); };
  const savedRef = useRef('');
  const [dbml, setDbml] = useState('');
  const [title, setTitle] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState('');
  const [conns, setConns] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [schemas, setSchemas] = useState([]);
  const [picked, setPicked] = useState([]);
  const [tableSel, setTableSel] = useState([]); // 'schema.table' entries; empty = all tables
  const [tableList, setTableList] = useState(null); // null = not loaded
  const [picker, setPicker] = useState(false); // table picker dialog
  const [tableGroups, setTableGroups] = useState(null); // TableGroups defined in the picker; null = keep the diagram's current ones
  useEffect(() => { setTableGroups(null); }, [doc?.id]); // groups belong to the diagram they were edited for
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [source, setSource] = useState(null);
  const [, setTick] = useState(0);
  const lastGen = useRef('');
  const refreshing = useRef(false);
  const dbmlRef = useRef('');
  const [editorOpen, setEditorOpen] = useState(true);
  const [drawer, setDrawer] = useState(null); // null | 'connect' | 'import' | 'export' | 'view'
  const [search, setSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(() => store('tablesPanel') === '1'); // right-hand Tables panel
  const panelSearch = useRef(null);
  useEffect(() => { store('tablesPanel', panelOpen ? '1' : '0'); }, [panelOpen]);
  const [sqlFmt, setSqlFmt] = useState('postgres');
  const [paste, setPaste] = useState('');
  const [view, setView] = useState(() => { try { return { edgeType: 'default', hiRefs: false, algo: 'auto', hideIndexes: false, hideTypes: false, snap: false, grid: true, theme: 'light', ...JSON.parse(store('view') || '{}') }; } catch { return { edgeType: 'default', hideIndexes: false, hideTypes: false, snap: false, grid: true, theme: 'light' }; } });
  useEffect(() => { store('view', JSON.stringify(view)); }, [view]);
  const canvasBg = view.theme === 'dark' ? '#0e1420' : '#f4f5f7';
  const [activeId, setActiveId] = useState(null);
  const [activeEdge, setActiveEdge] = useState(null); // clicked relationship: focus it and its two tables
  const [drag, setDrag] = useState(false);
  const [mode, setMode] = useState('diagram'); // 'diagram' | 'docs'
  const editorShown = editorOpen && mode !== 'docs'; // the Docs view takes the whole width; the editor comes back with the Diagram view
  const [comments, setComments] = useState([]);
  const toastTimer = useRef(null);
  const idsKey = useRef('');

  const notify = useCallback((type, text) => {
    setToast({ type, text });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), type === 'err' ? 7000 : 3000);
  }, []);
  const loadConns = useCallback(() => (shared ? Promise.resolve() : api('connections').then(setConns).catch((e) => notify('err', e.message))), [notify, shared]);
  useEffect(() => { loadConns(); }, [loadConns]);

  // what the current role may do
  const access = doc?.access; // owner | edit | comment | view
  const owner = !shared && !!doc?.isOwner;
  const manage = !shared && (!!doc?.isOwner || access === 'admin'); // owner, or an administrator on someone else's diagram
  const canEdit = !!doc && (access === 'owner' || access === 'admin' || (access === 'edit' && !!user));
  const canComment = !!doc && !!user && (access === 'owner' || access === 'admin' || access === 'comment' || access === 'edit');
  const readOnly = !canEdit;
  // only the owner saves title and connection link; editors (granted or by link) save DBML + layout
  const payloadOf = (d) => (shared ? { dbml: d.dbml, layout: d.layout ?? {} }
    : d.isOwner ? { title: d.title, dbml: d.dbml, source: d.source ?? null, layout: d.layout ?? {} }
      : d.access === 'admin' ? { title: d.title, dbml: d.dbml, layout: d.layout ?? {} } // administrators never touch the owner's connection link
        : { dbml: d.dbml, layout: d.layout ?? {} });

  const startDoc = useCallback((d, list) => {
    lastGen.current = (d.id && store(`gen:${d.id}`)) || '';
    layoutRef.current = d.layout ?? {};
    idsKey.current = '';
    savedRef.current = JSON.stringify(payloadOf(d));
    setNodes([]); setEdges([]);
    setDoc(d); setDbml(d.dbml); setTitle(d.title); setSource(d.source ?? null); setComments(list ?? []); setSaveState('saved');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const openDiagram = useCallback(async (id) => {
    const [d, list] = await Promise.all([api(`diagrams/${id}`), api(`diagrams/${id}/comments`)]);
    store('lastDiagram', id);
    startDoc({ ...d, access: d.role, isOwner: d.role === 'owner' }, list);
  }, [startDoc]);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        if (shared) {
          const d = await api(`shared/${shareToken}`);
          if (!off) startDoc({ id: null, title: d.title, dbml: d.dbml, layout: d.layout, source: null, access: d.access, ownerName: d.owner, isOwner: d.isOwner }, d.comments);
          return;
        }
        let list = await api('diagrams');
        let id = store('lastDiagram');
        if (!list.some((x) => x.id === id)) id = list[0]?.id;
        if (!id) { // first sign-in: whatever the browser kept from the pre-accounts version, else the sample shop model
          const first = TEMPLATES[0];
          id = (await api('diagrams', store('dbml') ? { title: store('title') || 'Untitled diagram', dbml: store('dbml') } : { title: first.title, dbml: first.dbml })).id;
          list = await api('diagrams');
        }
        if (off) return;
        setDiagrams(list);
        try { await openDiagram(id); } catch (e) { // e.g. access to the last diagram was revoked
          const alt = list.find((x) => x.id !== id);
          if (!alt) throw e;
          await openDiagram(alt.id);
        }
      } catch (e) { if (!off) { if (shared && e.code === 'share_password') setNeedPass(e.message); else setLoadErr(e.message); } }
    })();
    return () => { off = true; };
  }, [shareToken, unlockTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // autosave (owner: everything; edit link: DBML + layout)
  useEffect(() => {
    if (!doc || !canEdit) return undefined;
    const payload = payloadOf({ title, dbml, source, layout: layoutRef.current, isOwner: doc.isOwner, access: doc.access });
    const sig = JSON.stringify(payload);
    if (sig === savedRef.current) return undefined;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        await api(shared ? `shared/${shareToken}` : `diagrams/${doc.id}`, payload, 'PUT');
        savedRef.current = sig; setSaveState('saved');
        if (!shared) setDiagrams((l) => l.map((x) => (x.id === doc.id ? { ...x, title, updatedAt: Math.floor(Date.now() / 1000) } : x)));
      } catch (e) { setSaveState('error'); notify('err', `Not saved: ${errMsg(e)}`); }
    }, 800);
    return () => clearTimeout(t);
  }, [doc, canEdit, title, dbml, source, layoutTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // comments (stored by the app, never in the database); refetched when the Docs view opens so other people's show up
  const cbase = shared ? `shared/${shareToken}` : `diagrams/${doc?.id}`;
  const addComment = async (key, text) => { try { const c = await api(`${cbase}/comments`, { key, text }); setComments((l) => [...l, c]); } catch (e) { notify('err', errMsg(e)); } };
  const deleteComment = async (id) => { try { await api(`${cbase}/comments/${id}`, undefined, 'DELETE'); setComments((l) => l.filter((c) => c.id !== id)); } catch (e) { notify('err', errMsg(e)); } };
  useEffect(() => {
    if (mode !== 'docs' || !doc) return;
    (shared ? api(`shared/${shareToken}`).then((d) => d.comments) : api(`diagrams/${doc.id}/comments`)).then(setComments).catch(() => {});
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const newDiagram = async (templateId) => { try { const t = TEMPLATES.find((x) => x.id === templateId); const { id } = await api('diagrams', t ? { title: t.title, dbml: t.dbml } : { title: 'Untitled diagram', dbml: BLANK }); setDiagrams(await api('diagrams')); await openDiagram(id); } catch (e) { notify('err', errMsg(e)); } };
  const deleteDiagram = async (d) => {
    if (!window.confirm(`Delete "${d.title}"? Its share links and comments are removed too.`)) return;
    try {
      await api(`diagrams/${d.id}`, undefined, 'DELETE');
      const list = await api('diagrams'); setDiagrams(list);
      if (d.id === doc?.id) { if (list[0]) await openDiagram(list[0].id); else await newDiagram(TEMPLATES[0].id); }
    } catch (e) { notify('err', errMsg(e)); }
  };
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawer(null);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPanelOpen(true); setTimeout(() => panelSearch.current?.focus(), 80); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  dbmlRef.current = dbml;
  const parsed = useMemo(() => parse(dbml), [dbml]);
  const lastGood = useRef(null);
  if (!parsed.error) lastGood.current = parsed;
  const docModel = useMemo(() => (mode === 'docs' && lastGood.current?.db ? buildModel(lastGood.current.db) : null), [mode, parsed]); // eslint-disable-line react-hooks/exhaustive-deps
  const editorDiags = useMemo(() => {
    const lines = dbml.split('\n');
    const off = (l, c) => { let o = 0; for (let i = 0; i < Math.min(l - 1, lines.length); i++) o += lines[i].length + 1; return o + Math.max(0, (c || 1) - 1); };
    return (parsed.diags ?? []).map((d) => ({ from: off(d.line, d.col), to: d.endLine ? off(d.endLine, d.endCol) : off(d.line, d.col) + 1, message: d.message }));
  }, [parsed, dbml]);
  const editorInfo = useMemo(() => (lastGood.current ? { tables: lastGood.current.tables.map((t) => ({ name: t.name, columns: t.fields.map((f) => f.name) })) } : null), [parsed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (parsed.error) return setError(parsed.error);
    setError('');
    const fkCols = {};
    parsed.refs.forEach((r) => (fkCols[tid(r.child.schemaName, r.child.tableName)] ||= []).push(...r.child.fieldNames));
    const tables = parsed.tables.map((t) => ({ ...t, fkCols: fkCols[t.id] || [] }));
    setNodes((old) => layout(tables, parsed.refs, new Map([...Object.entries(layoutRef.current), ...old.map((n) => [n.id, n.position])]), parsed.groups));
    setEdges(parsed.refs.map((r) => ({
      id: r.id, source: tid(r.child.schemaName, r.child.tableName), sourceHandle: `s:${r.child.fieldNames[0]}`,
      target: tid(r.parent.schemaName, r.parent.tableName), targetHandle: `t:${r.parent.fieldNames[0]}`,
      label: `${r.child.relation}:${r.parent.relation}`, data: { sf: r.child.fieldNames[0], tf: r.parent.fieldNames[0], name: r.name || '' },
    })));
    const key = parsed.tables.map((t) => t.id).sort().join('|');
    if (key !== idsKey.current) { idsKey.current = key; const fit = () => fitView({ padding: 0.2, maxZoom: 1, duration: 250 }); setTimeout(fit, 80); setTimeout(fit, 600); } // 2nd pass: nodes are not measured yet right after a document switch
  }, [parsed, doc]); // eslint-disable-line react-hooks/exhaustive-deps -- `doc` too: two diagrams with identical DBML must still rebuild the canvas after a switch

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase(), m = matcher(search), groupName = new Map((parsed.groups || []).flatMap((g) => g.tables.map((t) => [t, g.name.toLowerCase()])));
    const hit = (t) => m(`${t.schema}.${t.name}`) || t.fields.some((f) => m(f.name)) || (groupName.get(t.id) || '').includes(q);
    const sz = layoutRef.current['@sizes'] || {};
    const ends = activeEdge ? (() => { const e = edges.find((x) => x.id === activeEdge); return e ? [e.source, e.target] : null; })() : null;
    const visible = nodes.filter((n) => !hidden.has(n.id));
    const tables = visible.map((n) => ({
      ...n,
      data: { ...n.data, w: sz[n.id]?.w, h: sz[n.id]?.h, collapsed: !!sz[n.id]?.c, onSize, onToggle, hideIndexes: view.hideIndexes, hideTypes: view.hideTypes, active: n.id === activeId || !!ends?.includes(n.id), dim: (!!ends && !ends.includes(n.id)) || !!q && !hit(n.data) },
    }));
    const byId = new Map(visible.map((n) => [n.id, n]));
    const boxes = (parsed.groups || []).flatMap((gr) => {
      const m = gr.tables.map((id) => byId.get(id)).filter(Boolean);
      if (!m.length) return [];
      const b = getNodesBounds(m.map((n) => ({ ...n, measured: { width: n.measured?.width ?? 220, height: n.measured?.height ?? tableHeight(n.data) } })));
      const pad = 22, w = b.width + pad * 2, h = b.height + pad * 2 + 18;
      return [{ id: `g:${gr.name}`, type: 'grp', position: { x: b.x - pad, y: b.y - pad - 18 }, data: { name: gr.name, color: gr.color, w, h }, width: w, height: h, draggable: false, selectable: false, focusable: false, zIndex: -1 }];
    });
    return [...boxes, ...tables];
  }, [nodes, edges, search, parsed, view.hideIndexes, view.hideTypes, activeId, activeEdge, layoutTick, hidden, onSize, onToggle]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownEdges = useMemo(() => {
    const geo = new Map(nodes.filter((n) => n.type === 'table').map((n) => [n.id, { x: n.position.x, w: n.measured?.width ?? tableWidth(n.data) }]));
    return edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)).map((e) => {
    // nearest path: leave through the side that faces the other table (both on the same side when they overlap horizontally)
    const a = geo.get(e.source), b = geo.get(e.target);
    let sp = 'right', tp = 'left';
    if (a && b) {
      if (b.x >= a.x + a.w) { sp = 'right'; tp = 'left'; }
      else if (b.x + b.w <= a.x) { sp = 'left'; tp = 'right'; }
      else sp = tp = b.x + b.w / 2 >= a.x + a.w / 2 ? 'right' : 'left';
    }
    const handles = { sourceHandle: `${sp === 'right' ? 's' : 'sl'}:${e.data.sf}`, targetHandle: `${tp === 'left' ? 't' : 'tr'}:${e.data.tf}` };
    const picked = e.id === activeEdge, on = activeId && (e.source === activeId || e.target === activeId);
    const style = picked ? { stroke: '#f59e0b', strokeWidth: 3 } : on || view.hiRefs ? { stroke: view.theme === 'dark' ? '#4f8cff' : '#2563eb', strokeWidth: view.hiRefs && !on ? 1.6 : 2 } : { stroke: '#94a3b8', strokeWidth: 1.3, ...(activeEdge ? { opacity: 0.15 } : {}) };
    return { ...e, ...handles, type: view.edgeType, zIndex: picked ? 20 : on ? 10 : 0, interactionWidth: 20, style, label: view.hiRefs && e.data.name ? e.data.name : e.label, labelStyle: { fontSize: view.hiRefs ? 10.5 : 10, fill: picked ? (view.theme === 'dark' ? '#fbbf24' : '#b45309') : view.hiRefs ? (view.theme === 'dark' ? '#9fc0ff' : '#1d4ed8') : '#64748b', fontWeight: picked || view.hiRefs ? 600 : 400 }, ...(view.hiRefs && e.data.name ? { labelShowBg: true, labelBgStyle: { fill: view.theme === 'dark' ? '#111826' : '#fff', stroke: view.theme === 'dark' ? '#2c3f66' : '#bfd3ff', strokeWidth: 1, fillOpacity: 0.96 }, labelBgPadding: [6, 3], labelBgBorderRadius: 6 } : { labelBgStyle: { fill: canvasBg } }) };
  }); }, [edges, nodes, view.edgeType, view.hiRefs, activeId, activeEdge, canvasBg, hidden]);

  const [algoOpen, setAlgoOpen] = useState(false);
  const focusTable = (id) => { // select it and bring it to the middle (showing it if it was hidden)
    if (hidden.has(id)) setHidden([id], false);
    setActiveEdge(null); setActiveId(id);
    setTimeout(() => fitView({ nodes: [{ id }], padding: 0.8, maxZoom: 1, duration: 300 }), 80);
  };
  const relayout = (algo = view.algo) => { // two passes: estimated sizes, then the sizes the browser really measured (manual widths, wrapped text) so nothing overlaps
    const pass = (measured) => {
      setNodes((old) => {
        const sz = layoutRef.current['@sizes'], hid = new Set(layoutRef.current['@hidden'] || []);
        const vis = old.filter((n) => !hid.has(n.id));
        const next = layout(vis.map((n) => ({ ...n.data, collapsed: !!sz?.[n.id]?.c, w: (measured && n.measured?.width) || sz?.[n.id]?.w, h: (measured && n.measured?.height) || sz?.[n.id]?.h })), parsed.refs, null, (parsed.groups || []).map((g) => ({ ...g, tables: g.tables.filter((id) => !hid.has(id)) })), algo);
        const fresh = new Map(next.map((n) => [n.id, n])), merged = old.map((n) => fresh.get(n.id) || n); // hidden tables keep their place
        layoutRef.current = { ...Object.fromEntries(merged.map((n) => [n.id, n.position])), ...(sz ? { '@sizes': sz } : {}), ...(hid.size ? { '@hidden': [...hid] } : {}) };
        return merged;
      });
      setLayoutTick((n) => n + 1);
    };
    pass(false); setTimeout(() => pass(true), 350); setTimeout(() => fitView({ padding: 0.2, maxZoom: 1, duration: 250 }), 700);
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const run = (label, fn) => async () => { setBusy(label); try { await fn(); } catch (e) { notify('err', errMsg(e)); } finally { setBusy(''); } };

  // form -> API body: secrets left empty keep the stored value, clearCa removes the saved CA
  const body = (extra = {}) => ({ ...form, name: form.name || `${form.type}@${form.host}`, caPem: form.clearCa ? null : form.caPem, ...extra });
  const test = run('test', async () => {
    const r = await api('schemas', body());
    setSchemas(r.schemas); setPicked(r.schemas.length === 1 ? r.schemas : []); setWarnings(r.warnings || []);
    notify(r.warnings?.length ? 'err' : 'ok', `Connected (read-only session) — ${r.schemas.length} schema(s)${r.warnings?.length ? ' · credential has extra privileges!' : ''}`);
  });
  const loadTables = run('tables', async () => {
    const r = await api('tables', { ...body(), schemas: picked });
    setTableList(r.tables.map((t) => ({ name: `${t.schema}.${t.name}`, view: t.view }))); setPicker(true);
  });
  const persist = async (extra = {}) => {
    const { id } = await api('connections', body(extra));
    setForm((f) => ({ ...f, id, password: '', hasCa: f.clearCa ? false : !!f.caPem || !!f.hasCa, caPem: '', clearCa: false }));
    await loadConns();
    return id;
  };
  const save = run('save', async () => { await persist(); notify('ok', 'Connection saved'); });
  const importNow = run('import', async () => {
    const tables = tableSel;
    const id = await persist({ schemas: picked, tables });
    const r = await api('import', { id, schemas: picked, tables });
    lastGen.current = r.dbml; store(`gen:${doc.id}`, r.dbml);
    setDbml(withGroups(r.dbml, tableGroups ?? parsed.groups)); setWarnings(r.warnings || []); // groups are re-applied: a new import must not lose them
    setSource({ connId: id, schemas: picked, tables, at: r.at });
    notify('ok', `Imported ${r.tables} tables, ${r.refs} relationships — linked for refresh`);
  });
  const refresh = useCallback(async (silent = false) => {
    if (!source || refreshing.current) return;
    refreshing.current = true; setBusy('refresh');
    try {
      const r = await api('import', { id: source.connId, schemas: source.schemas, tables: source.tables });
      setSource((x) => ({ ...x, at: r.at })); setWarnings(r.warnings || []);
      if (r.dbml === lastGen.current) { if (!silent) notify('ok', 'Already up to date'); return; }
      const cur = dbmlRef.current, merged = keepGroups(cur, r.dbml);
      lastGen.current = r.dbml; store(`gen:${doc.id}`, r.dbml);
      setDbml(merged);
      notify('ok', `Metadata refreshed: ${diffSummary(cur, merged)}`);
    } catch (e) { notify('err', `Refresh failed: ${errMsg(e)}`); } finally { refreshing.current = false; setBusy(''); }
  }, [source, notify, doc]);
  const linked = conns.find((c) => c.id === source?.connId);
  const every = linked?.refreshMinutes || 0;
  useEffect(() => {
    if (!source || !every) return undefined;
    const t = setInterval(() => refresh(true), every * 60000);
    return () => clearInterval(t);
  }, [source?.connId, every, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (c) => { setForm({ ...EMPTY, ...c, password: '', caPem: '', clearCa: false }); setSchemas(c.schemas || []); setPicked(c.schemas || []); setTableSel(c.tables || []); setTableList(null); setTableGroups(null); setWarnings([]); };
  const del = async (c) => { await api(`connections/${c.id}`, undefined, 'DELETE'); if (form.id === c.id) setForm(EMPTY); if (source?.connId === c.id) setSource(null); loadConns(); };
  const loadPem = async (f) => { if (f) { const t = await f.text(); setForm((x) => ({ ...x, caPem: t, clearCa: false })); } };

  const importText = (text, fmt = sqlFmt) => {
    if (readOnly) return notify('err', 'This diagram is read-only for you');
    try { setDbml(fmt === 'dbml' ? text : importer.import(text, fmt)); notify('ok', `Imported from ${fmt}`); }
    catch (e) { notify('err', `Import ${fmt} failed: ${errMsg(e)}`); }
  };
  const importFile = async (f) => { if (f) importText(await f.text()); };

  const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text])); a.download = name; a.click(); };
  const exportAs = async (fmt) => {
    const base = title.trim().replace(/[^\w.-]+/g, '_') || 'diagram';
    try {
      if (fmt === 'docs-html' || fmt === 'docs-md') {
        if (parsed.error) throw new Error('fix the DBML errors first');
        const m = buildModel(parsed.db);
        if (fmt === 'docs-html') download(`${base}-docs.html`, standaloneHtml(m, title, comments));
        else download(`${base}-docs.md`, toMarkdown(m, title, comments));
      } else if (fmt === 'dbml') download(`${base}.dbml`, dbml);
      else if (fmt === 'json') download(`${base}.json`, exporter.export(dbml, 'json'));
      else if (fmt === 'png' || fmt === 'svg') {
        const b = getNodesBounds(nodes.map((n) => ({ ...n, measured: n.measured ?? { width: 220, height: tableHeight(n.data) } })));
        const w = Math.ceil(b.width + 120), h = Math.ceil(b.height + 120);
        const vp = getViewportForBounds(b, w, h, 0.1, 2, 0.05);
        const url = await (fmt === 'png' ? toPng : toSvg)(document.querySelector('.react-flow__viewport'), { backgroundColor: canvasBg, width: w, height: h, style: { width: `${w}px`, height: `${h}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` } });
        const a = document.createElement('a'); a.href = url; a.download = `${base}.${fmt}`; a.click();
      } else download(`${base}.${fmt}.sql`, exporter.export(dbml, fmt));
      notify('ok', `Exported ${fmt}`);
    } catch (e) { notify('err', `Export ${fmt} failed: ${errMsg(e)}`); }
  };
  const copyDbml = () => navigator.clipboard.writeText(dbml).then(() => notify('ok', 'DBML copied'), () => notify('err', 'Clipboard blocked'));

  const tabs = shared
    ? [...(canEdit ? [['import', 'Import']] : []), ['export', 'Export'], ['view', 'View'], ['docs', 'Help']]
    : owner
      ? [['diagrams', 'Diagrams'], ['connect', 'Database'], ['import', 'Import'], ['export', 'Export'], ['view', 'View'], ['share', 'Share'], ['docs', 'Help']]
      : [['diagrams', 'Diagrams'], ...(canEdit ? [['import', 'Import']] : []), ['export', 'Export'], ['view', 'View'], ...(manage ? [['share', 'Share']] : []), ['docs', 'Help']];
  const tabName = Object.fromEntries(tabs);
  const TITLES = { diagrams: 'Diagrams', connect: 'Database', import: 'Import', export: 'Export', view: 'View', share: 'Share', docs: 'Help', account: 'Account' };
  const primary = ['diagrams', 'share', 'export'].filter((k) => tabName[k]); // everything else lives under "More"
  const LABEL = { view: 'view only', comment: 'can comment', edit: 'can edit', admin: 'administrator access' };
  const insertExample = (code) => { if (readOnly) return notify('err', 'This diagram is read-only for you'); setDbml((d) => `${d.replace(/\s+$/, '')}\n\n${code}\n`); notify('ok', 'Example added to the editor'); };
  const copyText = (t) => navigator.clipboard.writeText(t).then(() => notify('ok', 'Copied'), () => notify('err', 'Clipboard blocked'));
  const open = (t) => setDrawer(drawer === t ? null : t);
  useEffect(() => { store('editorW', String(editorW)); }, [editorW]);
  useEffect(() => { document.title = doc ? `${title || 'Untitled'} — ${org || 'OpenDiagram'}` : (org || 'OpenDiagram'); }, [doc, title, org]);
  const startResize = (e) => {
    e.preventDefault();
    setResizing(true);
    const move = (ev) => setEditorW(Math.max(260, Math.min(Math.floor(window.innerWidth * 0.75), ev.clientX)));
    const up = () => { setResizing(false); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.style.userSelect = ''; };
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  const stat = parsed.error ? 'syntax error' : `${parsed.tables.length} tables · ${parsed.refs.length} refs`;

  if (needPass !== null) return (
    <div className="auth-wrap"><form className="auth-card" onSubmit={(e) => { e.preventDefault(); const pw = new FormData(e.currentTarget).get('pw'); if (!pw) return; sharePassword(shareToken, String(pw)); setNeedPass(null); setUnlockTick((n) => n + 1); }}>
      <h2>Protected link</h2><div className="auth-err" style={{ display: needPass ? 'block' : 'none' }}>{needPass}</div>
      <input name="pw" type="password" autoFocus autoComplete="off" placeholder="Password" /><button className="primary" type="submit">Open</button>
    </form></div>
  );
  if (loadErr) return <div className="auth-wrap"><div className="auth-card"><h2>Could not open this diagram</h2><div className="auth-err">{loadErr}</div><a href="/">Go to the app</a></div></div>;
  if (!doc) return <div className="splash">Loading…</div>;

  return (
    <div className="shell" data-theme={view.theme}>
      <header className="top">
        <div className="brand"><span className="logo">◆</span> {org || 'OpenDiagram'}</div>
        <input className="title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="diagram title" readOnly={!manage} />
        {shared
          ? <span className="chip-access" title={`Shared by ${doc.ownerName}`}>{access === 'edit' ? (user ? 'can edit' : 'edit link — log in to edit') : access === 'comment' ? (user ? 'can comment' : 'comment link — log in to comment') : 'view only'}</span>
          : !manage || !owner ? <span className="chip-access" title={`Owned by ${doc.ownerName}`}>{doc.ownerName} · {LABEL[access]}</span> : null}
        {canEdit && <span className={`savestate ${saveState}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : 'Saved'}</span>}
        <div className="mode" role="tablist" aria-label="View mode">
          <button role="tab" aria-selected={mode === 'diagram'} className={mode === 'diagram' ? 'on' : ''} onClick={() => setMode('diagram')}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="1.5" y="2" width="5" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" /><rect x="9.5" y="10" width="5" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M4 6v4h5.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>Diagram
          </button>
          <button role="tab" aria-selected={mode === 'docs'} className={mode === 'docs' ? 'on' : ''} onClick={() => setMode('docs')}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 2h7l3 3v9H3z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M5.5 8h5M5.5 10.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>Docs
          </button>
        </div>
        <div className="grow" />
        {mode === 'diagram' && <button className={`tbtn ${panelOpen ? 'on' : ''}`} onClick={() => { setPanelOpen(!panelOpen); setTimeout(() => panelSearch.current?.focus(), 80); }} title="Search, group and hide tables (Ctrl+K)">Tables{hidden.size ? ` · ${hidden.size} hidden` : ''}</button>}
        {owner && source && <button className="tbtn" disabled={busy === 'refresh'} onClick={() => refresh(false)} title={`Re-read metadata from ${linked?.name ?? 'the database'}${every ? ` · auto every ${every} min` : ''}`}>{busy === 'refresh' ? '↻ Refreshing…' : `↻ ${linked?.name ?? 'source'} · ${ago(source.at)}`}</button>}
        {primary.map((k) => <button key={k} className={`tbtn ${drawer === k ? 'on' : ''}`} onClick={() => open(k)}>{tabName[k]}</button>)}
        <Menu trigger="More" active={['connect', 'import', 'view', 'docs'].includes(drawer)} title="Database, Import, View, Help"
          items={['connect', 'import', 'view', 'docs'].filter((k) => tabName[k]).map((k) => ({ key: k, label: tabName[k], on: drawer === k, onClick: () => setDrawer(k) }))} />
        {user
          ? <Menu align="right" title={`${user.name} · ${user.email}`} trigger={<span className="avatar">{(user.name || user.email)[0].toUpperCase()}</span>}
            items={[{ header: `${user.name} · ${user.role === 'admin' ? 'Administrator' : 'Member'}` }, { key: 'account', label: 'Account & password', onClick: () => setDrawer('account') },
              ...(user.role === 'admin' ? [{ key: 'admin', label: 'Administration', hint: 'users, groups, settings', onClick: () => setShowAdmin(true) }] : []),
              { sep: true }, { key: 'out', label: 'Sign out', danger: true, onClick: onLogout }]} />
          : <button className="tbtn on" onClick={onLogin}>Log in</button>}
      </header>

      <div className="body">
        <section className={`editor-pane ${editorShown ? '' : 'closed'} ${resizing ? 'resizing' : ''}`} style={{ width: editorShown ? editorW : 0 }}>
          <Editor value={dbml} onChange={setDbml} diags={editorDiags} info={editorInfo} readOnly={readOnly} wrap={view.wrap} />
          <div className={`status ${error ? 'bad' : ''}`}>{error || stat}</div>
        </section>
        {editorShown && <div className={`resizer ${resizing ? 'active' : ''}`} style={{ left: editorW }} title="Drag to resize the editor (double-click to reset)" onMouseDown={startResize} onDoubleClick={() => setEditorW(380)} />}
        {mode !== 'docs' && <button className="edge-toggle" style={{ left: editorOpen ? editorW : 0 }} onClick={() => setEditorOpen(!editorOpen)} title="Toggle editor">{editorOpen ? '‹' : '›'}</button>}

        <main className="canvas">
          <ReactFlow nodes={shown} edges={shownEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} colorMode={view.theme}
            snapToGrid={view.snap} snapGrid={[20, 20]} minZoom={0.05} maxZoom={2} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            onNodeClick={(_, n) => { setActiveEdge(null); setActiveId(n.type === 'table' ? n.id : null); }} onEdgeClick={(_, e) => { setActiveId(null); setActiveEdge(e.id); }} onPaneClick={() => { setActiveId(null); setActiveEdge(null); }} nodesConnectable={false} nodesDraggable={canEdit}
            onNodeDragStop={(_, n) => { if (n.type === 'table') { layoutRef.current = { ...layoutRef.current, [n.id]: n.position }; setLayoutTick((k) => k + 1); } }}>
            {view.grid && <Background gap={22} size={1.2} color={view.theme === 'dark' ? '#27324a' : '#cfd4dc'} />}
            <MiniMap pannable zoomable className="mini" style={{ right: (drawer ? 350 : 0) + (panelOpen && mode === 'diagram' ? 320 : 0) }} nodeColor={view.theme === 'dark' ? '#4f8cff' : '#1e3a5f'} maskColor={view.theme === 'dark' ? 'rgba(14,20,32,.72)' : 'rgba(244,245,247,.7)'} />
          </ReactFlow>
          {mode === 'diagram' && (<>
            <button className="tpn-toggle" style={{ right: (drawer ? 350 : 0) + (panelOpen ? 320 : 0) }} onClick={() => setPanelOpen(!panelOpen)} title="Tables panel (Ctrl+K)" aria-label="Tables panel">{panelOpen ? '›' : '‹'}</button>
            {panelOpen && !parsed.error && <TablesPanel right={drawer ? 350 : 0} tables={parsed.tables} groups={parsed.groups || []} refs={parsed.refs} hidden={hidden} onHide={setHidden} onOnly={showOnly} onFocus={focusTable} activeId={activeId} search={search} setSearch={setSearch} searchRef={panelSearch} onClose={() => setPanelOpen(false)} />}
          </>)}
          {!parsed.error && !parsed.tables.length && <div className="empty">No tables yet — write DBML on the left, or open <b>Database</b> / <b>Import</b>.</div>}
          {mode === 'docs' && (docModel ? <DocsView model={docModel} title={title} theme={view.theme} comments={comments} me={user} canComment={canComment} isOwner={!!doc?.isOwner || access === 'admin'} onAdd={addComment} onDelete={deleteComment} /> : <div className="empty">Fix the DBML errors to generate documentation.</div>)}
          <div className="dock">
            <button onClick={() => zoomOut()} title="Zoom out">−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => zoomIn()} title="Zoom in">+</button>
            <i className="sep" />
            <button onClick={() => fitView({ padding: 0.2, maxZoom: 1, duration: 250 })} title="Fit to screen">⤢</button>
            <button onClick={() => setSize(Object.fromEntries(nodes.map((n) => [n.id, { c: true }])))} title="Collapse all tables">⊟</button>
            <button onClick={() => setSize(Object.fromEntries(nodes.map((n) => [n.id, { c: false }])))} title="Expand all tables">⊞</button>
            <button className={view.hiRefs ? 'on' : ''} onClick={() => setView({ ...view, hiRefs: !view.hiRefs })} title="Highlight relationships (show their names)" aria-label="Highlight relationships"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="2.4" /><circle cx="19" cy="18" r="2.4" /><path d="M7.2 7c7 0 3.6 10 9.6 10" /></svg></button>
            <button onClick={() => relayout()} title={`Auto arrange (${(ALGOS.find((a) => a.k === view.algo) || ALGOS[0]).name})`}>⚙ Arrange</button>
            <button onClick={() => setAlgoOpen((o) => !o)} title="Choose the arrange algorithm">▾</button>
            {algoOpen && (<>
              <div className="algo-bg" onClick={() => setAlgoOpen(false)} />
              <div className="algo-pop" role="menu">
                <b>Auto-arrange algorithm</b>
                {ALGOS.map((a) => (
                  <button key={a.k} role="menuitem" className={view.algo === a.k ? 'on' : ''} onClick={() => { setView({ ...view, algo: a.k }); setAlgoOpen(false); relayout(a.k); }}>
                    <span>{a.name}</span><small>{a.desc}</small>
                  </button>
                ))}
              </div>
            </>)}
          </div>
        </main>

        <aside className={`drawer ${drawer ? 'open' : ''}`}>
          <div className="dtabs">
            <b className="dtitle">{TITLES[drawer] ?? ''}</b>
            <button className="x" onClick={() => setDrawer(null)} title="Close (Esc)">✕</button>
          </div>

          {drawer === 'account' && user && (
            <div className="dbody">
              <div className="card static">
                <span className="avatar big">{(user.name || user.email)[0].toUpperCase()}</span>
                <div className="grow"><b>{user.name}</b><small>{user.email}</small></div>
                <span className="chip">{user.role === 'admin' ? 'Administrator' : 'Member'}</span>
              </div>
              {groups?.length > 0 && <><h4>My groups</h4><div>{groups.map((g) => <span key={g.id} className="chip">{g.name}</span>)}</div></>}
              <h4>Change password</h4>
              <PasswordForm onDone={onUser} />
              <button onClick={onLogout}>Sign out</button>
            </div>
          )}
          {drawer === 'diagrams' && <Library diagrams={diagrams} currentId={doc?.id} isAdmin={user?.role === 'admin'} onOpen={(id) => { openDiagram(id).then(() => setDrawer(null)).catch((e) => notify('err', errMsg(e))); }} templates={TEMPLATES} onCreate={newDiagram} onDelete={deleteDiagram} />}
          {drawer === 'share' && manage && doc?.id && <SharePanel diagramId={doc.id} notify={notify} />}

          {drawer === 'connect' && (
            <div className="dbody">
              {source && (
                <div className="linked">
                  <span>Linked to <b>{linked?.name ?? 'connection'}</b> · {source.schemas.join(', ')}{every ? ` · auto ${every} min` : ''}</span>
                  <span><a onClick={() => refresh(false)}>Refresh now</a> · <a onClick={() => setSource(null)}>Unlink</a></span>
                </div>
              )}
              <h4>Saved connections <a onClick={() => { setForm(EMPTY); setSchemas([]); setPicked([]); setTableSel([]); setTableList(null); setTableGroups(null); setWarnings([]); }}>+ new</a></h4>
              {conns.length === 0 && <small className="hint">None yet — fill the form below and Save.</small>}
              {conns.map((c) => (
                <div key={c.id} className={`card ${form.id === c.id ? 'sel' : ''}`} onClick={() => pick(c)}>
                  <span className={`badge ${c.type}`}>{c.type === 'oracle' ? 'ORA' : 'PG'}</span>
                  <div className="grow"><b>{c.name}</b><small>{c.host}:{c.port}/{c.database}</small></div>
                  <button className="ghost" onClick={(e) => { e.stopPropagation(); del(c); }} title="Delete">✕</button>
                </div>
              ))}
              <h4>{form.id ? 'Edit connection' : 'New connection'}</h4>
              <div className="seg">
                {[['postgres', 'PostgreSQL'], ['oracle', 'Oracle']].map(([v, l]) => (
                  <button key={v} className={form.type === v ? 'on' : ''} onClick={() => setForm({ ...form, type: v, port: v === 'oracle' ? 1521 : 5432 })}>{l}</button>
                ))}
              </div>
              <input placeholder="Connection name" value={form.name} onChange={set('name')} />
              <div className="row"><input placeholder="Host" value={form.host} onChange={set('host')} /><input className="port" placeholder="Port" value={form.port} onChange={set('port')} /></div>
              <input placeholder={form.type === 'oracle' ? 'Service name (e.g. FREEPDB1)' : 'Database'} value={form.database} onChange={set('database')} />
              <div className="row"><input placeholder="User" value={form.user} onChange={set('user')} /><input type="password" placeholder={form.id ? '(unchanged)' : 'Password'} value={form.password} onChange={set('password')} /></div>
              <h4>Security</h4>
              <div className="ro">🔒 Read-only: every session is opened read-only and only reads catalog metadata — never table data.</div>
              <select value={form.tls} onChange={set('tls')} title="Transport encryption">
                <option value="off">TLS: off</option>
                <option value="verify">TLS: on — verify certificate{form.type === 'oracle' ? ' (TCPS)' : ''}</option>
                <option value="noverify">TLS: on — {form.type === 'oracle' ? 'skip server name check (chain still validated)' : 'do not verify certificate (not recommended)'}</option>
              </select>
              {form.tls === 'verify' && (<>
                <textarea className="pem" placeholder={form.hasCa && !form.clearCa ? '(CA certificate saved — paste a new PEM to replace)' : 'CA certificate (PEM) — only needed for a private/self-signed CA'} value={form.caPem} onChange={set('caPem')} />
                <div className="hint"><label className="link">Load .pem file<input type="file" accept=".pem,.crt,.cer" hidden onChange={(e) => { loadPem(e.target.files[0]); e.target.value = ''; }} /></label>{form.hasCa && !form.clearCa && <> · <a onClick={() => setForm({ ...form, clearCa: true, caPem: '' })}>Remove saved CA</a></>}{form.clearCa && ' · saved CA will be removed on Save'}</div>
              </>)}
              {form.type === 'oracle' && form.tls === 'verify' && <input placeholder="Expected server certificate DN (optional)" value={form.serverDn} onChange={set('serverDn')} />}
              <label className="chk"><input type="checkbox" checked={!!form.blockWritable} onChange={set('blockWritable')} /> Block credentials with write privileges (strict)</label>
              <h4>Keep metadata fresh</h4>
              <select value={form.refreshMinutes} onChange={set('refreshMinutes')}>{REFRESH.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <small className="hint">Runs while this page is open, for the connection linked after an import. Refresh keeps your TableGroups and table positions; other manual edits to imported tables are replaced.</small>
              <div className="row">
                <button onClick={test} disabled={!!busy}>{busy === 'test' ? 'Connecting…' : 'Test connection'}</button>
                <button onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
              </div>
              {warnings.length > 0 && (
                <div className="warn"><b>⚠ This credential has more access than a diagram needs</b>
                  <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                  <small>Sessions stay read-only, but prefer a dedicated user with SELECT on the catalog only.</small></div>
              )}
              {schemas.length > 0 && (<>
                <h4>Schemas to import <a onClick={() => setPicked(schemas)}>all</a> · <a onClick={() => setPicked([])}>none</a></h4>
                <div className="schemas">
                  {schemas.map((s) => (
                    <label key={s} className="chk"><input type="checkbox" checked={picked.includes(s)} onChange={(e) => setPicked(e.target.checked ? [...picked, s] : picked.filter((x) => x !== s))} /> {s}</label>
                  ))}
                </div>
                <h4>Tables {tableSel.length > 0 && <a onClick={() => setTableSel([])}>clear</a>}</h4>
                <button disabled={!picked.length || !!busy} onClick={loadTables}>{busy === 'tables' ? 'Loading…' : tableSel.length ? `${tableSel.length} table(s) selected${tableGroups?.length ? ` · ${tableGroups.length} group(s)` : ''} — change…` : 'All tables — choose specific ones…'}</button>
                <button className="primary" disabled={!picked.length || !!busy} onClick={importNow}>{busy === 'import' ? 'Importing…' : `Import ${picked.length} schema(s) → diagram`}</button>
              </>)}
            </div>
          )}

          {drawer === 'import' && (
            <div className="dbody">
              <h4>Format</h4>
              <select value={sqlFmt} onChange={(e) => setSqlFmt(e.target.value)}>
                <option value="postgres">PostgreSQL SQL</option><option value="mysql">MySQL SQL</option><option value="mssql">SQL Server SQL</option>
                <option value="snowflake">Snowflake SQL</option><option value="dbml">DBML</option>
              </select>
              <label className={`drop ${drag ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); importFile(e.dataTransfer.files[0]); }}>
                Drop a .sql / .dbml file here<br /><small>or click to browse</small>
                <input type="file" accept=".sql,.txt,.dbml" hidden onChange={(e) => { importFile(e.target.files[0]); e.target.value = ''; }} />
              </label>
              <h4>…or paste</h4>
              <textarea className="paste" placeholder="CREATE TABLE …" value={paste} onChange={(e) => setPaste(e.target.value)} />
              <button className="primary" disabled={!paste.trim()} onClick={() => importText(paste)}>Convert to diagram</button>
              <small className="hint">Oracle SQL files are not supported by the parser — use Database → Oracle to import live.</small>
            </div>
          )}

          {drawer === 'export' && (
            <div className="dbody">
              <h4>Download</h4>
              <div className="grid">
                {EXPORTS.map(([k, l, ext]) => <button key={k} onClick={() => exportAs(k)}><b>{l}</b><small>{ext}</small></button>)}
              </div>
              <button onClick={copyDbml}>Copy DBML to clipboard</button>
              <small className="hint">SQL is generated in the target dialect from the DBML; defaults/types from another engine may need manual edits.</small>
            </div>
          )}

          {drawer === 'docs' && <Docs onInsert={insertExample} onCopy={copyText} />}

          {drawer === 'view' && (
            <div className="dbody">
              <h4>Theme</h4>
              <div className="seg">
                {[['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => (
                  <button key={v} className={view.theme === v ? 'on' : ''} onClick={() => setView({ ...view, theme: v })}>{l}</button>
                ))}
              </div>
              <label className="chk"><input type="checkbox" checked={view.grid} onChange={(e) => setView({ ...view, grid: e.target.checked })} /> Show background grid</label>
              <h4>Editor</h4>
              <label className="chk"><input type="checkbox" checked={!!view.wrap} onChange={(e) => setView({ ...view, wrap: e.target.checked })} /> Wrap long lines (no horizontal scroll)</label>
              <small className="hint">Drag the edge between the editor and the diagram to resize it; double-click the edge to reset.</small>
              <h4>Relationship lines</h4>
              <div className="seg">
                {[['default', 'Curved'], ['smoothstep', 'Rounded'], ['step', 'Step'], ['straight', 'Straight']].map(([v, l]) => (
                  <button key={v} className={view.edgeType === v ? 'on' : ''} onClick={() => setView({ ...view, edgeType: v })}>{l}</button>
                ))}
              </div>
              <h4>Tables</h4>
              <label className="chk"><input type="checkbox" checked={view.hideTypes} onChange={(e) => setView({ ...view, hideTypes: e.target.checked })} /> Hide column types</label>
              <label className="chk"><input type="checkbox" checked={view.hiRefs} onChange={(e) => setView({ ...view, hiRefs: e.target.checked })} /> Highlight relationships (show names)</label>
              <label className="chk"><input type="checkbox" checked={view.hideIndexes} onChange={(e) => setView({ ...view, hideIndexes: e.target.checked })} /> Hide indexes</label>
              <label className="chk"><input type="checkbox" checked={view.snap} onChange={(e) => setView({ ...view, snap: e.target.checked })} /> Snap to grid</label>
              <small className="hint">Click a table to highlight its relationships. Header color: <code>Table t [headercolor: #3498DB]</code>.</small>
            </div>
          )}
        </aside>
      </div>

      {picker && tableList && <TablePicker items={tableList} selected={tableSel} groups={tableGroups ?? parsed.groups ?? []} onClose={() => setPicker(false)} onApply={({ tables, groups }) => { setTableSel(tables); setTableGroups(groups); setPicker(false); }} />}
      {showAdmin && user?.role === 'admin' && <Admin me={user} notify={notify} onClose={() => setShowAdmin(false)} onSettings={onOrg} />}
      {toast && <div className={`toast ${toast.type}`} onClick={() => setToast(null)}>{toast.text}</div>}
    </div>
  );
}

export default function App() {
  const shareToken = (/^\/s\/([\w-]+)\/?$/.exec(window.location.pathname) || [])[1];
  const [me, setMe] = useState(undefined); // undefined = still checking the session
  const [info, setInfo] = useState({ signup: false, firstRun: false, org: '', groups: [] });
  const [askLogin, setAskLogin] = useState(false);
  const loadMe = useCallback(() => api('auth/me').then((r) => { setMe(r.user); setInfo({ signup: r.signup, firstRun: r.firstRun, org: r.org, groups: r.groups }); }).catch(() => setMe(null)), []);
  useEffect(() => { loadMe(); }, [loadMe]);

  if (me === undefined) return <div className="splash">Loading…</div>;
  if (me?.mustChangePassword) return <PasswordForm forced org={info.org} onDone={loadMe} />;
  if (!me && (!shareToken || askLogin)) {
    return <AuthScreen signup={info.signup} firstRun={info.firstRun} org={info.org} hint={shareToken ? 'Sign in to comment or edit shared diagrams.' : undefined}
      onDone={() => { setAskLogin(false); loadMe(); }} onCancel={shareToken ? () => setAskLogin(false) : undefined} />;
  }
  const logout = async () => { try { await api('auth/logout', {}); } catch { /* already signed out */ } setMe(null); loadMe(); };
  return (
    <ReactFlowProvider>
      <Workspace key={`${me?.id ?? 'anon'}:${shareToken ?? ''}`} user={me} groups={info.groups} org={info.org} shareToken={shareToken}
        onLogin={() => setAskLogin(true)} onLogout={logout} onUser={loadMe} onOrg={(org) => setInfo((i) => ({ ...i, org }))} />
    </ReactFlowProvider>
  );
}
