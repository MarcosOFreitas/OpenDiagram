// The structural diff between two versions of a diagram (.specs/09-accounts-sharing.md, history). Pure, no imports: the History dialog of the
// web imports it from here, and the server uses it for the summary of a refresh (merge.js structural).
// In: two parsed @dbml/core Database objects (before, after). Out: changes { op: '+' | '-' | '~', kind, table, name, from, to, details }.
// Identity is by name (a rename is a removal plus an addition: never guessed); indexes by their columns and uniqueness, relationships by
// their two ends, checks by name or else by expression. Only what an ALTER would change counts: TableGroups, colours, positions, sticky
// notes, lineage comments and the Project block do not. Notes count as "note changed", without their text.

const label = (id) => (id.startsWith('public.') ? id.slice(7) : id);
const typeOf = (t) => `${t.schemaName ? `${t.schemaName}.` : ''}${t.type_name}`;
const defaultOf = (d) => (!d ? '' : d.type === 'expression' ? `\`${d.value}\`` : d.type === 'string' ? `'${d.value}'` : String(d.value));
const colOf = (c) => (c.type === 'expression' ? `\`${c.value}\`` : c.value);
const cols = (names) => (names.length === 1 ? names[0] : `(${names.join(', ')})`);
const symbol = (a, b) => (a === '*' && b === '*' ? '<>' : a === '1' && b === '1' ? '-' : '>');

function snapshot(db) {
  const tables = new Map(), enums = new Map();
  for (const s of db.schemas) {
    for (const e of s.enums) enums.set(`${s.name}.${e.name}`, e.values.map((v) => v.name));
    for (const t of s.tables) {
      const pkIndex = t.indexes.find((i) => i.pk);
      const checks = [...(t.checks || []), ...t.fields.flatMap((f) => f.checks || [])].map((c) => [c.name || c.expression, { name: c.name || '', expr: c.expression }]);
      tables.set(`${t.schema.name}.${t.name}`, {
        note: t.note || '',
        pk: pkIndex ? pkIndex.columns.map(colOf) : t.fields.filter((f) => f.pk).map((f) => f.name),
        columns: new Map(t.fields.map((f) => [f.name, { type: typeOf(f.type), notNull: !!f.not_null, unique: !!f.unique, increment: !!f.increment, default: defaultOf(f.dbdefault), note: f.note || '' }])),
        indexes: new Map(t.indexes.filter((i) => !i.pk).map((i) => [`${i.unique ? 'unique ' : ''}index (${i.columns.map(colOf).join(', ')})`, { name: i.name || '', type: i.type || '', note: i.note || '' }])),
        checks: new Map(checks),
        refs: new Map(),
      });
    }
  }
  // a relationship belongs to its referencing (many) side; one-to-one keeps the order it was written in
  for (const r of db.schemas.flatMap((s) => s.refs)) {
    const [a, b] = r.endpoints, [child, parent] = a.relation === '*' || b.relation === '1' ? [a, b] : [b, a];
    const end = (e) => `${e.schemaName || 'public'}.${e.tableName}`;
    const ends = [`${label(end(child))}.${cols(child.fieldNames)}`, `${label(end(parent))}.${cols(parent.fieldNames)}`];
    tables.get(end(child))?.refs.set(ends.join(' | '), { ends, card: symbol(child.relation, parent.relation), name: r.name || '', onDelete: r.onDelete || '', onUpdate: r.onUpdate || '' });
  }
  return { tables, enums };
}

// the keys of a map in the order of `before`, then the new ones in the order of `after`
const keysOf = (before, after) => [...before.keys(), ...[...after.keys()].filter((k) => !before.has(k))];
const was = (a, b, text) => (a === b ? [] : [text(a, b)]);

function tableChanges(id, a, b) {
  const out = [], push = (c) => out.push({ table: id, ...c });
  if (a.note !== b.note) push({ op: '~', kind: 'note', name: '' });
  for (const name of keysOf(a.columns, b.columns)) {
    const x = a.columns.get(name), y = b.columns.get(name);
    if (!y) push({ op: '-', kind: 'column', name, from: x });
    else if (!x) push({ op: '+', kind: 'column', name, to: y });
    else {
      const details = [
        ...was(x.type, y.type, (p, q) => `type ${p} → ${q}`),
        ...was(x.notNull, y.notNull, (p, q) => `${p ? 'not null' : 'null'} → ${q ? 'not null' : 'null'}`),
        ...was(x.default, y.default, (p, q) => `default ${p || 'none'} → ${q || 'none'}`),
        ...was(x.unique, y.unique, (p, q) => `${p ? 'unique' : 'not unique'} → ${q ? 'unique' : 'not unique'}`),
        ...was(x.increment, y.increment, (p, q) => `${p ? 'auto-increment' : 'no auto-increment'} → ${q ? 'auto-increment' : 'no auto-increment'}`),
        ...was(x.note, y.note, () => 'note changed'),
      ];
      if (details.length) push({ op: '~', kind: 'column', name, from: x, to: y, details });
    }
  }
  const pa = a.pk.join(', '), pb = b.pk.join(', ');
  if (pa !== pb) push({ op: !pa ? '+' : !pb ? '-' : '~', kind: 'pk', name: '', from: a.pk, to: b.pk });
  for (const name of keysOf(a.indexes, b.indexes)) {
    const x = a.indexes.get(name), y = b.indexes.get(name);
    if (!y) push({ op: '-', kind: 'index', name, from: x });
    else if (!x) push({ op: '+', kind: 'index', name, to: y });
    else {
      const details = [...was(x.name, y.name, (p, q) => `name ${p || 'none'} → ${q || 'none'}`), ...was(x.type, y.type, (p, q) => `type ${p || 'none'} → ${q || 'none'}`), ...was(x.note, y.note, () => 'note changed')];
      if (details.length) push({ op: '~', kind: 'index', name, from: x, to: y, details });
    }
  }
  for (const key of keysOf(a.refs, b.refs)) {
    const x = a.refs.get(key), y = b.refs.get(key);
    if (!y) push({ op: '-', kind: 'ref', name: key, from: x });
    else if (!x) push({ op: '+', kind: 'ref', name: key, to: y });
    else {
      const details = [
        ...was(x.name, y.name, (p, q) => `name ${p || 'none'} → ${q || 'none'}`),
        ...was(x.card, y.card, (p, q) => `cardinality ${p} → ${q}`),
        ...was(x.onDelete, y.onDelete, (p, q) => `on delete ${p || 'no action'} → ${q || 'no action'}`),
        ...was(x.onUpdate, y.onUpdate, (p, q) => `on update ${p || 'no action'} → ${q || 'no action'}`),
      ];
      if (details.length) push({ op: '~', kind: 'ref', name: key, from: x, to: y, details });
    }
  }
  for (const key of keysOf(a.checks, b.checks)) {
    const x = a.checks.get(key), y = b.checks.get(key);
    if (!y) push({ op: '-', kind: 'check', name: key, from: x });
    else if (!x) push({ op: '+', kind: 'check', name: key, to: y });
    else if (x.expr !== y.expr) push({ op: '~', kind: 'check', name: key, from: x, to: y });
  }
  return out;
}

export function schemaDiff(beforeDb, afterDb) {
  const a = snapshot(beforeDb), b = snapshot(afterDb), out = [];
  for (const id of keysOf(a.tables, b.tables)) {
    const x = a.tables.get(id), y = b.tables.get(id);
    if (!y) out.push({ op: '-', kind: 'table', table: id, name: id });
    else if (!x) out.push({ op: '+', kind: 'table', table: id, name: id });
    else out.push(...tableChanges(id, x, y));
  }
  for (const id of keysOf(a.enums, b.enums)) {
    const x = a.enums.get(id), y = b.enums.get(id);
    if (!y) out.push({ op: '-', kind: 'enum', table: null, name: id, from: x });
    else if (!x) out.push({ op: '+', kind: 'enum', table: null, name: id, to: y });
    else if (x.join('\n') !== y.join('\n')) out.push({ op: '~', kind: 'enum', table: null, name: id, from: x, to: y });
  }
  return out;
}

// one line of text per change (depth 1 = inside its table)
function describe(c) {
  const s = c.to ?? c.from;
  switch (c.kind) {
    case 'table': return label(c.name);
    case 'note': return 'note changed';
    case 'column': return c.op === '~' ? `column ${c.name}: ${c.details.join('; ')}` : c.op === '-' ? `column ${c.name}` : `column ${c.name} ${s.type}${s.notNull ? ' not null' : ''}${s.unique ? ' unique' : ''}${s.increment ? ' auto-increment' : ''}${s.default ? ` default ${s.default}` : ''}`;
    case 'pk': return c.op === '~' ? `primary key (${c.from.join(', ')}) → (${c.to.join(', ')})` : `primary key (${(c.op === '+' ? c.to : c.from).join(', ')})`;
    case 'index': return c.op === '~' ? `${c.name}: ${c.details.join('; ')}` : c.name;
    case 'ref': return `relationship ${s.ends[0]} ${s.card} ${s.ends[1]}${c.op === '~' ? `: ${c.details.join('; ')}` : ''}`;
    case 'check': return c.op === '~' ? `check ${c.from.name}: ${c.from.expr} → ${c.to.expr}` : `check${s.name ? ` ${s.name}` : ''}: ${s.expr}`;
    case 'enum': {
      if (c.op !== '~') return `enum ${label(c.name)}`;
      const added = c.to.filter((v) => !c.from.includes(v)), removed = c.from.filter((v) => !c.to.includes(v));
      return `enum ${label(c.name)}: ${[...added.map((v) => `+ ${v}`), ...removed.map((v) => `- ${v}`)].join('; ') || 'order of the values changed'}`;
    }
    default: return c.name;
  }
}

// the changes as lines for a list: tables by name (a table that changed inside gets a "~" line, then its changes), then the enums
export function diffLines(changes) {
  const byTable = new Map();
  for (const c of changes) if (c.table) { if (!byTable.has(c.table)) byTable.set(c.table, []); byTable.get(c.table).push(c); }
  const out = [];
  for (const id of [...byTable.keys()].sort((p, q) => label(p).localeCompare(label(q)))) {
    const list = byTable.get(id), whole = list.find((c) => c.kind === 'table');
    if (whole) { out.push({ op: whole.op, depth: 0, text: label(id) }); continue; }
    out.push({ op: '~', depth: 0, text: label(id) });
    for (const c of list) out.push({ op: c.op, depth: 1, text: describe(c) });
  }
  for (const c of changes.filter((x) => x.kind === 'enum').sort((p, q) => label(p.name).localeCompare(label(q.name)))) out.push({ op: c.op, depth: 0, text: describe(c) });
  return out;
}

// "2 tables added, 1 table removed, 3 tables changed, 1 enum changed"
export function summaryLine(changes) {
  const n = (k, op) => changes.filter((c) => c.kind === k && c.op === op).length;
  const whole = new Set(changes.filter((c) => c.kind === 'table').map((c) => c.table));
  const changed = new Set(changes.filter((c) => c.table && !whole.has(c.table)).map((c) => c.table)).size;
  const say = (count, what, how) => count && `${count} ${what}${count > 1 ? 's' : ''} ${how}`;
  const parts = [say(n('table', '+'), 'table', 'added'), say(n('table', '-'), 'table', 'removed'), say(changed, 'table', 'changed'), say(n('enum', '+'), 'enum', 'added'), say(n('enum', '-'), 'enum', 'removed'), say(n('enum', '~'), 'enum', 'changed')].filter(Boolean);
  return parts.length ? parts.join(', ') : 'No structural change';
}
