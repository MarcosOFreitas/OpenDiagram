// A realistic synthetic schema of n tables for the stress measurements (tools/benchclient.mjs): three schemas, a TableGroup per
// eight tables with a colour, enums, 5 to 16 columns of mixed types, defaults, notes, composite and unique indexes, one or two
// foreign keys per table, a junction table (N:N) every tenth, data lineage comments and two sticky notes. Deterministic: the same n
// gives the same text, so runs can be compared.
//   node tools/stressdbml.mjs 100 > stress-100.dbml        writes one, to import by hand (Import -> DBML)
const COLORS = ['#3498DB', '#27AE60', '#E67E22', '#8E44AD', '#C0392B', '#16A085', '#D35400', '#2C3E50'];
const SCHEMAS = ['sales', 'catalog', 'ops'];
const TYPES = ['varchar(120)', 'integer', 'decimal(12,2)', 'timestamp', 'boolean', 'text', 'date', 'bigint', 'char(2)', 'uuid'];

export function stressDbml(n) {
  let seed = n * 7919;
  const rnd = (k) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; }; // small LCG: repeatable
  const tables = Array.from({ length: n }, (_, i) => ({ i, schema: SCHEMAS[i % 3], name: `${['order', 'item', 'customer', 'stock', 'invoice', 'ticket', 'route', 'price'][i % 8]}_${i}`, junction: i > 1 && i % 10 === 0 }));
  const full = (t) => `${t.schema}.${t.name}`;
  const out = ['Project stress {', `  database_type: 'PostgreSQL'`, `  Note: 'Synthetic schema of ${n} tables for the stress measurements'`, '}', ''];
  for (const s of SCHEMAS) out.push(`Enum ${s}.status {`, '  active', '  paused [note: \'kept but not used\']', '  closed', '}', '');
  const refs = [];
  for (const t of tables) {
    const cols = ['  id bigint [pk, increment]'];
    const parents = t.i === 0 ? [] : t.junction ? [tables[t.i - 1], tables[rnd(t.i - 1)]] : [tables[rnd(t.i)], ...(rnd(3) === 0 && t.i > 2 ? [tables[rnd(t.i)]] : [])];
    const seen = new Set();
    for (const p of parents) {
      if (seen.has(p.i)) continue; seen.add(p.i);
      cols.push(`  ${p.name}_id bigint [not null]`);
      refs.push(`Ref: ${full(t)}.${p.name}_id > ${full(p)}.id${rnd(4) === 0 ? ' [delete: cascade]' : ''}`);
    }
    const extra = t.junction ? 1 : 4 + rnd(12);
    for (let c = 0; c < extra; c++) {
      const ty = TYPES[rnd(TYPES.length)];
      const opts = [rnd(3) === 0 && 'not null', ty === 'timestamp' && rnd(2) === 0 && 'default: `now()`', ty === 'boolean' && 'default: true', rnd(9) === 0 && `note: 'column ${c} of ${t.name}'`].filter(Boolean);
      cols.push(`  col_${c} ${ty}${opts.length ? ` [${opts.join(', ')}]` : ''}`);
    }
    cols.push(`  status ${t.schema}.status [not null, default: 'active']`);
    const idx = [];
    if (rnd(3) === 0) idx.push('    (status, col_0) [name: \'ix_' + t.name + '_status\']');
    if (rnd(5) === 0) idx.push('    col_0 [unique]');
    out.push(`Table ${full(t)}${rnd(4) === 0 ? ` [headercolor: ${COLORS[rnd(COLORS.length)]}]` : ''} {`, ...cols, ...(idx.length ? ['', '  indexes {', ...idx, '  }'] : []), ...(rnd(4) === 0 ? [`  Note: 'Table ${t.name}: ${t.junction ? 'links two tables (N:N)' : 'part of the ' + t.schema + ' domain'}'`] : []), '}', '');
  }
  out.push(...refs, '');
  for (let g = 0; g * 8 < n; g++) out.push(`TableGroup group_${g} [color: ${COLORS[g % COLORS.length]}] {`, ...tables.slice(g * 8, g * 8 + 8).map((t) => `  ${full(t)}`), '}', '');
  for (let l = 1; l * 25 < n; l++) out.push(`// lineage: ${full(tables[l * 25])} <- ${full(tables[l * 25 - 1])}, ${full(tables[l * 25 - 2])}`);
  out.push('', "Note stress_tip {\n  '''\n  Synthetic diagram: drag me, the tables do not mind.\n  '''\n}", "Note stress_scale {\n  '''\n  " + n + " tables\n  '''\n}", '');
  return out.join('\n');
}

if (process.argv[1]?.endsWith('stressdbml.mjs')) {
  const n = +process.argv[2];
  if (n > 0) process.stdout.write(stressDbml(n));
}
