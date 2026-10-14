# 08 — Generated documentation (dbdocs-style)

**Status:** implemented (local, no hosting/sharing yet). Code: `web/src/docsModel.js`, `web/src/DocsPage.jsx`, wiring in `web/src/App.jsx`.

## Goal

Turn the DBML into readable database documentation: browse tables, columns, constraints, notes, indexes and relationships without opening the diagram. Shareable as a file today; shareable by link once accounts exist ([06](06-roadmap.md)).

## Behaviour

- **Docs mode:** `Diagram | Docs` switch in the top bar (segmented control with icons). Documentation renders the *last valid* DBML (a syntax error shows a hint instead of a blank page until the first valid parse). Follows the light/dark theme.
- **Sidebar:** project title, search (filters by table name, schema or any column name), Overview, tables grouped by `TableGroup` (group color dot; ungrouped under *Other tables*/*Tables*), Enums.
- **Overview:** project name, `database_type`, project `Note`, counters (tables, relationships, enums, groups), relationship table (from → to, cardinality, on delete/update, linked).
- **Table section:** name, schema badge, group chips, table note, columns table (name, type, constraints `PK`/`NN`/`UQ`/`AI`, default, outgoing references as links with cardinality, column note), indexes (primary/unique/plain, name), *Referenced by* list (incoming relationships).
- **Enums:** value list with notes.
- **Exports** (Export tab): **Documentation `.html`** — one self-contained file (inline CSS + small search script, no network requests, follows OS dark mode, print-friendly) that can be hosted anywhere or attached; **Documentation `.md`** — Markdown for repos/wikis. Files are named `<title>-docs.*`. Export is refused with `fix the DBML errors first` if the DBML does not parse.
- **Collapse/expand:** every table (and enum) is a `<details>` card; the header shows a chevron (down = collapsed, click to open; up = open, click to collapse) and a column count. *Expand all / Collapse all* in the sidebar. Opening a table from a sidebar/reference link expands it and scrolls only the content pane. In-app collapsed state is remembered per browser (`localStorage.docsCollapsed`); the standalone `.html` works with plain `<details>` (no script needed to fold).
- **Comments (app-only):** click the dashed area to add a comment on the project (overview), a table, or a column (*Comment* column). Stored on the server in `DATA_DIR/comments.json` keyed by `"<schema>.<table>"`, `"<schema>.<table>.<column>"` or `"__project"` (`GET/PUT /api/comments`, whole-object replace, debounced 400 ms, values trimmed and capped at 5000 chars). They are **never** written to DBML or to any connected database, survive refresh/re-import (same keys) and are included read-only in the `.html`/`.md` exports. Escape cancels an edit; clearing the text deletes the comment.
- Same React component renders the in-app view and the exported HTML (`renderToStaticMarkup`), so they cannot drift; the search script (`initDocs`) is inlined via `toString()` and must stay self-contained.

## Acceptance criteria

- [x] Sidebar lists tables by group, enums and Overview; search narrows to matching tables/columns.
- [x] Overview shows project note/type, counters and the relationship table; reference cells link to the target table section.
- [x] Column row shows constraints, default (as `'string'`/`` `expr` ``), notes and outgoing reference with cardinality.
- [x] Chevron/summary click collapses and expands a table; Collapse all / Expand all work; a link to a collapsed table opens it; collapsed state survives reload.
- [x] A table comment typed with real keyboard/mouse input is saved to the server, shown after reload, and appears in the `.md`/`.html` exports.
- [x] Standalone HTML has no external requests and its search works when opened on its own (verified in an iframe via `srcdoc`).
- [x] Markdown export produces project header, group sections, per-table column tables, indexes, referenced-by and enums.
- [ ] Opening the downloaded `.html` file from disk in a separate browser window — not exercised (checked through `srcdoc`).
- [ ] Rendering large schemas (hundreds of tables) — not measured; sidebar search is a DOM filter, content is fully rendered.
- [ ] Column-level comments with real keyboard input — the table-level comment was verified end to end; the column cell uses the same component but was only exercised by script.

## Limitations

- Comments are one global set keyed by table/column id: two different diagrams that share a table name share its comment. They are not versioned and, until accounts exist, are visible to anyone who can reach the server.
- Renaming a table or column orphans its comment (stays in the file, hidden).

## Not included yet

Hosting and share links (needs accounts), password-protected pages, per-table ER mini-diagrams, custom branding/CSS, versioned history, PDF export (use the browser's print — print CSS hides the sidebar).
