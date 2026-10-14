# 10 — Documentation site

**Status:** implemented. Code: `web/src/docsite/` (`DocsSite.jsx`, `md.jsx`, `nav.js`, `docsite.css`, `pages/*.md`), route chosen in `web/src/main.jsx`.

Modelled on the layout of docs.dbdiagram.io (Docusaurus): top bar, collapsible sidebar tree, content with a *Next / Previous* pager and an *On this page* index.

## Behaviour

- Public: `/docs` and `/docs/<slug>` need no login and use no API. The SPA fallback of the server serves them; `main.jsx` loads the docs bundle (own CSS, no React Flow) instead of the app for those paths.
- **Top bar**: brand, *Docs*, *Go to the app*, search (`Ctrl/⌘+K`), light/dark toggle (follows the app theme the first time, then remembered in `localStorage['ds-theme']`), *Open app*.
- **Sidebar**: `NAV` in `nav.js` (pages and collapsible sections; the section of the open page is expanded). Burger menu on narrow screens.
- **Search**: client side over titles and body text, ranked by title match then number of mentions; Enter opens the first result.
- **Page**: title, Markdown body, right-hand *On this page* (h2/h3, the heading being read is highlighted), pager. Internal links (`[x](slug)`, `[x](slug#anchor)`) keep the single-page navigation; browser back/forward work.
- **Markdown subset** (`md.jsx`, no dependency): `#`–`###`, paragraphs, lists, tables, fenced code (language label + Copy button), `> **Note|Tip|Warning|Info|Important** text` callouts, rules, inline code / bold / italic / links.
- The app links to it from **More → Documentation** (new tab). The old in-app Help drawer was removed.

## Content

One `.md` file per page, first line `# Title`. Pages: introduction, getting-started, dbml, relationships, enums-indexes-schemas, database-import, database-security, diagram-basics, tables-panel-and-views, arrange, table-groups, generated-documentation, import-export, accounts-and-sharing, share-links, administration, self-hosting, shortcuts-faq. **Update the page in the same change as the behaviour** (see CLAUDE.md).

## Acceptance criteria

- [x] Every page in `NAV` opens; no internal link points to a missing page; the anchors used exist (checked in the browser).
- [x] Search finds a page by title and by body text; Ctrl+K opens it, Esc closes it.
- [x] Light/dark toggle, sidebar sections, pager and browser back/forward work.
- [x] **More → Documentation** opens `/docs` in a new tab.
- [x] Burger layout checked in a 375 px emulated viewport (no page-level horizontal scroll; code and tables scroll inside their block). [ ] Real phone and print styles still open.

## Known limitations and follow-ups (for the next session)

- **Text proofread once** against the UI labels, shortcuts, limits and server code (found and fixed: a wallet-password field that does not exist, sequences called sticky notes, an issue-tracker line for a repository that is not public). Behaviour that is only described (not clicked through) can still drift; re-check a page when its feature changes.
- **No images**: dbdiagram's docs use screenshots and GIFs; ours are text and code only. Capture screens of the app (Tables panel, Arrange menu, table picker with groups, saved views, detail levels, Docs view) and add them to the pages (a small `![alt](src)` rule in `md.jsx` plus files under `web/public/docs/`).
- Code blocks: `dbml` blocks are coloured with the editor's tokenizer (`dbml` exported from `Editor.jsx`, `.tok-*` colours in `docsite.css`); other languages are plain.
- **Narrow screens**: the burger/sidebar layout was only checked in a desktop browser, not on a real phone. Print styles are missing.
- The `release-notes` page is written by hand from the git history (no version numbers yet); keep it updated per release. An **API** tab does not exist yet; add it when the API/CLI/MCP work starts.
- **Keep it current**: every behaviour change updates its page in the same commit (rule in `CLAUDE.md`).
