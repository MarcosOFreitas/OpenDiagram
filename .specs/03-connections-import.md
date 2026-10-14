# 03 — Connections & live import

**Status:** implemented. Oracle TLS verified only up to descriptor/failure paths (see Acceptance). Code: `server/src/{index,introspect,store,dbml}.js`, drawer *Database* tab in `web/src/App.jsx`.

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

Tables (`pg_class` kinds `r`,`p` / `ALL_TABLES` excluding nested, secondary and `BIN$`), table + column comments, columns (type via `format_type` / Oracle type formatting, nullability, default expression), PK (single → `[pk]`, composite → `indexes { (a,b) [pk] }`), FK (single/composite, `ON DELETE`/`ON UPDATE`), non-PK indexes (unique flag, method, expression columns). FKs to tables outside the selection are dropped. Optional `tables` filter (case-insensitive names).
**Not imported yet:** views, enums, sequences, triggers, check constraints, partitions detail.

## Refresh

- Import links the saved connection + selection to the diagram (`diagrams.source` on the server). Top-bar `↻` or drawer *Refresh now* re-imports.
- Auto: interval from the connection (`refreshMinutes`), runs in the browser while the page is open; no overlap (single in-flight guard); errors toast.
- Compare to last generated DBML (`localStorage.gen:<diagramId>`): identical ⇒ "Already up to date", editor untouched. Changed ⇒ DBML replaced, **TableGroups re-appended** (members that no longer exist are dropped), positions kept by table id, toast shows `+N tables, −N tables, N changed`.
- Other manual edits to imported tables are overwritten (documented in the UI).

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
| `POST /api/import` | `{id\|draft, schemas[], tables?[]}` → `{dbml, tables, refs, warnings, at}`; `400` no schema; `403` strict block |

## Acceptance criteria

- [x] Postgres import of the demo schema yields 4 tables / 3 refs; Oracle yields 3 / 2 (DBML parses).
- [x] Superuser and `writer` produce warnings; `reader` produces none; strict mode blocks `writer`, allows `reader`.
- [x] DDL inside the enforced read-only transaction is rejected by Postgres (checked with `psql` using the same mode).
- [x] Postgres TLS: `verify` without CA rejects a self-signed cert; with the CA PEM connects; `noverify` connects; `verify` against a non-TLS server fails.
- [x] Oracle connect descriptor rejects injection in host/service name; `tcps` against a plain listener fails fast with `NJS-506`.
- [x] Refresh: added column/table detected, TableGroup preserved, second refresh is a no-op; auto-refresh applied a change within ~1 minute.
- [ ] Oracle TLS success path (TCPS listener + wallet/CA) — **not verified**; needs an Oracle with TCPS configured.
- [ ] Read-only enforcement is asserted by a direct `psql` check, not by instrumenting the app's own connection; add a test hook if stronger proof is needed.
