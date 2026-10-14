# 03 — Connections & live import

**Status:** implemented. Oracle TLS `verify` verified by hand against an OCI Autonomous DB; wallet/`noverify`/`serverDn` pending (see Acceptance). Code: `server/src/{index,introspect,store,dbml}.js`, drawer *Database* tab in `web/src/App.jsx`.

## Connection model

Stored per account in the SQLite `connections` table (`DATA_DIR/app.db`); other accounts cannot list or use them ([09](09-accounts-sharing.md)):

| Field | Notes |
|-------|-------|
| `id`, `name`, `type` (`postgres`\|`oracle`), `host`, `port`, `database` (Oracle: service name), `user` | |
| `password`, `caPem`, `walletPassword` | **secrets**, AES-256-GCM with `APP_SECRET`. On save: empty/undefined keeps stored value, `null` clears. Never returned by the API (`hasCa` flag instead). |
| `tls` | `off` \| `verify` (chain + host name; optional `caPem`) \| `noverify` (PG: no certificate check; Oracle: skips DN/host match, chain still validated). Legacy `ssl:true` ⇒ `noverify`. |
| `serverDn` | Oracle `SSL_SERVER_CERT_DN` (optional, with `verify`). |
| `blockWritable` | strict guardrail (below). |
| `schemas`, `tables` | last import selection (used by refresh). |
| `refreshMinutes` | 0 = manual only. |

## Guardrails

1. **Read-only session (always).** Postgres: startup options `default_transaction_read_only=on`, `statement_timeout=30s`, `idle_in_transaction_session_timeout=60s`, then `BEGIN READ ONLY` … `ROLLBACK`. Oracle: `SET TRANSACTION READ ONLY`, `callTimeout=30s`. Only catalog/dictionary views are queried — never user tables.
2. **Privilege check (Test and Import).** Returns warnings, never blocks unless `blockWritable`:
   - Postgres: superuser, createrole, createdb, bypassrls; `has_table_privilege(INSERT,UPDATE,DELETE,TRUNCATE)` on any table of the selected schemas; `CREATE` on those schemas.
   - Oracle: `DBA`/`RESOURCE` roles; system privileges beyond read (`… ANY`, `CREATE TABLE/VIEW/PROCEDURE/SEQUENCE/TRIGGER`, `UNLIMITED TABLESPACE`); `INSERT/UPDATE/DELETE` grants on selected schemas (`ALL_TAB_PRIVS_RECD`); user is the owner of a selected schema.
   - If the check itself fails ⇒ a warning `could not verify privileges (…)`.
3. **Strict mode.** With `blockWritable`, `/api/import` answers `403 Blocked by guardrail: …` when warnings exist.

## What is imported

Tables (`pg_class` kinds `r`,`p` / `ALL_TABLES` excluding nested, secondary and `BIN$`), table + column comments, columns (type via `format_type` / Oracle type formatting, nullability, default expression), PK (single → `[pk]`, composite → `indexes { (a,b) [pk] }`), FK (single/composite, `ON DELETE`/`ON UPDATE`), non-PK indexes (unique flag, method, expression columns). FKs to tables outside the selection are dropped. Optional `tables` filter (case-insensitive; plain `name` or `schema.name` — the UI picker stores `schema.name`).
Also (A1), with the DBML representation in [04](04-formats.md#objects-without-a-dbml-type):
- **Views** (Postgres `v`, `m`; Oracle `ALL_VIEWS` + `ALL_MVIEWS`) with columns, comment and SQL definition (`pg_get_viewdef`, `TEXT_VC` / `ALL_MVIEWS.QUERY`). In Oracle a materialized view also exists in `ALL_TABLES` as a container table of the same name: it is listed once, as a materialized view (`MLOG$_`/`RUPD$_` helper tables and the internal `I_SNAP$_` index are skipped).
- **Enums** (Postgres `pg_enum`; Oracle has none), **sequences** (`pg_sequence` / `ALL_SEQUENCES`; sequences owned by a column — serial/identity, `ISEQ$$_` — are skipped), **triggers** (`pg_trigger` non-internal + `pg_get_triggerdef`; Oracle `ALL_TRIGGERS` timing/event/status, no body). Functions/procedures and comments on them are not imported.
- The `tables` filter and the picker (`/api/tables` returns `view: true|false`) also apply to views.
- TableGroups from the picker: *Groups* tab (name, color from the editor palette or any color, each group has its own table chooser (search, select shown) independent of the import selection; a table belongs to one group, and adding it to another group moves it (the chooser marks tables already grouped)); groups start from the diagram's current TableGroups; on **Import** they are appended as `TableGroup` blocks (members not imported are dropped, tables put in a group are ticked for the import right away in the Tables tab, unless nothing is ticked, which already means all). A new Import also re-applies the diagram's current groups (before, only Refresh kept them).
- Picker UI: a centered dialog (`TablePicker.jsx`) with search (plain text, `*`/`?` wildcards like `VW_*`, or `/regex/`), schema and tables/views filters, "selected only", select/clear shown; Esc or Cancel discards, "Use N tables" applies; nothing selected = all tables.

**Not imported yet:** check constraints, partitions detail, functions/procedures, Oracle enums-by-check.

## Refresh

- Import links the saved connection + selection to the diagram (`diagrams.source` on the server). Top-bar `↻` or drawer *Refresh now* re-imports.
- Auto: interval from the connection (`refreshMinutes`), runs in the browser while the page is open; no overlap (single in-flight guard); errors toast.
- Compare to last generated DBML (`localStorage.gen:<diagramId>`): identical ⇒ "Already up to date", editor untouched. Changed ⇒ DBML replaced, **TableGroups re-appended** (members that no longer exist are dropped), positions kept by table id, toast shows `+N tables, −N tables, N changed`.
- Other manual edits to imported tables are overwritten (documented in the UI), except hand-written `// lineage:` lines (kept; the generated `// lineage(auto):` ones are rewritten).
- Lineage: `assemble(..., lineage)` -> `{ lineage: [{ target, sources: [{ schema, name, columns }] }] }`, written by `toDbml` as `// lineage(auto): target <- source(col, ...)`. PostgreSQL: `pg_depend` rows of the view's `pg_rewrite` rule (`refobjsubid` gives the columns used; the output-column mapping is not in the catalog). Oracle: `ALL_DEPENDENCIES` (views and materialized views onto tables/views, table level only). Only sources and targets that are part of the import are kept (`importModel` filters them with the picked tables).
- Column lineage (`server/src/lineage.js`, `viewColumnLineage`): the view's SQL (`pg_get_viewdef`, Oracle `ALL_VIEWS.TEXT_VC` / `ALL_MVIEWS.QUERY`) is parsed with `pgsql-ast-parser` (PostgreSQL grammar; it also reads most Oracle queries) and every output column is resolved to the base columns it comes from, through aliases, expressions, `*`, FROM sub-selects, CTEs, UNION, scalar sub-selects and views over views (catalog = the tables of the import). Unreadable SQL (parse error, `(+)`, `CONNECT BY`, over 20,000 characters, `*` over a table outside the import) gives no mapping; a time budget of 8 s per import stops a huge schema from stalling it. Only the SQL text is read, never table data. Written by `toDbml` as `// lineage(auto): schema.view.column <- schema.table.column, ...`. Checked by `node server/test-lineage.mjs` and by `test-guardrails.mjs` against the demo views.

## API

All JSON. Errors: `{error}` with HTTP status.

| Method & path | Body → response |
|---------------|-----------------|
| `GET /api/health` | → `{ok:true}` |
| `GET /api/connections` | → connection list without secrets |
| `POST /api/connections` | connection fields (+ optional `id` to edit) → `{id}` |
| `DELETE /api/connections/:id` | → `{ok:true}` |
| Diagrams, share links, comments | see [09](09-accounts-sharing.md) |
| `POST /api/schemas` | `{id}` or draft fields (draft overrides saved) → `{schemas, warnings, readOnly:true}` |
| `POST /api/tables` | `{id\|draft, schemas[]}` → `{tables:[{schema,name}]}` (catalog query, read-only session; feeds the table picker); `400` no schema |
| `POST /api/import` | `{id\|draft, schemas[], tables?[]}` → `{dbml, tables, refs, warnings, at}`; `400` no schema; `403` strict block |

## Acceptance criteria

- [x] Postgres import of the demo schema yields 4 tables + 2 views (view and materialized view) / 3 refs; Oracle yields 3 tables + 2 views (view and materialized view, listed once) / 2 refs (DBML parses).
- [x] Postgres: enum → `Enum`, view → `Table` with the definition in its note (shown as "· View"), `invoice_seq` → `Note`, trigger in the table note, serial sequences skipped (`server/test-guardrails.mjs`). Oracle checked by hand against the demo (MV once, no `I_SNAP$` index, trigger, sequence).
- [x] Superuser and `writer` produce warnings; `reader` produces none; strict mode blocks `writer`, allows `reader`.
- [x] DDL inside the enforced read-only transaction is rejected by Postgres (checked with `psql` using the same mode).
- [x] Postgres TLS: `verify` without CA rejects a self-signed cert; with the CA PEM connects; `noverify` connects; `verify` against a non-TLS server fails.
- [x] Oracle connect descriptor rejects injection in host/service name; `tcps` against a plain listener fails fast with `NJS-506`.
- [x] Refresh: added column/table detected, TableGroup preserved, second refresh is a no-op; auto-refresh applied a change within ~1 minute.
- [x] Oracle TLS `verify` without wallet/CA PEM verified manually (2026-10-14) against an Oracle Autonomous Database (OCI, TCPS 1522, public CA, hostname match): test, schema list and import worked. Gotcha: with TLS left on `off` against a TCPS port the server just closes the connection (`NJS-521 end-of-file`).
- [ ] Oracle TLS with wallet/CA PEM (mTLS), `noverify`, `serverDn` — **not verified**.
- [ ] Read-only enforcement is asserted by a direct `psql` check, not by instrumenting the app's own connection; add a test hook if stronger proof is needed.
