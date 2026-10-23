# 08 — Generated documentation (dbdocs-style)

**Status:** implemented. The documentation is available to anyone who can open the diagram, including through share links. Code: `web/src/docsModel.js`, `web/src/DocsPage.jsx`, wiring in `web/src/App.jsx`.

## Goal

Turn the DBML into readable database documentation: browse tables, columns, constraints, notes, indexes and relationships without opening the diagram. Shareable as a file, or through the diagram's share links.

## Behaviour

- **Docs mode:** `Diagram | Docs` switch in the top bar (segmented control with icons). Documentation renders the *last valid* DBML (a syntax error shows a hint instead of a blank page until the first valid parse). Follows the light/dark theme.
- **Sidebar:** project title, search (filters by table name, schema or any column name), Overview, tables grouped by `TableGroup` (group color dot; ungrouped under *Other tables*/*Tables*), Enums. The sidebar can be hidden/shown (edge button ‹ ›) and resized by dragging its edge (double-click resets to 270px, limits 200px to 60% of the window); the choice is kept in this browser (`localStorage` `opendiagram.docsNav`) and also works in the exported `.html` (done in `initDocs`; hidden on narrow screens and in print).
- **Overview:** project name, `database_type`, project `Note`, counters (tables, relationships, enums, groups), relationship table (from → to, cardinality, on delete/update, linked).
- **Table section:** name, schema badge, group chips, table note, columns table (name, type, constraints `PK`/`NN`/`UQ`/`AI`, default, outgoing references as links with cardinality, column note), indexes (primary/unique/plain, name), *Referenced by* list (incoming relationships).
- **Enums:** value list with notes.
- **Exports** (Export menu): **Documentation `.html`** — one self-contained file (inline CSS + small search script, no network requests, follows OS dark mode, print-friendly) that can be hosted anywhere or attached; **Documentation `.md`** — Markdown for repos/wikis. Files are named `<title>-docs.*`. Export is refused with `fix the DBML errors first` if the DBML does not parse.
- **Collapse/expand:** every table (and enum) is a `<details>` card; the header shows a chevron (down = collapsed, click to open; up = open, click to collapse) and a column count. *Expand all / Collapse all* in the sidebar. Opening a table from a sidebar/reference link expands it and scrolls only the content pane. In-app collapsed state is remembered per browser (`localStorage.docsCollapsed`); the standalone `.html` works with plain `<details>` (no script needed to fold).
- **Comments (app-only, multi-author):** click the dashed area to add a comment on the project (overview), a table, or a column (*Comment* column); several comments per target, each with author and date, posted with the *Post* button or Ctrl+Enter (Esc cancels). Stored per diagram in the app's SQLite (`comments` table; API in [09](09-accounts-sharing.md)), keyed by `"<schema>.<table>"`, `"<schema>.<table>.<column>"` or `"__project"`. Who can comment is decided by the diagram owner through share-link levels; authors delete their own comments, the owner and administrators delete any. They are **never** written to DBML or to any connected database, survive refresh/re-import (same keys) and are included read-only (with author) in the `.html`/`.md` exports.
- Same React component renders the in-app view and the exported HTML (`renderToStaticMarkup`), so they cannot drift; the search script (`initDocs`) is inlined via `toString()` and must stay self-contained.

## Changelog
The Docs view lists the diagram's history (`GET /api/diagrams/:id/versions`, 50 newest: name, author, date, summary, "current") in a **Changelog** section after the overview, with a link in the sidebar. Only people who can edit see it (the history holds earlier content). The standalone HTML and the Markdown export carry **only the named versions** (an exported file can travel). `buildModel` is unchanged: the list is a separate `changelog` prop of `DocsPage` / `standaloneHtml` / `toMarkdown`.

## Acceptance criteria

- [x] Sidebar lists tables by group, enums and Overview; search narrows to matching tables/columns.
- [x] Sidebar hide/show and drag-resize, remembered after a reload (verified in the app; the exported `.html` shares the code but was not opened).
- [x] Overview shows project note/type, counters and the relationship table; reference cells link to the target table section.
- [x] Column row shows constraints, default (as `'string'`/`` `expr` ``), notes and outgoing reference with cardinality.
- [x] Chevron/summary click collapses and expands a table; Collapse all / Expand all work; a link to a collapsed table opens it; collapsed state survives reload.
- [x] A table comment typed with real keyboard/mouse input is saved to the server, shown after reload, and appears in the `.md`/`.html` exports; a second account commenting through a share link appears for everyone and can only delete its own.
- [x] Standalone HTML has no external requests and its search works when opened on its own (verified in an iframe via `srcdoc`).
- [x] Markdown export produces project header, group sections, per-table column tables, indexes, referenced-by and enums.
- [x] Opening the downloaded `.html` file from disk: audited by `tools/uiaudit.mjs` (opened through `file://`).
- [x] Large schemas: opening the Docs view took about 107 / 169 / 473 ms at 50 / 100 / 200 tables in a visible Chrome window, with `content-visibility: auto` on each table section (off-screen sections are laid out only when they come near; find in page, the index links and printing still work). Sidebar search is a DOM filter.
- [x] Column-level comments with real keyboard input: `uiaudit.mjs member-comment` types one with real key events as a comment-level member, posts it with Ctrl+Enter and finds it through the API under its `schema.table.column` key.

## Limitations

- Comments are not versioned or editable after posting (delete and re-post); no notifications or mentions.
- Renaming a table or column orphans its comment (stays in the file, hidden).

## Not included

Password-protected pages, per-table ER mini-diagrams, custom branding/CSS, PDF export (use the browser's print: the print CSS hides the sidebar). Ideas for forks: [06](06-roadmap.md).
