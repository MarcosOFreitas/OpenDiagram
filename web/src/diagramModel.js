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
