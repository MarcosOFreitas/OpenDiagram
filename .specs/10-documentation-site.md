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
- [ ] Narrow-screen (burger) layout checked on a real phone; print styles.
