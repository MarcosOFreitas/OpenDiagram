// Column lineage of views: which source columns each output column of a view is computed from, found by parsing the view's SQL text.
// The parser is PostgreSQL's grammar (pgsql-ast-parser); it also reads most Oracle view queries. Anything it cannot read (Oracle (+) joins,
// CONNECT BY, ...) simply gets no column mapping: the table-level lineage from the catalog stays. Only the SQL text of the view is read, never table data.
import { parse } from 'pgsql-ast-parser';

const MAX_SQL = 20_000; // the grammar is slow on huge statements: those are skipped
const lc = (s) => String(s ?? '').toLowerCase();

// catalog: Map(lowercase 'schema.name' -> { schema, name, columns: [names] }). Returns Map(lowercase output column -> Map(srcKey -> { schema, name, column })) or null.
export function columnSources(sql, catalog, schema) {
  if (!sql || sql.length > MAX_SQL) return null;
  let ast;
  try { [ast] = parse(sql); } catch { return null; }
  if (!ast) return null;
  const byName = new Map(); // table name without schema -> entries, for unqualified names
  for (const t of catalog.values()) { const k = lc(t.name); byName.set(k, [...(byName.get(k) || []), t]); }
  const findTable = (sc, name) => catalog.get(`${lc(sc || schema)}.${lc(name)}`) ?? (sc ? null : (byName.get(lc(name)) || []).find((t) => lc(t.schema) === 'public') ?? (byName.get(lc(name)) || [])[0] ?? null);
  const add = (m, key, src) => { if (!m.has(key)) m.set(key, src); };
  const baseCols = (t) => new Map(t.columns.map((c) => [lc(c), new Map([[`${t.schema}.${t.name}.${c}`, { schema: t.schema, name: t.name, column: c }]])]));

  // a statement -> [{ name, src: Map }] in output order; ctes: Map(name -> that result)
  function result(st, ctes, outer) {
    if (!st) return null;
    if (st.type === 'with') {
      const c = new Map(ctes);
      for (const b of st.bind || []) { const r = result(b.statement, c, outer); if (!r) return null; c.set(lc(b.alias?.name), r); }
      return result(st.in, c, outer);
    }
    if (st.type === 'union' || st.type === 'union all') { // columns by position: names of the left side, sources of both
      const l = result(st.left, ctes, outer), r = result(st.right, ctes, outer);
      if (!l || !r || l.length !== r.length) return null;
      return l.map((c, i) => { const m = new Map(c.src); for (const [k, v] of r[i].src) add(m, k, v); return { name: c.name, src: m }; });
    }
    if (st.type === 'values' || st.type !== 'select') return null;
    const scope = []; // { alias, cols: Map(lowercase column -> src Map) | null (unknown) }
    for (const f of st.from || []) {
      if (f.type === 'table') {
        const n = f.name, alias = lc(n.alias || n.name), cte = !n.schema && ctes.get(lc(n.name));
        if (cte) scope.push({ alias, cols: new Map(cte.map((c) => [lc(c.name), c.src])) });
        else { const t = findTable(n.schema, n.name); scope.push({ alias, cols: t ? baseCols(t) : null }); }
      } else if (f.type === 'statement') {
        const r = result(f.statement, ctes, scope);
        scope.push({ alias: lc(f.alias), cols: r ? new Map(r.map((c) => [lc(c.name), c.src])) : null });
      } else scope.push({ alias: lc(f.alias || ''), cols: null }); // function in FROM, VALUES, ...
    }
    const chain = [scope, ...(outer ? [outer] : [])];
    const lookup = (table, col) => {
      for (const sc of chain) {
        const hits = sc.filter((e) => e.cols && (table ? e.alias === lc(table.name) : e.cols.has(lc(col)))).map((e) => e.cols.get(lc(col))).filter(Boolean);
        if (hits.length) return hits;
      }
      return [];
    };
    const refs = (node, into) => { // every column reference inside an expression (scalar sub-selects included, resolved with the outer scope)
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach((x) => refs(x, into)); return; }
      if (node.type === 'ref' && node.name !== '*') { for (const m of lookup(node.table, node.name)) for (const [k, v] of m) add(into, k, v); return; }
      if (node.type === 'select' || node.type === 'union' || node.type === 'union all' || node.type === 'with') { (result(node, ctes, chain.flat()) || []).forEach((c) => c.src.forEach((v, k) => add(into, k, v))); return; }
      for (const v of Object.values(node)) refs(v, into);
    };
    const out = [];
    for (const c of st.columns || []) {
      if (c.expr.type === 'ref' && c.expr.name === '*') { // * and t.*: every column of those sources
        const hit = scope.filter((e) => e.cols && (!c.expr.table || e.alias === lc(c.expr.table.name)));
        if (!hit.length || scope.some((e) => !e.cols && (!c.expr.table || e.alias === lc(c.expr.table.name)))) return null; // a source we cannot expand
        for (const e of hit) for (const [name, src] of e.cols) out.push({ name, src });
        continue;
      }
      const src = new Map();
      refs(c.expr, src);
      out.push({ name: c.alias?.name ?? (c.expr.type === 'ref' ? c.expr.name : ''), src });
    }
    return out;
  }

  let r;
  try { r = result(ast, new Map(), null); } catch { return null; }
  if (!r) return null;
  const map = new Map();
  for (const c of r) if (c.name && c.src.size && !map.has(lc(c.name))) map.set(lc(c.name), c.src);
  return map.size ? map : null;
}

// model tables ([{ schema, name, columns: [names], view }]) -> [{ target: { schema, name }, columns: [{ column, from: [{ schema, name, column }] }] }] for every view whose SQL could be read
export function viewColumnLineage(tables, budgetMs = 8000) {
  const catalog = new Map(tables.map((t) => [`${lc(t.schema)}.${lc(t.name)}`, t]));
  const t0 = Date.now(), out = [];
  for (const t of tables) {
    if (!t.view || Date.now() - t0 > budgetMs) continue; // time budget: a huge schema does not stall the import
    const m = columnSources(t.view, catalog, t.schema);
    if (!m) continue;
    const columns = [];
    for (const col of t.columns) {
      const src = m.get(lc(col));
      if (!src) continue;
      const from = [...src.values()].filter((s) => !(lc(s.schema) === lc(t.schema) && lc(s.name) === lc(t.name)));
      if (from.length) columns.push({ column: col, from });
    }
    if (columns.length) out.push({ target: { schema: t.schema, name: t.name }, columns });
  }
  return out;
}
