# 13 — Feature plan (proposal)

**Status:** proposal, written 2026-10-17. On 2026-10-21 the release plan [14](14-release-v1.md) took the items it ships; the rest stays here as ideas for forks. The next session starts with a `grill-me` pass over it (questions at the end), then the agreed items move into [`06-roadmap.md`](06-roadmap.md) and get their own spec when work starts.

The plan follows the product's own goal ([00](00-product.md)): a diagram **generated from a live database and kept up to date**, documented, shared with a team, self-hosted with one container. Every item says who gains, the smallest useful slice, how it would be built and proved, and what it must not break. Sizes: **S** one session, **M** two or three, **L** more (split before starting).

## How every item is executed

The same loop for each one, from `AGENTS.md` ("Agent skills"):

1. **Decide**: `grill-me` for anything L, anything touching security, connections, sharing or table selection; record the decisions in the item's spec.
2. **Plan**: `plan-lite` when it spans three or more files or layers; the smallest slice first, the rest as follow-ups.
3. **Build test-first**: `test-driven-development`. Logic in plain modules (`diagramModel.js`, `layout.js`, a new pure module) with unit tests; routes in `server/test/http.test.js`; catalog queries with the `oracle-postgres-sql` skill and the demo databases.
4. **Prove**: `verification-before-completion`: both `npm test`, `npx vite build`, the e2e script that covers it, and for UI `uiaudit.mjs` (zero findings) plus a look in the browser at 375 px and both themes; `docshots.mjs` when a documented screen changes; `behaviorcheck.mjs` golden updated on purpose only.
5. **Review**: `requesting-code-review` with the spec and the security invariants as criteria.
6. **Ship**: one commit per logical change, spec + README + docs page in the same commit, the user pushes.

## Wave 0: finish what is open (one or two sessions)

Already listed in [06](06-roadmap.md) "Follow-ups"; done first because later items build on it.

- **Dependency check, DBML first** (follow-up 1). Gates items 4, 5, 9 and 14: if `@dbml/core` 10 parses check constraints, custom properties or partitions, those items get cheaper. Output: a short table of "what 10.x gives us" in [04](04-formats.md), Gotchas in `AGENTS.md` corrected, parse time and bundle size measured with `web/benchclient.mjs`.
- **UI/UX round** (follow-up 2): Library open findings, then the other screens with `ui-ux-review`, one screen per commit.
- **Backup and restore** (new, S). *Who:* every self-hoster; today the only backup is copying the Docker volume. *Slice:* `node src/cli.js backup <file>` using SQLite `VACUUM INTO` (consistent while the app runs) and `restore <file>` that refuses to run while the server is up. *How:* `cli.js`, a test in `server/test/` that backs up, changes data, restores and compares; a "Backup" section in the self-hosting docs page. *Must not:* put `APP_SECRET` in the backup (say in the docs that saved passwords need the same key).

## Wave 1: make "kept up to date" visible (core value)

1. **Schema diff between two versions (M).** *Who:* DBAs and teams asking "what changed in the database?". Today History compares DBML as text. *Slice:* a structural diff (tables, columns, types, defaults, nullability, keys, refs, indexes added/removed/changed) between any two versions, shown in the History compare dialog above the text diff. *How:* a pure module `web/src/schemaDiff.js` that takes two parsed models from `diagramModel.js`; unit tests with hand-written DBML pairs (renamed column = remove + add, type change, FK change); the dialog renders the list; `uiaudit.mjs` screen `drawer-history-compare` already exists. *Must not:* keep a second model (DBML stays the source of truth: the diff is computed, never stored).
2. ~~**Drift after a refresh (M, needs 1).**~~ Done 2026-10-22 as item 9 of [14](14-release-v1.md). *Who:* owners of linked diagrams. *Slice:* when a manual or scheduled refresh changes the structure, the version entry gets a summary ("+2 tables, 1 column type changed") and the Library card shows "changed since you last opened it". *How:* reuse the diff on the server side for the scheduled refresh (`refresh.js`) — the server already has `@dbml/core` 10, so the same pure module can be shared or ported; a `last_seen_version` per user and diagram in SQLite (`db.js` migration); tests in `refresh.test.js` and `http.test.js`. *Must not:* read table data, or notify by e-mail (no SMTP: in-app only).
3. **Library: search, sort, filter (S).** Open findings of the Library review: a search box once there are more than about 8 diagrams, sort by name / last change, a filter "linked to a database". Pure filtering logic tested in `Library.test.jsx`; `uiaudit.mjs` covers the screen.
4. **More of the catalog: check constraints, partitions, unique constraints by name (M).** *Who:* DBAs documenting real schemas. *How:* `introspect.js` per engine (PG `pg_constraint` / `pg_partitioned_table`; Oracle `ALL_CONSTRAINTS` type C, `ALL_PART_TABLES`), `dbml.js` writes them as far as DBML 10 allows (else as notes), `server/test/introspect.test.js` and `dbml.test.js`, demo schemas extended in `demo/pg.sql` and `demo/oracle.sql` (remember the postgres volume Gotcha). *Must not:* leave catalog reads; privilege warnings stay warnings. Functions and procedures stay out (they are code, not structure) unless asked.

## Wave 2: from documentation to design work

5. **Migration script from a diff (M, needs 1).** *Who:* architects who design the next version in DBML. *Slice:* from version A to B, generate a PostgreSQL `ALTER` script (then Oracle) to download; never executed by the app. *How:* a pure `web/src/migrationSql.js` over the structural diff, golden tests per change kind, an "Export migration" entry in the History compare dialog. *Risk:* destructive changes (drop column) are marked in comments at the top of the script. *Must not:* add any path that runs SQL against a connection (non-goal, invariant 6).
6. **Data dictionary tags (M).** *Who:* teams that need to know where personal or sensitive data lives. *Slice:* tags on columns (`pii`, `sensitive`, free text) written in DBML (custom properties if DBML 10 supports them, else a note convention), a filter in the Docs view and the Tables panel, a "PII" badge on the column. *How:* parse in `docsModel.js` / `diagramModel.js`, unit tests, docs page. *Must not:* infer tags from table data (metadata only); a convention from column names may suggest tags but never set them silently.
7. **Cross-dialect export (L, already in "Later").** Type and default translation so PostgreSQL → MySQL / SQL Server and Oracle → PostgreSQL produce DDL the target accepts. *How:* a mapping table per pair as a pure module with tests that feed the output back to `@dbml/core` importers (`roundtrip.mjs` already shows the failures to fix). Start with Oracle → PostgreSQL (most asked in migrations).
8. **MySQL / MariaDB import (L).** *Who:* the largest group of users not served today. *How:* `grill-me` and a revision of [05](05-security.md) first: read-only session (`SET SESSION TRANSACTION READ ONLY` plus a privilege check that warns), TLS options, SSRF through `assertHostAllowed`; `introspect.js` engine module over `information_schema`; a `demo-mysql` service under a profile; the table picker rules of [12](12-table-selection.md); e2e in `test-guardrails.mjs`. SQL Server after it, with the same template.

## Wave 3: teams and hosting

9. **In-app notifications (M).** Comments on my diagrams, a refresh that changed the structure (item 2), a diagram shared with me. A bell in the top bar with an unread count; rows in SQLite; no e-mail. Tests in `http.test.js`, a new `uiaudit.mjs` screen.
10. **Proposed changes / review (L, needs 1 and 9).** An editor proposes a change as a draft version; the owner sees the structural diff and accepts or rejects it. Builds on versions and the conflict dialog; for agent accounts (MCP) this is the safer way to let an AI suggest schema changes instead of saving them (invariant 7: the agent still only sees DBML, title, version, comments).
11. **MCP connector, next step (M).** The audit items (schema enforcement, no `e.message` in the audit row, annotations, pagination, token expiry by default), then read-only tools that use the new pieces: `get_schema_diff` between two versions and `propose_change` (item 10). `server/test/mcp.test.js` keeps checking invariant 7.
12. **Public hosted instance (L, roadmap 4)** and **SSO with OIDC (L, roadmap 6)**: only after the [05](05-security.md) checklist is closed (non-root container, read-only filesystem, dependency scan, decision on storing credentials, privacy notice). `security-and-hardening` plus `docker` and `ci-cd` skills.

## Smaller improvements worth a session each (S)

- Editor: "n of m" in find/replace, folding of `Table { }` blocks, a keyboard-shortcut sheet (all CodeMirror built-ins; check `@codemirror/*` versions first).
- Diagram: per-table color picker in the side panel, sticky note colors and Markdown, measured performance at 300 / 1000 tables with `benchclient.mjs` before any optimisation.
- Docs view: render cost for hundreds of tables (open criterion in [08](08-documentation.md)); a print stylesheet check.
- Admin: an "instance health" card (version, data size, last backup, scheduled refresh failures) once backup and observability exist.

## Deliberately not planned

- An LLM inside the app (would add an outbound call and a key to store: invariant 6). AI help comes through the MCP connector, where the user's own client does the reasoning.
- Running SQL, browsing table data, applying migrations: non-goals of [00](00-product.md).
- Real-time co-editing: presence and conflict detection stay; merging edits live is out unless usage asks for it.
- E-mail features (no SMTP by design).

## Questions for the next session (`grill-me`)

1. Who uses it first: you and your team only, or a hosted instance for others soon? (Decides whether wave 3 moves up.)
2. Which engine matters more after PG and Oracle: MySQL or SQL Server?
3. Is the structural diff + drift (items 1 and 2) the main bet for the next month?
4. Migration scripts: only PostgreSQL, or Oracle from the start?
5. Tags for PII: needed for a real case (LGPD), or nice to have?
6. Backup: is a CLI enough, or should administrators download a backup from the UI (a new authenticated download route, more exposure)?
