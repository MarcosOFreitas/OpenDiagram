# 12 — Table selection: bugs so far and the rules that stop them

**Status:** living. Written after the fourth bug in the table selection (2026-10-16), from the commits that fixed the earlier ones. Read it before changing the table picker (`web/src/TablePicker.jsx`), the connection flow (`web/src/useConnect.js`), `importModel` or the refresh.

## What "the selection" is

The set of tables a diagram imports, and refreshes. It is **not one value in one place**; today it lives in five:

| Where | What it holds | Written by | Read by |
|---|---|---|---|
| `TablePicker` state `sel` | the ticks in the dialog (a `Set` of `schema.table`) | the person | Apply |
| `useConnect` state `tableSel` | the list the Database drawer works with (`[]` = all) | `pick`, Apply | the picker, Import |
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

## Tests that must exist (and what is missing)

Covered:

- `TablePicker.test.jsx`: selection, groups count as selected, Full DDL, "imported with all tables" (starts ticked, untouched = all, unticking = explicit list, first import starts empty, an explicit list wins).
- `useConnect.test.js`: shared vs personal import, `pick` starts from the diagram's own import.
- `behaviorcheck.mjs`: the picker and its groups on a shared connection.
- `server/test-guardrails.mjs`: "import only the picked schema.table".

**Not covered yet** (add them with the next change to this area):

- [ ] An end-to-end round: import all → edit the connection → tick nothing new → Apply → refresh keeps "all" (and a table created in the database after that appears).
- [ ] Explicit list → edit → add one table → refresh keeps the old ones and adds the new one.
- [ ] Two diagrams on one connection with different lists: each shows its own.
- [ ] A group in a first import with nothing ticked (rule 4) on a shared connection, in a test, not only in `behaviorcheck.mjs`.
- [ ] The scheduled refresh does not change `source.tables`.
- [ ] A table that no longer exists in the database but is in the explicit list: refresh says so instead of silently dropping it.

## The structural fix (recommended before the next feature in this area)

The four bugs came from the shape of the state, not from carelessness in one component, so the next change should be the shape, not another patch:

1. **One pure module** `web/src/tableSelection.js` with an explicit value `{ mode: 'all' | 'list', tables: [...] }` and the only functions that convert it: `fromStored([])` → `all`, `toStored(sel)` → `[]` or the list, `forPicker(sel, items)` → the ticks, `fromPicker(ticks, items, wasAll)` → the value, `withGroups(sel, groups)`. `[]` stops being interpreted anywhere else.
2. **The picker is a controlled component** over that value (no copy in its own state), and `useConnect` keeps one value, initialised by `pick` from `source` (rule 1).
3. **One table-driven test** over the whole matrix (first import / all / list × personal / shared × group / no group × untouched / unticked / ticked), written against the module, so a new case is a new row.
4. **A short checklist in the pull request** when `TablePicker.jsx`, `useConnect.js`, `importModel` or `source` change: which rule of this file does it touch, which row of the matrix covers it.
