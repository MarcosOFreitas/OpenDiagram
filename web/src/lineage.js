// Data lineage lives in the DBML text as comment lines (ignored by DBML parsers, kept in the single source of truth):
//   // lineage: sales.v_summary <- sales.orders, sales.order_items(order_id, qty)      table level (columns in parentheses = the ones used)
//   // lineage: sales.v_summary.total <- sales.orders.total, sales.order_items.price   column level (a column on both sides)
// The import writes `// lineage(auto): ...` lines; a refresh rewrites those and keeps the ones without `(auto)` (written by hand).
// A name is `table`, `schema.table`, `table.column` or `schema.table.column` (double quotes for odd names). Names that match no table are ignored.

const LINE = /^\s*\/\/\s*lineage(?:\s*\(auto\))?:\s*(.+?)\s*<-\s*(.+?)\s*$/i;
export const MANUAL = /^\s*\/\/\s*lineage:/i; // by hand (not `(auto)`)

// splits "a.b, c(d, e), f" at the commas that are outside parentheses
const splitTop = (s) => {
  const out = []; let depth = 0, cur = '', q = false;
  for (const ch of s) {
    if (ch === '"') q = !q;
    if (!q && ch === '(') depth++;
    if (!q && ch === ')') depth--;
    if (!q && depth === 0 && ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
};
const segments = (p) => [...p.matchAll(/"((?:[^"\\]|\\.)*)"|([^.\s"]+)/g)].map((m) => (m[1] ?? m[2]).replace(/\\"/g, '"'));
const parseRef = (s) => {
  const m = /^(.*?)\s*(?:\(([^)]*)\))?$/.exec(s);
  return { path: segments(m[1]), cols: m[2] ? splitTop(m[2]).map((c) => segments(c).join('.')) : [] };
};

// tables: [{ id: 'schema.name', schema, name, fields: [{ name }] }]. Returns [{ id, source, target, sCols, tCols, maps: [{ s, t }], manual }] (one per pair of tables; `maps` = column to column mappings)
export function lineageEdges(text, tables) {
  if (!/lineage(\s*\(auto\))?:/i.test(text)) return [];
  const byId = new Map(tables.map((t) => [t.id.toLowerCase(), t]));
  const byName = new Map();
  for (const t of tables) { const k = t.name.toLowerCase(); byName.set(k, byName.has(k) ? null : t); } // null = ambiguous without a schema
  const hasCol = (t, c) => t.fields.some((f) => f.name.toLowerCase() === c.toLowerCase());
  const find = (path) => { // -> { table, col } | null
    const p = path.map((x) => x.toLowerCase());
    const tryT = (parts) => (parts.length === 2 ? byId.get(parts.join('.')) : parts.length === 1 ? (byId.get(`public.${parts[0]}`) ?? byName.get(parts[0])) : null) ?? null;
    if (p.length === 1 || p.length === 2) { const t = tryT(p); if (t) return { table: t, col: '' }; }
    if (p.length === 2 || p.length === 3) { const t = tryT(p.slice(0, -1)); const c = path[path.length - 1]; if (t && hasCol(t, c)) return { table: t, col: t.fields.find((f) => f.name.toLowerCase() === c.toLowerCase()).name }; }
    return null;
  };
  const merged = new Map();
  text.split('\n').forEach((line) => {
    const m = LINE.exec(line);
    if (!m) return;
    const tgt = find(parseRef(m[1]).path);
    if (!tgt) return;
    for (const raw of splitTop(m[2])) {
      const ref = parseRef(raw), src = find(ref.path);
      if (!src || src.table.id === tgt.table.id) continue;
      const k = `${src.table.id}>${tgt.table.id}`;
      if (!merged.has(k)) merged.set(k, { id: `lin:${k}`, source: src.table.id, target: tgt.table.id, sCols: new Set(), tCols: new Set(), maps: new Map(), manual: false });
      const e = merged.get(k);
      [...ref.cols, ...(src.col ? [src.col] : [])].forEach((c) => e.sCols.add(c));
      if (tgt.col) e.tCols.add(tgt.col);
      if (tgt.col && src.col) e.maps.set(`${src.col}>${tgt.col}`, { s: src.col, t: tgt.col }); // output column <- source column: drawn column to column
      if (src.col || tgt.col) e.manual = true; // a column mapping was written by hand
    }
  });
  return [...merged.values()].map((e) => ({ ...e, sCols: [...e.sCols], tCols: [...e.tCols], maps: [...e.maps.values()] }));
}

// every table that feeds `id` (up) and every table `id` feeds (down), following the arrows through any number of steps
export function closure(edges, id) {
  const walk = (next) => { const seen = new Set(); const todo = [id]; while (todo.length) { const x = todo.pop(); for (const e of edges) { const y = next(e, x); if (y && y !== id && !seen.has(y)) { seen.add(y); todo.push(y); } } } return seen; };
  return { up: walk((e, x) => (e.target === x ? e.source : null)), down: walk((e, x) => (e.source === x ? e.target : null)) };
}
