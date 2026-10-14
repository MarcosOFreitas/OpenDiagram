# 02 — Editor & diagram

**Status:** implemented. Code: `web/src/App.jsx`, `web/src/Editor.jsx`, `web/src/Docs.jsx`.

## Behaviour

- **Layout:** top bar (title, search, tabs Database/Import/Export/View/Docs, refresh button when linked) · collapsible DBML editor · canvas · right drawer (350 px, Esc closes) · floating dock (zoom, fit, arrange).
- **Editor:** CodeMirror 6, dark. DBML highlighting (blocks, `[settings]`, types, strings, `` `expr` ``, `#hex`, comments). Autocomplete: block keywords, settings, types, table names, `table.column` (from last valid parse). Parser errors → underline + gutter marker + status bar `line N: message`.
  **Colors:** a swatch widget follows each `headercolor:`/`color:` hex; clicking opens the native color picker and rewrites the hex live. Typing `color: ` / `headercolor: ` opens a 12-color preset list (with swatches).
- **Diagram:** every `Table` is a card (header, PK/FK icons, NN badge, notes as tooltip, indexes rows). `Ref` → edge from child column to parent column, label `child:parent` cardinality. Auto layout with dagre (left→right); compound clusters keep `TableGroup` members together. Drag keeps positions across edits (by table id). Fit on load/import (not on every keystroke).
- **TableGroup:** `TableGroup name [color: #hex] { tables }` → dashed colored box behind members, follows drags. A table in several groups uses the first.
- **Header color:** `Table t [headercolor: #hex]`.
- **Interactions:** click table → highlights it and its edges; search dims non-matching tables/columns; Arrange re-runs layout; minimap; zoom 5–200 %.
- **View tab:** theme light/dark, background grid on/off, edge style (curved/rounded/step/straight), hide types, hide indexes, snap to grid. Persisted in `localStorage.view`.
- **Docs tab:** getting-started steps + 7 self-contained DBML examples with *Insert* / *Copy*.
- **Feedback:** toasts (ok/err), button busy states, empty-state hint.

## Acceptance criteria

- [x] Typing valid DBML updates the diagram without losing positions of existing tables.
- [x] Invalid DBML shows an underline and a status-bar message with the line; fixing it clears both.
- [x] `TableGroup` renders a colored box around its tables.
- [x] All 7 Docs examples can be inserted together without parse errors.
- [x] Dark/light and grid toggle apply immediately and persist across reload.
- [x] Click highlights related edges; search dims non-matching tables.
- [x] Swatch click changes the hex in the editor and the diagram color immediately; presets insert a valid hex. (Verified by simulating the picker's `input` events — the OS-native dialog itself was not exercised.)
- [ ] Visual regression coverage — none; UI is verified manually.
- [ ] Narrow-screen/mobile layout — not designed or tested.

## Known gaps

No syntax-aware folding, no `Records`/sample-data blocks, no custom properties, no table partials, no side-panel color UI (colors are picked from the swatch next to the hex in the editor).
