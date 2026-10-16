// model -> DBML. Single source of truth for the editor and the diagram.
const id = (s) => (/^[A-Za-z_]\w*$/.test(s) ? s : `"${s.replaceAll('"', '\\"')}"`);
const str = (s) => (/[\r\n]/.test(s) ? mstr(String(s).replace(/\r\n?/g, '\n')) : `'${String(s).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`); // single-quoted strings cannot span lines
const type = (t) => (/^\w+(\(\s*\d+\s*(,\s*\d+\s*)?\))?(\[\])?$/.test(t) ? t : `"${t.replaceAll('"', '\\"')}"`);
const mstr = (s) => `'''\n${String(s).replaceAll("'''", "'' '")}\n'''`; // multi-line note
const expr = (s) => `\`${String(s).replaceAll('`', "'").replace(/\s*[\r\n]+\s*/g, ' ')}\``;
const col = (c) => (/^[A-Za-z_]\w*$/.test(c) || /^"[^"]+"$/.test(c) ? c : expr(c));
const tn = (t) => `${id(t.schema)}.${id(t.name)}`;
export const ACTION = { a: 'no action', r: 'restrict', c: 'cascade', n: 'set null', d: 'set default' };

// DBML has no view/trigger/sequence: a view is a Table whose note holds `VIEW` / `MATERIALIZED VIEW` (the UI marks it "· View") and, with `ddl`, the full
// CREATE statement that builds it; without `ddl` only the structure (columns, types, indexes) is written. Triggers go in their table's note; so does a sequence that a table
// uses (a column default, a trigger): a `SEQUENCES` section. A sequence that none of the imported tables uses is a standalone Note

export function toDbml({ tables, refs, enums = [], sequences = [], lineage = [] }, { ddl = false } = {}) {
  const out = [];
  const enumTypes = new Set(enums.flatMap((e) => [`${e.schema}.${e.name}`, e.name]));
  for (const e of enums) out.push(`Enum ${tn(e)} {`, ...e.values.map((v) => `  ${id(v)}`), '}', '');
  const seqLine = (q, u) => `${q.schema}.${q.name}${u.columns.length ? ` (${u.columns.join(', ')})` : ''}: ${q.desc}${q.comment ? ` — ${q.comment.replace(/\s+/g, ' ')}` : ''}`;
  const seqOf = new Map(); // "schema.table" -> lines of the sequences it uses
  const tableKeys = new Set(tables.map((t) => `${t.schema}.${t.name}`));
  for (const q of sequences) for (const u of q.usedBy ?? []) if (tableKeys.has(`${u.schema}.${u.name}`)) { const k = `${u.schema}.${u.name}`; seqOf.set(k, [...(seqOf.get(k) ?? []), seqLine(q, u)]); }
  const loose = sequences.filter((q) => !(q.usedBy ?? []).some((u) => tableKeys.has(`${u.schema}.${u.name}`)));
  for (const t of tables) {
    const single = t.pk.length === 1 ? t.pk[0] : null;
    const parts = [t.comment, t.view != null && `${t.viewKind || 'VIEW'}${ddl ? `\nCREATE ${t.viewKind || 'VIEW'} ${tn(t)} AS\n${t.view.trim().replace(/;?$/, ';')}` : ''}`, t.triggers?.length && `TRIGGERS\n${t.triggers.map((g) => `${g.name}: ${g.def}`).join('\n')}`].filter(Boolean);
    const seqs = seqOf.get(`${t.schema}.${t.name}`) ?? [];
    if (seqs.length) parts.push(`SEQUENCES\n${seqs.join('\n')}`);
    const note = parts.length ? (parts.length === 1 && t.view == null && !t.triggers?.length && !seqs.length ? str(t.comment) : mstr(parts.join('\n\n'))) : '';
    const attrs = [note && `note: ${note}`].filter(Boolean);
    out.push(`Table ${tn(t)}${attrs.length ? ` [${attrs.join(', ')}]` : ''} {`);
    for (const c of t.columns) {
      const s = [];
      if (c.name === single) s.push('pk');
      if (!c.nullable && c.name !== single) s.push('not null');
      if (c.default != null && String(c.default).trim() !== '') s.push(`default: ${expr(String(c.default).trim())}`);
      if (c.comment) s.push(`note: ${str(c.comment)}`);
      out.push(`  ${id(c.name)} ${enumTypes.has(c.type) ? c.type.split('.').map(id).join('.') : type(c.type)}${s.length ? ` [${s.join(', ')}]` : ''}`);
    }
    const idx = [];
    if (t.pk.length > 1) idx.push(`    (${t.pk.map(id).join(', ')}) [pk]`);
    for (const i of t.indexes) {
      const cols = i.columns.map(col);
      const s = [i.unique && 'unique', `name: ${str(i.name)}`, ['hash', 'btree'].includes(i.type?.toLowerCase()) && `type: ${i.type.toLowerCase()}`].filter(Boolean);
      idx.push(`    ${cols.length > 1 ? `(${cols.join(', ')})` : cols[0]} [${s.join(', ')}]`);
    }
    if (idx.length) out.push('', '  indexes {', ...idx, '  }');
    out.push('}', '');
  }
  for (const r of refs) {
    const side = (t) => `${tn(t)}.${t.columns.length > 1 ? `(${t.columns.map(id).join(', ')})` : id(t.columns[0])}`;
    const s = [];
    if (r.onDelete && r.onDelete !== 'no action') s.push(`delete: ${r.onDelete}`);
    if (r.onUpdate && r.onUpdate !== 'no action') s.push(`update: ${r.onUpdate}`);
    out.push(`Ref ${id(r.name)}: ${side(r.from)} > ${side(r.to)}${s.length ? ` [${s.join(', ')}]` : ''}`);
  }
  // data lineage is not DBML: it is written as a comment line that other DBML tools ignore, and OpenDiagram reads back. `(auto)` marks lines generated from the catalog: a refresh rewrites them and keeps the ones written by hand (`// lineage: target <- source(col, col), source`)
  if (lineage.length) out.push('');
  for (const l of lineage) {
    if (l.sources.length) out.push(`// lineage(auto): ${tn(l.target)} <- ${l.sources.map((s) => `${tn(s)}${s.columns?.length ? `(${s.columns.map(id).join(', ')})` : ''}`).join(', ')}`);
    for (const c of l.columns ?? []) out.push(`// lineage(auto): ${tn(l.target)}.${id(c.column)} <- ${c.from.map((f) => `${tn(f)}.${id(f.column)}`).join(', ')}`); // column mapping read from the view's SQL
  }
  for (const q of loose) out.push('', `Note ${id(`${q.schema}.${q.name}`)} {`, `  ${mstr(`SEQUENCE ${q.schema}.${q.name}: ${q.desc}${q.comment ? `\n${q.comment}` : ''}`)}`, '}');
  return out.join('\n') + '\n';
}
