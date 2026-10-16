// The table selection of a diagram, as ONE explicit value (see .specs/12-table-selection.md).
//
//   { mode: 'all', tables: [] }     every table of the chosen schemas, including the ones the database gets later
//   { mode: 'list', tables: [...] } exactly these ('schema.table')
//
// The stored form (diagrams.source.tables, connections.tables, the import request) is a plain list where `[]` means "all". That convention exists only here:
// everything else works with the value above and converts at the edges with fromStored / toStored. Pure functions, no React.

export const ALL = Object.freeze({ mode: 'all', tables: Object.freeze([]) });

export const fromStored = (list) => (Array.isArray(list) && list.length ? { mode: 'list', tables: [...new Set(list)] } : ALL);
export const toStored = (sel) => (sel.mode === 'list' ? [...sel.tables] : []);
export const isAll = (sel) => sel.mode === 'all';

// What the picker shows ticked when it opens.
//   list                         -> those tables
//   all, already imported before -> every table: "all" is a decision, so it is visible
//   all, first import            -> nothing ticked (and nothing ticked still means all): somebody who wants 5 of 800 tables must not have to clear 795 ticks
export function ticked(sel, items, imported) {
  const names = items.map((i) => i.name);
  if (sel.mode === 'list') { const have = new Set(names); return new Set(sel.tables.filter((t) => have.has(t))); }
  return new Set(imported ? names : []);
}
// tables of a list selection that the database no longer has (shown as a warning; they are dropped when the selection is applied)
export function missing(sel, items) {
  if (sel.mode !== 'list') return [];
  const have = new Set(items.map((i) => i.name));
  return sel.tables.filter((t) => !have.has(t));
}

// The selection the ticks mean. `grouped` = tables that are in a TableGroup: a grouped table is an imported table, whatever the ticks say.
//   nothing ticked and nothing grouped -> all
//   every table ticked, and the selection was "all" when the picker opened -> all (the person did not narrow it)
//   anything else -> exactly the ticked and grouped tables
export function fromTicks(tick, items, { wasAll = false, grouped = [] } = {}) {
  const have = new Set(items.map((i) => i.name));
  const tables = new Set([...tick, ...grouped].filter((t) => have.has(t)));
  if (!tables.size) return ALL;
  if (wasAll && tables.size === have.size) return ALL;
  return { mode: 'list', tables: [...tables] };
}

// Adding tables to a group ticks them, in the same step and whatever was ticked before (also when nothing was ticked)
export const withGrouped = (tick, names) => new Set([...tick, ...names]);

// text of the button in the Database drawer
export const summary = (sel, nGroups = 0) => (sel.mode === 'list' ? `${sel.tables.length} table(s) selected${nGroups ? ` · ${nGroups} group(s)` : ''} — change…` : 'All tables — choose specific ones…');
// footer of the picker
export function footer(tick, items, { wasAll }) {
  if (wasAll && tick.size === items.length) return `All ${items.length} selected = import all, tables the database gets later too`;
  return tick.size ? `${tick.size} selected of ${items.length}` : `Nothing selected = import all ${items.length}`;
}
