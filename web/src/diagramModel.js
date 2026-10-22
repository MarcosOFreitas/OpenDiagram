// Pure DBML-side logic of the workspace (no React): parsing for the diagram, TableGroup merging on refresh, change summary, header text colour.
import { Parser } from '@dbml/core';
import { errMsg } from './api.js';
import { tid } from './docsModel.js';
import { lineageEdges, MANUAL } from './lineage.js';

// text colour with the better contrast on a header colour taken from the DBML (white on orange would fail 4.5:1)
export const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const n = parseInt(m[1], 16); return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };
export const readable = (hex) => (1.05 / (lum(hex) + 0.05) >= (lum(hex) + 0.05) / 0.059 ? '#fff' : '#111827'); // white vs near-black: whichever contrasts more
export const cid = (r) => tid(r.child.schemaName, r.child.tableName);
export const pid = (r) => tid(r.parent.schemaName, r.parent.tableName); // a ref's two table ids

// DBML text -> {tables, refs, groups} for the diagram
// the import writes `VIEW` / `MATERIALIZED VIEW` (+ the CREATE statement when the full DDL was asked for) into the table note
export const viewKindOf = (note) => { const n = typeof note === 'string' ? note : note?.value || ''; const m = /(^|\n)(MATERIALIZED VIEW|VIEW)(\n|$)/.exec(n); return m ? (m[2] === 'VIEW' ? 'View' : 'Mat. view') : ''; };
export function parse(text) {
  try {
    const db = new Parser().parse(text, 'dbmlv2');
    const tables = db.schemas.flatMap((s) => s.tables).map((t) => ({
      id: tid(t.schema.name, t.name), schema: t.schema.name, name: t.name, note: t.note, headerColor: t.headerColor, viewKind: viewKindOf(t.note),
      fields: t.fields.map((f) => ({ name: f.name, type: f.type.type_name, pk: f.pk, notNull: f.not_null, unique: f.unique, note: f.note })),
      indexes: t.indexes.map((i) => ({ name: i.name, unique: i.unique, pk: i.pk, cols: i.columns.map((c) => c.value) })),
    }));
    const lineage = lineageEdges(text, tables); // `// lineage:` comment lines
    const notes = (db.notes || []).map((n) => ({ name: n.name, text: String(n.content ?? '').replace(/\s+$/, ''), start: n.token.start.offset, end: n.token.end.offset }));
    const refs = db.schemas.flatMap((s) => s.refs).map((r) => {
      const [a, b] = r.endpoints;
      const [child, parent] = a.relation === '*' || b.relation === '1' ? [a, b] : [b, a];
      return { name: r.name || '', id: r.name || `${tid(child.schemaName, child.tableName)}.${child.fieldNames}->${tid(parent.schemaName, parent.tableName)}`, child, parent };
    });
    const groups = db.schemas.flatMap((s) => s.tableGroups || []).map((g) => ({ name: g.name, color: g.color, tables: g.tables.map((t) => tid(t.schema?.name ?? t.schemaName, t.name)) }));
    return { tables, refs, groups, lineage, notes, db };
  } catch (e) {
    return { error: errMsg(e), diags: e?.diags?.map((d) => ({ line: d.location?.start?.line ?? 1, col: d.location?.start?.column ?? 1, endLine: d.location?.end?.line, endCol: d.location?.end?.column, message: d.message ?? 'syntax error' })) ?? [] };
  }
}
export const qid = (x) => (/^[A-Za-z_]\w*$/.test(x) ? x : `"${x.replaceAll('"', '\\"')}"`);
// a refresh regenerates tables/refs from the database; keep the user's TableGroups (minus tables that no longer exist)
// append TableGroup blocks (members that are not in the diagram are dropped)
export function withGroups(newDbml, groups) {
  const n = parse(newDbml);
  if (n.error || !groups?.length) return newDbml;
  const have = new Set(n.tables.map((t) => t.id));
  const blocks = groups.map((g) => ({ ...g, tables: g.tables.filter((id) => have.has(id)) })).filter((g) => g.tables.length).map((g) => {
    const members = g.tables.map((id) => { const [sc, ...rest] = id.split('.'); return `  ${qid(sc)}.${qid(rest.join('.'))}`; });
    return `TableGroup ${qid(g.name)}${g.color ? ` [color: ${g.color}]` : ''} {\n${members.join('\n')}\n}`;
  });
  return blocks.length ? `${newDbml.trimEnd()}\n\n${blocks.join('\n\n')}\n` : newDbml;
}
export function keepGroups(oldDbml, newDbml) {
  const o = parse(oldDbml);
  if (o.error) return newDbml;
  const have = new Set(newDbml.split('\n').map((l) => l.trim()));
  const manual = oldDbml.split('\n').filter((l) => MANUAL.test(l) && !have.has(l.trim())); // data lineage written by hand survives a refresh; `(auto)` lines are regenerated
  return withGroups(manual.length ? `${newDbml.replace(/\n*$/, '\n')}\n${manual.join('\n')}\n` : newDbml, o.groups);
}
// which lines the canvas draws: never one that touches a hidden table; data lineage arrows only when they are on; relationship (Ref) lines unless "Hide relationship lines" is on
export const edgeShown = (e, { hidden, lineageOn = true, hideRefs = false }) => !hidden.has(e.source) && !hidden.has(e.target) && (lineageOn || e.data.kind !== 'lineage') && (!hideRefs || e.data.kind === 'lineage');
export function diffSummary(oldDbml, newDbml) {
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

// React Flow's node changes that may reach the nodes state. TableGroup boxes (`g:<name>`) are derived from their tables on every render
// (App.jsx `shown`): their measurements must not reach the state. Even ignored, they made applyNodeChanges return a new array, so new boxes
// were built and measured again: a render loop of ~45 commits a second with the diagram idle. App.jsx skips the call when nothing is left
export const nodeChanges = (changes) => changes.filter((c) => !(c.type === 'dimensions' && c.id.startsWith('g:')));

// the canvas edges of a parsed diagram: one per reference, and the data lineage arrows (column mappings: one arrow per column pair;
// otherwise one table-level arrow). App.jsx adds the handle side and the styles when it draws them.
export const edgesOf = (parsed) => parsed.refs.map((r) => ({
  id: r.id, source: cid(r), sourceHandle: `s:${r.child.fieldNames[0]}`,
  target: pid(r), targetHandle: `t:${r.parent.fieldNames[0]}`,
  label: `${r.child.relation}:${r.parent.relation}`, data: { sf: r.child.fieldNames[0], tf: r.parent.fieldNames[0], name: r.name || '' },
})).concat((parsed.lineage || []).flatMap((l) => (l.maps.length
  ? l.maps.map((m, i) => ({ id: `${l.id}#${i}`, source: l.source, target: l.target, label: '', data: { kind: 'lineage', sCols: [m.s], tCols: [m.t], manual: l.manual, name: '' } }))
  : [{ id: l.id, source: l.source, target: l.target, label: '', data: { kind: 'lineage', sCols: l.sCols, tCols: l.tCols, manual: l.manual, name: '' } }])));

// A relationship line whose label was dragged to p, in the chosen line style: { d: SVG path, x, y: where the label goes }. Curved: a quadratic
// curve whose middle is p. Straight: two segments meeting at p. Step: the vertical segment moves to p's x and the label stays on it (a label
// dragged above or below both ends is held at the nearer end: the offset is kept for the other styles). Rounded (smoothstep): the step route
// with its corners rounded (radius 5, at most half of the shorter segment).
export function bentPath(type, s, t, p) {
  if (type === 'straight') return { d: `M${s.x},${s.y} L${p.x},${p.y} L${t.x},${t.y}`, x: p.x, y: p.y };
  if (type !== 'step' && type !== 'smoothstep') return { d: `M${s.x},${s.y} Q${2 * p.x - (s.x + t.x) / 2},${2 * p.y - (s.y + t.y) / 2} ${t.x},${t.y}`, x: p.x, y: p.y };
  const y = Math.min(Math.max(p.y, Math.min(s.y, t.y)), Math.max(s.y, t.y));
  const route = [s, { x: p.x, y: s.y }, { x: p.x, y: t.y }, t];
  const pts = route.filter((q, i) => !i || q.x !== route[i - 1].x || q.y !== route[i - 1].y);
  if (type === 'step') return { d: pts.map((q, i) => `${i ? 'L' : 'M'}${q.x},${q.y}`).join(' '), x: p.x, y };
  const out = [`M${s.x},${s.y}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, q, b] = [pts[i - 1], pts[i], pts[i + 1]];
    const la = Math.hypot(q.x - a.x, q.y - a.y), lb = Math.hypot(b.x - q.x, b.y - q.y), r = Math.min(5, la / 2, lb / 2);
    out.push(`L${q.x - ((q.x - a.x) / la) * r},${q.y - ((q.y - a.y) / la) * r} Q${q.x},${q.y} ${q.x + ((b.x - q.x) / lb) * r},${q.y + ((b.y - q.y) / lb) * r}`);
  }
  out.push(`L${t.x},${t.y}`);
  return { d: out.join(' '), x: p.x, y };
}

// what an autosave sends, by who is saving: the owner saves title, DBML, connection link and layout; an administrator on someone else's
// diagram title, DBML and layout (never the owner's connection link); an editor (a grant or an edit link: `shared`) DBML and layout only
export const savePayload = (d, shared = false) => (shared ? { dbml: d.dbml, layout: d.layout ?? {} }
  : d.isOwner ? { title: d.title, dbml: d.dbml, source: d.source ?? null, layout: d.layout ?? {} }
    : d.access === 'admin' ? { title: d.title, dbml: d.dbml, layout: d.layout ?? {} }
      : { dbml: d.dbml, layout: d.layout ?? {} });

// table id -> the columns that need connection handles: every column of a reference (all of a composite one) and every column a lineage
// arrow names. The others get none: four handles on every column made thousands of React Flow store subscribers on a big diagram.
export function handleColumns(parsed) {
  const out = new Map();
  const add = (table, names) => { if (!out.has(table)) out.set(table, new Set()); names.forEach((n) => out.get(table).add(n)); };
  parsed.refs.forEach((r) => { add(cid(r), r.child.fieldNames); add(pid(r), r.parent.fieldNames); });
  (parsed.lineage || []).forEach((l) => { add(l.source, [...l.sCols, ...l.maps.map((m) => m.s)]); add(l.target, [...l.tCols, ...l.maps.map((m) => m.t)]); });
  return out;
}
