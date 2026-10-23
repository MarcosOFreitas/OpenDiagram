# 06 — Known limitations and ideas for forks

OpenDiagram 1.0 is feature-complete ([00](00-product.md)): nothing below is scheduled. It is the honest list of what the release does not do, and a menu for anyone who forks it. Before building one of the ideas, read [`CONTRIBUTING.md`](../CONTRIBUTING.md) and the security invariants in [`AGENTS.md`](../AGENTS.md); an idea that touches connections, sharing or outbound traffic starts by revisiting [05](05-security.md).

## Known limitations

- **Engines.** Live import from PostgreSQL, Oracle and MySQL 8.0+. MariaDB 10.6+ is best effort: tried by hand with 11.4, not in the automated tests, and without the table-level lineage of views. No SQL Server live import (SQL Server works as an SQL file import and export).
- **Not imported:** functions and procedures, partition bounds and subpartitions (a partitioned table says its method and key), Oracle enums written as check constraints. MySQL triggers need the `TRIGGER` privilege.
- **Oracle TLS:** no wallets or mutual TLS. A private CA is trusted for the whole server through `NODE_EXTRA_CA_CERTS` (no per-connection CA for Oracle and MySQL; PostgreSQL has a CA field), and a real private CA was never tested.
- **Formats:** SQL export to another engine needs manual edits (no type or default translation, [04](04-formats.md)). JSON is export-only. An Oracle SQL file imports tables, keys, indexes and comments only.
- **Collaboration:** no real-time co-editing (a conflict dialog instead), no notifications in the app or by e-mail, no mentions. Comments cannot be edited (delete and post again), and renaming a table or column orphans its comments.
- **History:** no per-entry delete, no diff of the layout, no history for edit-link visitors; Compare is one version against the current state, and a rename shows as removed plus added.
- **Accounts:** no e-mail of any kind (no verification, invitations or reset by e-mail), no SSO or MFA. MCP clients that need OAuth (such as claude.ai custom connectors on the web) cannot connect. Agents cannot create diagrams and have no per-agent rate settings.
- **Operation:** one instance per data volume (SQLite, the scheduler and presence live in the process): no replicas. No general API rate limit (configure one in the reverse proxy; see *Self-hosting*). `APP_SECRET` is one key with no rotation tool: a new key means typing the connection passwords again.
- **Size:** large diagrams cost the browser (about 220 ms of parsing after each pause in typing and a 1.7 s *Left to right* arrange at 200 tables); nothing above 400 tables was measured.
- **Sticky notes** have one colour and plain text, and appear neither in the Docs view nor in the exports.
- **Interface checks** run in Chrome only, at desktop and phone width: no screen reader, Windows high-contrast or tablet pass. The documentation site has no print styles.
- **By design**, never: running SQL, reading table data, applying migrations, a language model inside the app, iframe embedding, drawing lineage by dragging.

What was not tested is listed in the *Not tested* part of the release notes (`web/src/docsite/pages/release-notes.md`).

## Ideas for forks

Each with what it needs and the trap to avoid.

- **Drift webhook** (builds on the refresh summary). An administrator setting with one URL and one secret; one event only (a refresh that changed the structure); payload: diagram id, title, version and the summary, never DBML, `source`, a connection or a credential; signed with HMAC-SHA256 (`node:crypto`), sent with native `fetch`, a short timeout, one retry, no queue, an audit row per delivery; the URL goes through a host policy like `DB_HOST_POLICY`. It is a new outbound connection: invariant 6.
- **Migration script from the diff:** a PostgreSQL `ALTER` script from `server/src/schemaDiff.js`, generated as a file and never executed, destructive changes commented at the top.
- **PII tags on columns:** metadata only, never inferred from data.
- **Cross-dialect type mapping** for SQL export, starting with Oracle → PostgreSQL.
- **SQL Server live import**, following *Adding a database engine* in [01](01-architecture.md).
- **In-app notifications**, and **proposed changes** with a review step (the safer path for agents), plus MCP tools such as `get_schema_diff` and `propose_change`.
- **OIDC sign-in** (any provider), which also lets OAuth-only MCP clients connect; and a **hosted instance**, only after the pre-deployment checklist of [05](05-security.md).
- **History:** compare two arbitrary versions, rename detection, changes highlighted on the canvas, "new" for a diagram someone just shared with you.
- **Large diagrams:** React Flow's `onlyRenderVisibleElements`, parsing in a Web Worker, fewer handles per column.
- **Small ones:** folding in the editor, a colour picker per table, sticky notes with colours and Markdown, an instance health card for administrators, a per-connection CA for Oracle and MySQL, an `APP_SECRET` rotation command.
- **Code:** split `web/src/App.jsx` and `server/src/introspect.js` when touching them; both are large.

## Not planned

Running arbitrary SQL, browsing table data or sample data (against the catalog-only invariant); embedding diagrams in an iframe; drawing a lineage link by dragging (lineage is imported or written as `// lineage:` comments).

## Done

See *Features* in the [README](../README.md) and the [release notes](../web/src/docsite/pages/release-notes.md); not repeated here so that it cannot drift.
