// Parsed DBML (@dbml/core Database) -> plain documentation model, plus Markdown rendering.
export const slug = (s) => `t_${String(s).replace(/\W+/g, '_')}`;
const tid = (schema, name) => `${schema || 'public'}.${name}`;
const defaultText = (d) => (!d ? '' : d.type === 'expression' ? `\`${d.value}\`` : d.type === 'string' ? `'${d.value}'` : String(d.value));

// lineage: edges from lineageEdges() ({ source, target, sCols, tCols }); each table gets `builtFrom` (its sources) and `feeds` (what is built from it)
export function buildModel(db, lineage = []) {
  const tables = db.schemas.flatMap((s) => s.tables).map((t) => ({
    id: tid(t.schema.name, t.name), schema: t.schema.name, name: t.name, note: t.note || '', color: t.headerColor || '',
    fields: t.fields.map((f) => ({
      name: f.name, type: f.type.type_name, pk: !!f.pk, notNull: !!f.not_null, unique: !!f.unique, increment: !!f.increment,
      default: defaultText(f.dbdefault), note: f.note || '', refs: [],
    })),
    indexes: t.indexes.map((i) => ({ name: i.name || '', unique: !!i.unique, pk: !!i.pk, type: i.type || '', cols: i.columns.map((c) => c.value) })),
    incoming: [], groups: [], builtFrom: [], feeds: [],
  }));
  const byId = new Map(tables.map((t) => [t.id, t]));

  const refs = db.schemas.flatMap((s) => s.refs).map((r) => {
    const [a, b] = r.endpoints;
    const [child, parent] = a.relation === '*' || b.relation === '1' ? [a, b] : [b, a];
    return {
      name: r.name || '', card: `${child.relation}:${parent.relation}`, onDelete: r.onDelete || '', onUpdate: r.onUpdate || '',
      from: { id: tid(child.schemaName, child.tableName), cols: child.fieldNames }, to: { id: tid(parent.schemaName, parent.tableName), cols: parent.fieldNames },
    };
  });
  for (const r of refs) {
    const from = byId.get(r.from.id), to = byId.get(r.to.id);
    to?.incoming.push(r);
    r.from.cols.forEach((c, i) => from?.fields.find((f) => f.name === c)?.refs.push({ id: r.to.id, col: r.to.cols[i] ?? r.to.cols[0], card: r.card }));
  }

  for (const l of lineage) {
    byId.get(l.target)?.builtFrom.push({ id: l.source, cols: l.sCols, tCols: l.tCols, maps: l.maps });
    byId.get(l.source)?.feeds.push({ id: l.target, cols: l.sCols, tCols: l.tCols, maps: l.maps });
  }

  const groups = db.schemas.flatMap((s) => s.tableGroups || []).map((g) => ({
    name: g.name, color: g.color || '', note: g.note || '', tables: g.tables.map((t) => tid(t.schema?.name, t.name)).filter((id) => byId.has(id)),
  }));
  for (const g of groups) g.tables.forEach((id) => byId.get(id).groups.push(g.name));

  const enums = db.schemas.flatMap((s) => s.enums || []).map((e) => ({
    schema: e.schema?.name, name: e.name, note: e.note || '', values: e.values.map((v) => ({ name: v.name, note: v.note || '' })),
  }));
  return { name: db.name || '', note: db.note || '', databaseType: db.databaseType || '', tables, refs, groups, enums, lineage, byId };
}

// "orders (id, total)" / "orders.total -> v.total" text for a lineage link
export const linkCols = (l) => (l.maps?.length ? ` (${l.maps.map((m) => `${m.s} -> ${m.t}`).join(', ')})` : l.cols?.length ? ` (${l.cols.join(', ')}${l.tCols?.length ? ` -> ${l.tCols.join(', ')}` : ''})` : '');
export const display = (t) => (t.schema && t.schema !== 'public' ? `${t.schema}.${t.name}` : t.name);
export const constraints = (f) => [f.pk && 'PK', f.notNull && !f.pk && 'NN', f.unique && 'UQ', f.increment && 'AI'].filter(Boolean);

// sidebar/content order: grouped tables first (in group order), then the rest
export function ordered(model) {
  const seen = new Set();
  const sections = model.groups.map((g) => ({ title: g.name, color: g.color, note: g.note, tables: g.tables.map((id) => model.byId.get(id)).filter(Boolean) }));
  sections.forEach((s) => s.tables.forEach((t) => seen.add(t.id)));
  const rest = model.tables.filter((t) => !seen.has(t.id));
  if (rest.length) sections.push({ title: model.groups.length ? 'Other tables' : 'Tables', color: '', note: '', tables: rest });
  return sections;
}

const esc = (s) => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');

export function toMarkdown(model, title, commentList = [], changelog = []) {
  const byKey = new Map();
  for (const c of commentList) byKey.set(c.key, [...(byKey.get(c.key) || []), c]);
  const flat = (k) => (byKey.get(k) || []).map((c) => `${c.author}: ${c.text}`.replaceAll('\n', ' ')).join(' / ');
  const out = [`# ${title || model.name || 'Database documentation'}`, ''];
  if (model.databaseType) out.push(`*Database: ${model.databaseType}*`, '');
  if (model.note) out.push(`> ${model.note.replaceAll('\n', '\n> ')}`, '');
  out.push(`${model.tables.length} tables · ${model.refs.length} relationships · ${model.enums.length} enums${model.lineage.length ? ` · ${model.lineage.length} lineage links` : ''}`, '');
  for (const c of byKey.get('__project') || []) out.push(`> **Comment (${c.author}):** ${c.text.replaceAll('\n', ' ')}`, '');
  for (const sec of ordered(model)) {
    out.push(`## ${sec.title}`, '');
    if (sec.note) out.push(sec.note, '');
    for (const t of sec.tables) {
      out.push(`### ${display(t)}`, '');
      if (t.note) out.push(t.note, '');
      for (const c of byKey.get(t.id) || []) out.push(`> **Comment (${c.author}):** ${c.text.replaceAll('\n', ' ')}`, '');
      const withCmt = t.fields.some((f) => byKey.has(`${t.id}.${f.name}`));
      out.push(`| Column | Type | Constraints | Default | References | Note |${withCmt ? ' Comment |' : ''}`, `|---|---|---|---|---|---|${withCmt ? '---|' : ''}`);
      for (const f of t.fields) {
        out.push(`| \`${esc(f.name)}\` | ${esc(f.type)} | ${constraints(f).join(', ')} | ${f.default ? `\`${esc(f.default)}\`` : ''} | ${f.refs.map((r) => `${display(model.byId.get(r.id) ?? { name: r.id })}.${r.col} (${r.card})`).join(', ')} | ${esc(f.note)} |${withCmt ? ` ${esc(flat(`${t.id}.${f.name}`))} |` : ''}`);
      }
      out.push('');
      if (t.indexes.length) {
        out.push('**Indexes**', '');
        t.indexes.forEach((i) => out.push(`- ${i.pk ? 'PRIMARY KEY' : i.unique ? 'UNIQUE' : 'INDEX'} (${i.cols.join(', ')})${i.name ? ` — ${i.name}` : ''}`));
        out.push('');
      }
      if (t.builtFrom.length) {
        out.push('**Built from** (data lineage)', '');
        t.builtFrom.forEach((l) => out.push(`- ${display(model.byId.get(l.id) ?? { name: l.id })}${linkCols(l)}`));
        out.push('');
      }
      if (t.feeds.length) {
        out.push('**Feeds** (data lineage)', '');
        t.feeds.forEach((l) => out.push(`- ${display(model.byId.get(l.id) ?? { name: l.id })}`));
        out.push('');
      }
      if (t.incoming.length) {
        out.push('**Referenced by**', '');
        t.incoming.forEach((r) => out.push(`- ${display(model.byId.get(r.from.id) ?? { name: r.from.id })}.${r.from.cols.join(', ')} (${r.card})${r.onDelete ? ` on delete ${r.onDelete}` : ''}`));
        out.push('');
      }
    }
  }
  if (changelog.length) {
    out.push('## Changelog', '');
    for (const v of changelog) out.push(`- **${v.label || `Version ${v.version}`}** — ${v.author || 'Original'}, ${new Date(v.savedAt * 1000).toLocaleString()}: ${esc(v.summary)}`);
    out.push('');
  }
  if (model.enums.length) {
    out.push('## Enums', '');
    for (const e of model.enums) {
      out.push(`### ${e.name}`, '');
      if (e.note) out.push(e.note, '');
      e.values.forEach((v) => out.push(`- \`${v.name}\`${v.note ? ` — ${v.note}` : ''}`));
      out.push('');
    }
  }
  return `${out.join('\n')}\n`;
}
