# 12 — Table selection: bugs so far and the rules that stop them

**Status:** living; the structural fix recommended after the fourth bug is in (see "Where the logic lives now"). Written from the commits that fixed the earlier bugs (2026-10-16). Read it before changing the table picker (`web/src/TablePicker.jsx`), the connection flow (`web/src/useConnect.js`), `importModel` or the refresh.

## What "the selection" is

The set of tables a diagram imports, and refreshes. It is **not one value in one place**; today it lives in five:

| Where | What it holds | Written by | Read by |
|---|---|---|---|
| `TablePicker` state `sel` | the ticks in the dialog (a `Set` of `schema.table`) | the person | Apply |
| `useConnect` state `selection` (`{ mode, tables }`, `tableSelection.js`) | the list the Database drawer works with (`[]` = all) | `pick`, Apply | the picker, Import |
| `connections.tables` (server) | what the connection last imported | `persist` on Import | `pick` (personal connections only; a shared one is never saved) |
| `diagrams.source.tables` (server) | what **this diagram** imported | Import, scheduled refresh keeps it | refresh (manual and scheduled) |
| `importModel(c, schemas, tables)` | the filter applied to the catalog (`[]`/missing = all) | the request | the server |

And one rule that every place shares, written nowhere as a type: **an empty list means "all tables"** (new tables of the database are imported too), **a non-empty list means exactly those**.

Groups (`TableGroup` in the DBML) are a second, separate piece of state next to it: a group says how tables are drawn, never which are imported, except that a grouped table is imported too.

## The bugs

| # | Commit | Day | What the person saw | Root cause | Guarded by |
|---|---|---|---|---|---|
| 1 | `d39a92d` fix(web): group tables are chosen per group, independent of the import selection | 2026-10-14 | Creating a group **took the tables that were ticked for the import** and moved them into the group; the ticks were lost. | The new group reused the import selection as its own members: **two meanings, one state.** | the picker has a separate chooser per group (`gSel`) and `TablePicker.test.jsx` (groups tab) |
| 2 | `964e1c4` feat(web): Arrange treats each TableGroup as a block; grouped tables are auto-selected for import | 2026-10-14 | Not reported as a bug, but it **introduced one**: putting a table in a group ticks it for the import, **unless nothing is ticked** (`x.size ? ... : x`, with the comment "when nothing is ticked, *all* already includes it"). | The special case of the **empty = all** encoding: the code had to remember that an empty set is not empty. | nothing (this is the seed of #3) |
| 3 | `082bb66` fix(web): tables put in a group count as selected in the table picker | 2026-10-15 | Grouping tables **without ticking anything** imported **every table** of the database (the footer said "Nothing selected = import all", and the import did exactly that). | The same encoding: with nothing ticked, the group's tables were not ticked either, so the list sent was empty = all. | `behaviorcheck.mjs` scenario; `TablePicker.test.jsx` "groups count as selected" (`01e76f8`) |
| 4 | `1fee7c0` fix(web): editing the connection of a diagram imported with all tables showed every table unticked | 2026-10-16 | A diagram imported with all tables: editing its connection opened the picker with **nothing ticked**, as if the selection was lost; ticking one new table would have narrowed the next refresh to that one table. | The same encoding, on the **display** side: "all" was stored as `[]` and shown as zero ticks. **And** the picker started from `connections.tables` (what the connection imported last) instead of `diagrams.source.tables` (what this diagram imported): the same connection can feed several diagrams. | `TablePicker.test.jsx` "imported with all tables", `useConnect.test.js` "pick (regression ...)", verified in Chrome |

Related, not the same bug: `3f45ec5` (a shared connection: Import tried to save it first and answered "connection not found"; the list of schemas was empty). It lives in the same flow (`useConnect`), and the same two fields (`source`, `tables`), but the cause was the shared connection being saved from the person's drawer.

### What the four have in common

1. **A value that means two things.** `[]` is "nothing chosen yet" (first import), "everything" (an import of all tables) and "everything, including tables the database gets later" (a refresh). Three of the four bugs (#2, #3, #4) are that one encoding showing through: each fix patched the place where it showed, and the next feature found another place.
2. **No single source of truth.** The same selection is copied between the picker, the drawer state, the connection and the diagram, and each copy is updated by different code. #4 is two copies disagreeing (connection vs diagram); #1 is two uses of the same copy (import vs group).
3. **Every fix was local.** None of them made the wrong state unrepresentable; each added a rule inside one component, and the unit tests pinned that rule only.

## Rules (do not break them)

1. **The diagram owns its selection.** What a diagram imports and refreshes is `diagrams.source.{schemas,tables}`. Editing a connection **from a diagram** starts from that diagram's `source`; `connections.tables` is only a default for a diagram that has no link yet.
2. **"All" is a decision, not an absence.** Whatever the UI shows must make "all" visible: every table ticked, and the text says that tables added later are imported too. Applying an untouched "all" stays "all". Unticking one table makes an explicit list.
3. **A first import starts empty, and empty still means all** (so a person who wants 5 of 800 tables does not have to clear 795 ticks). That is the only place where "empty" is shown as empty.
4. **A grouped table is an imported table.** Putting a table in a group ticks it, always, in the same step (also when nothing was ticked, also for a shared connection, also when members change). A group never changes the ticks of other tables, and the ticks never change a group.
5. **The same code path for personal and shared connections.** A shared connection is never saved from the drawer; the selection lives only in `source`.
6. **Refresh uses `source` as it is**, including `[]` = all, and it must not change it (the scheduled refresh writes `source.at` and `source.gen`, never `tables`).
7. **The server treats the list literally**: `[]` or missing = all, otherwise exactly those (`schema.name`, or `name`). It never grows the list.

## Where the logic lives now (the structural fix, 2026-10-16)

- **`web/src/tableSelection.js`** (pure): the selection is one explicit value, `{ mode: 'all' | 'list', tables }`. `[]` is interpreted **only** in `fromStored` / `toStored` (the stored form of `source.tables`, `connections.tables` and the import request). `ticked` says what the picker shows when it opens, `fromTicks` what the ticks mean (nothing ticked or an untouched "all" is all; grouped tables are always imported), `withGrouped` ticks tables put in a group, `missing` lists chosen tables the database no longer has, `summary` and `footer` are the texts.
- **`TablePicker`** has no selection logic of its own: it opens with `ticked(selection, items, imported)` and applies with `fromTicks(...)`; its `onApply` gives `{ selection, groups, ddl }`.
- **`useConnect`** keeps one `selection` value; `pick` starts from the diagram's own `source` when the connection is its link (rule 1), otherwise from what the connection last saved (a list is a starting point, "all" opens empty); `imported` = this diagram is linked to this connection. A shared connection keeps the schemas the diagram imported when its schema list arrives.
- **Server**: `filterModel` is the only place that reads the list (`[]`/missing = all, never more) and reports `missing` (a PostgreSQL partition named in an older stored selection is not missing: partitions are no longer imported, the parent stands for them, rule 7 unchanged); the manual and the scheduled refresh say so (toast / audit detail) and never write `source.tables`.

Behaviour (checked in Chrome, personal and shared connection): a first import opens with nothing ticked (= all); an import of all opens with every table ticked and "All N selected = import all, tables the database gets later too"; applying it untouched keeps all; unticking makes a list; a new diagram on a connection used for "all" starts empty; a list of the connection is the starting point of a new diagram; grouping tables on a first import imports just those; an already imported "all" with a group stays all (every table is ticked); two diagrams on one connection each open with their own list.

## Tests

- `tableSelection.test.js`: the stored form, every row of the picker matrix (first import / all / list / list with a gone table x untouched / ticked / unticked / grouped / everything), the texts.
- `TablePicker.test.jsx`, `useConnect.test.js`: the component and the flow for **personal and shared** connections (what goes to the server and into `source`, a shared connection is never saved, opening from a linked diagram or a new one, two diagrams on one connection, schemas kept for a shared connection).
- `server/test/introspect.test.js` (`filterModel`), `server/test/refresh.test.js` (the scheduled refresh keeps `[]` and a list and never changes them), `tools/test-guardrails.mjs` (section 5b: the list semantics through the API for a personal and a shared connection, a gone table reported, a table created later enters with "all" and not with a list).
- `behaviorcheck.mjs` / `behavior.golden.json`: the picker on a shared connection (all ticked after an import of all, a group on a first import imports just those).
- By hand in Chrome on a throw-away instance (2026-10-16), for the personal and the shared connection: first import with nothing ticked / 2 ticked / a group, reopen, clear to all, reopen with all ticked, untick one, tick it back (a list of everything), two diagrams on one connection, refresh with a table created in the database (all gains it, a list does not), a chosen table that is gone (picker warning and one toast).

Still not automated: the same Chrome walk as a script (it needs a real browser; `behaviorcheck.mjs` covers part of it).

## When you change this area

State which rule above you touch and which row of the matrix covers it; add the row first. Do not interpret `[]` anywhere but `tableSelection.js` and `filterModel`.
