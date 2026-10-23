# 01 — Architecture

```
Browser (React + CodeMirror + React Flow)
   │  DBML text (single source of truth, parsed in the browser: web/src/dbmlParse.js)
   │  localStorage (UI only): view, lastDiagram, editorW, tablesPanel, panelTab, gen:<id>; docs site: ds-theme, opendiagram.docsNav
   ▼  JSON over HTTP
Fastify API ──► SQLite DATA_DIR/app.db: users, sessions, settings, groups, diagrams, versions, diagram_seen,
   │                access grants, shares, comments, connections (secrets AES-256-GCM), shared-connection
   │                access, agent tokens, refresh state, throttle, audit log
   │
   ├─ introspect.js ──► PostgreSQL (pg, read-only txn)        ┐
   │                ├─► Oracle     (oracledb thin, read-only) ├ catalog queries only
   │                └─► MySQL      (mysql2, read-only txn)    ┘
   ├─ dbml.js: neutral model {tables, refs} → DBML text
   ├─ refresh.js: scheduled refresh (every minute, as the diagram's owner) → merge.js + schemaDiff.js
   └─ /mcp (mcp.js, agents.js): MCP connector for AI clients, agent accounts with bearer tokens
```

One Docker image: multi-stage build. Vite builds the UI into `server/public`, and the Node image serves the API and the static files on `:3000`. State is one volume (`/data`).

## Components

| Component | Responsibility |
|-----------|----------------|
| `server/src/index.js` | Routes; request → connection resolution (`resolve`); the privilege guardrail; the audited use of shared connections (`audited`); the CSRF Origin guard, the login requirement and the forced password change (all decided on the path of the route that matched, never on the raw URL); security headers and CSP; housekeeping (retention, daily backup); SPA fallback; error handler. It is also the API reference: every route is declared there. |
| `server/src/introspect.js` | Per-engine drivers (`drivers` map: `schemas`, `tables`, `import`, `privileges`); TLS options; the read-only session helpers `pgWith`, `oraWith`, `myWith`; the table filter (`filterModel`); database errors in plain words (`explainDbError`). |
| `server/src/dbml.js` | Model → DBML: quoting, types, defaults (as backtick expressions), notes, composite PK and indexes, checks, refs with actions, lineage comments. |
| `server/src/store.js` | Saved connections per account and shared connections; secrets encrypted with `APP_SECRET` (`undefined`/`''` keep, `null` clears; unreadable ones are listed as `secretLost`). |
| `server/src/refresh.js`, `merge.js` | The scheduled refresh ([03](03-connections-import.md)); what a refresh keeps (TableGroups, hand-written lineage: `keepGroups`, the same cases as `web/src/diagramModel.js`) and its structural summary (`structural`). |
| `server/src/schemaDiff.js` | The structural diff of two parsed diagrams, pure and without imports. The History dialog imports it from `server/src` (Dockerfile `COPY` into the web stage, Vite `server.fs.allow`), and the server uses it for refresh summaries. One module, never two copies. |
| `web/src/dbmlParse.js`, `server/src/dbmlParse.js` | DBML → `@dbml/core` Database **without** `@dbml/core`'s `Parser`, which loads the SQL parser of every dialect (about 15 MB of the web bundle, about 300 MB of server memory): `@dbml/parse` plus the model module, imported by file path (the package exports only its entry point; a path works in Vite and in plain Node). The two copies exist because the web build cannot reach the server's `node_modules`; each is pinned against the library's own `Parser` by its `dbmlParse.test.js`, so an upgrade of `@dbml/core` must keep both green. The SQL importer and exporters are a separate web chunk, loaded on the first SQL import or export. |
| `server/src/db.js`, `auth.js`, `admin.js`, `diagrams.js`, `policy.js` | SQLite schema and migrations; accounts, sessions, throttling, settings; users, groups and the last-administrator guard; diagrams, versions, grants, links, comments, "last seen"; the outbound host policy (SSRF). See [09](09-accounts-sharing.md). |
| `server/src/agents.js`, `mcp.js` | Agent accounts and their tokens (hash only); the MCP tools. See [09](09-accounts-sharing.md) and security invariant 7 in `AGENTS.md`. |
| `server/src/audit.js`, `presence.js`, `lineage.js`, `backup.js`, `cli.js` | Audit log (180 days); who has a diagram open (memory only); column lineage of views read from their SQL; the daily backup (`BACKUP_DIR`); the operator CLI (`create-admin`, `reset-password`, `list-users`, `backup`, `restore`). |
| `web/src/App.jsx` | Root (auth gate, `/s/<token>`) and the Workspace: top bar, drawers, canvas, autosave, refresh, import and export. `useConnect.js` is the Database drawer as a hook; `layout.js`, `diagramModel.js`, `docsModel.js`, `tableSelection.js` are the pure logic, unit tested. |
| `web/src/Editor.jsx`, `searchPanel.js` | CodeMirror 6: DBML tokenizer, autocomplete, diagnostics from parser errors; the find and replace bar. |

## Key decisions

- **DBML is the interchange**: import generates DBML; the diagram, the docs and the exports consume it. No second schema model, and SQL export comes from `@dbml/core`.
- **Introspection via catalogs** (`pg_catalog`, `ALL_*`) for PostgreSQL and Oracle, for exact types (`format_type`), expressions and ordering; MySQL has no better source than `information_schema` and `SHOW`.
- **Neutral model** between drivers and DBML ({tables, refs, enums, ...}), so a new engine adds a driver and reuses everything after it (see *Adding a database engine*).
- **Oracle thin mode**: no Instant Client in the image; TLS through the TCPS descriptor only (no wallets; a private CA is trusted by the server process with `NODE_EXTRA_CA_CERTS`).
- **SQLite via `node:sqlite` is final** (built in, no native dependency, Node 24; one file in the data volume). Measured: every call but sign-in takes 2 to 28 ms at the median, and the load is small and read-mostly. PostgreSQL storage would mean rewriting about 170 synchronous queries, a second container, `pg_dump` backups and major-version upgrades for every self-hoster, and would only buy several app instances. An optional second engine doubles the test matrix. Consequence: one instance per data volume (the scheduler and presence live in the process).
- **`@dbml/core` stays on 10.x, parsed on the main thread**: a typical diagram (30 tables or fewer) parses in about 35 ms, and `useDeferredValue` keeps typing fluid. A Web Worker is an idea for forks with very large diagrams.
- **scrypt cost kept** (about 40 ms of CPU per sign-in): it is the protection against password guessing ([05](05-security.md)).
- **Measured and not kept** (server tuning, 1 vCPU / 512 MB): an audit index on `actor_id` (the people facet went from 64 to 437 ms), `cache_size` and `temp_store` (no gain), `UV_THREADPOOL_SIZE` (sign-in bursts are CPU-bound), Compose `init: true` (Node already stops in about 1 s), a distroless image (no shell or `chown` for the volume commands). Kept: `synchronous = normal`, `busy_timeout`, the audit indexes on `diagram_id` and `connection_id`, and loading the DBML parser on first use.

## Data flow

**Import and refresh.** The UI posts `{id|draft, schemas, tables}` to `/api/import`. The server merges the saved connection with the draft (`resolve`, host policy), runs the privilege check (warning, or 403 with `blockWritable`), reads the catalog in a read-only session and returns `{dbml, gen, tables, refs, missing, warnings, at}`. The UI sets the editor text. On a **refresh** it compares with the last generated DBML (`gen`): unchanged is a no-op; changed runs `keepGroups` (the person's TableGroups and hand-written lineage come back) and saves with `entry: 'refresh'`. The **scheduled refresh** does the same on the server, as the owner.

**Saving.** The UI autosaves 800 ms after a change with the version it last saw (`baseVersion`); a newer version on the server answers 409 and the conflict dialog opens. Every content save bumps `diagrams.version` and writes the history (`diagram_versions`): saves of the same person within 10 minutes share an entry, unnamed entries are pruned to the latest 60, and a refresh or an overwrite gets its own entry. `diagram_seen` records the version each person last opened or saved, for the Library's "changed since you last opened it" ([09](09-accounts-sharing.md)).

## Adding a database engine

MySQL (added after PostgreSQL and Oracle) touched these places; a new engine follows the same list:

1. `server/src/introspect.js`: a driver in `drivers` (`schemas`, `tables`, `import`, `privileges`) that maps the catalog to the neutral model; a session helper that is **read-only in every layer** the engine has (security invariant 1) and has a statement timeout; a privilege check by **allowlist** whose findings are warnings; TLS options; the default port and error words in `explainDbError`.
2. `server/src/index.js`: the type in `assertType` and `validConn`, its default port.
3. `web/src/useConnect.js` (`ENGINES`: label, default port) and `web/src/AdminConnections.jsx` (shared connections use the same list).
4. Tests: unit tests of the mapping without a server (as `server/test/mysql.test.js`), a demo database in `docker-compose.demo.yml` with root / writer / reader users, `tools/test-guardrails.mjs` (read-only session, privilege warnings, the table picker), `tools/roundtrip.mjs`, a `uiaudit.mjs` screen of the form.
5. Docs: the *Database import* and *Database security* pages, [03](03-connections-import.md), [05](05-security.md) (a rogue server row), the README.

## Schema migrations

`db.js` runs on every start: `create table if not exists` adds new tables to an old database, and `addColumn` adds new columns (`pragma table_info`, then `alter table ... add column`). Both are additive and idempotent, and that is all the history has needed. A change that is not additive (a rename, a new constraint on existing rows, a backfill) needs a numbered step: read `pragma user_version`, run the step once inside a transaction, then bump the number. Whatever the change, `server/test/migration.test.js` shows the pattern for proving it: a database made before the change, opened by the new code in a child process, keeps its data.
