// model -> DBML. Single source of truth for the editor and the diagram.
const id = (s) => (/^[A-Za-z_]\w*$/.test(s) ? s : `"${s.replaceAll('"', '\\"')}"`);
const str = (s) => `'${String(s).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const type = (t) => (/^\w+(\(\s*\d+\s*(,\s*\d+\s*)?\))?(\[\])?$/.test(t) ? t : `"${t.replaceAll('"', '\\"')}"`);
const expr = (s) => `\`${String(s).replaceAll('`', "'")}\``;
const col = (c) => (/^[A-Za-z_]\w*$/.test(c) || /^"[^"]+"$/.test(c) ? c : expr(c));
const tn = (t) => `${id(t.schema)}.${id(t.name)}`;
export const ACTION = { a: 'no action', r: 'restrict', c: 'cascade', n: 'set null', d: 'set default' };

export function toDbml({ tables, refs }) {
  const out = [];
  for (const t of tables) {
    const single = t.pk.length === 1 ? t.pk[0] : null;
    out.push(`Table ${tn(t)}${t.comment ? ` [note: ${str(t.comment)}]` : ''} {`);
    for (const c of t.columns) {
      const s = [];
      if (c.name === single) s.push('pk');
      if (!c.nullable && c.name !== single) s.push('not null');
      if (c.default != null && String(c.default).trim() !== '') s.push(`default: ${expr(String(c.default).trim())}`);
      if (c.comment) s.push(`note: ${str(c.comment)}`);
      out.push(`  ${id(c.name)} ${type(c.type)}${s.length ? ` [${s.join(', ')}]` : ''}`);
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
  return out.join('\n') + '\n';
}
