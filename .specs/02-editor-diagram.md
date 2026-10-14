# 02 — Editor & diagram

**Status:** implemented. Code: `web/src/App.jsx`, `web/src/Editor.jsx`, `web/src/Docs.jsx`.

## Behaviour

- **Layout:** top bar (title + save state, Diagram/Docs switch, search, refresh button when linked, **Diagrams / Share / Export** buttons, a **More** menu with Database / Import / View / Help, and an avatar menu with Account, Administration (admins) and Sign out; the drawer shows the title of the open section) · collapsible DBML editor · canvas · right drawer (350 px, Esc closes) · floating dock (zoom, fit, arrange).
- **Editor:** CodeMirror 6, dark; **resizable** (drag the edge between editor and diagram, double-click resets; width remembered), optional **line wrapping** (View tab) so no horizontal scrolling is needed; **Ctrl+F / Ctrl+H** opens a find/replace bar at the top with Next/Prev/Select all, Replace/Replace all and Match case / Whole word / Regex toggles, matches highlighted. DBML highlighting (blocks, `[settings]`, types, strings, `` `expr` ``, `#hex`, comments). Autocomplete: block keywords, settings, types, table names, `table.column` (from last valid parse). Parser errors → underline + gutter marker + status bar `line N: message`.
  **Colors:** a swatch widget follows each `headercolor:`/`color:` hex; clicking opens the native color picker and rewrites the hex live. Typing `color: ` / `headercolor: ` opens a 12-color preset list (with swatches).
- **Diagram:** every `Table` is a card (header, PK/FK icons, NN badge, notes as tooltip, indexes rows). `Ref` → edge from child column to parent column, label `child:parent` cardinality. Auto layout with dagre (left→right); compound clusters keep `TableGroup` members together. With 25+ tables and no TableGroups the layout is packed instead (not yet validated on a very large real diagram): each connected component gets its own dagre run (left→right or top→bottom, whichever is closer to 1.6:1), tables without relationships are stacked in balanced columns, and the blocks are packed in rows. Drag keeps positions across edits (by table id). Fit on load/import (not on every keystroke).
- **TableGroup:** `TableGroup name [color: #hex] { tables }` → dashed colored box behind members, follows drags. A table in several groups uses the first.
- **Header color:** `Table t [headercolor: #hex]`.
- **Interactions:** click table → highlights it and its edges; click a relationship line → the line turns orange and only its two tables stay in focus (the rest dims; click the canvas to clear); table header chevron (or double-click the header) collapses/expands a table, dock buttons ⊟/⊞ collapse/expand all (relationship lines stay attached to the header); select a table and drag its edge or corner handles to change width and/or height (a manual height makes the rows scroll; a width-only drag keeps the height automatic); width, height and collapsed state are saved with the layout (`layout['@sizes']` = `{id: {w, h, c}}`); search dims non-matching tables/columns; Arrange re-runs layout; minimap; zoom 5–200 %.
- **View tab:** theme light/dark, background grid on/off, edge style (curved/rounded/step/straight), hide types, hide indexes, snap to grid. Persisted in `localStorage.view`.
- **Templates:** `web/src/templates.js` holds the blank starter and the sample shop model ("Loja - modelo": customers, addresses, categories, products, reviews, orders, order_items, payments; 2 enums, composite PK, indexes, 10 refs with actions, 3 colored groups, project note). It is the first diagram of every new account and appears under *Start from a template* in the Diagrams tab. Add more by extending `TEMPLATES`.
- **Help tab:** getting-started steps + 7 self-contained DBML examples with *Insert* / *Copy*.
- **Feedback:** toasts (ok/err), button busy states, empty-state hint.

## Acceptance criteria

- [x] Typing valid DBML updates the diagram without losing positions of existing tables.
- [x] Invalid DBML shows an underline and a status-bar message with the line; fixing it clears both.
- [x] `TableGroup` renders a colored box around its tables.
- [x] All 7 Help-tab examples can be inserted together without parse errors.
- [x] Dark/light and grid toggle apply immediately and persist across reload.
- [x] Click highlights related edges; search dims non-matching tables.
- [x] Swatch click changes the hex in the editor and the diagram color immediately; presets insert a valid hex. (Verified by simulating the picker's `input` events — the OS-native dialog itself was not exercised.)
- [ ] Visual regression coverage — none; UI is verified manually.
- [ ] Narrow-screen/mobile layout — not designed or tested.

## Known gaps

Find/replace shows no "n of m" match counter. No syntax-aware folding, no `Records`/sample-data blocks, no custom properties, no table partials, no side-panel color UI (colors are picked from the swatch next to the hex in the editor).
