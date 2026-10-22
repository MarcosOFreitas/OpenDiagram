# 01 — Architecture

```
Browser (React + CodeMirror + React Flow)
   │  DBML text (single source of truth, parsed in-browser with @dbml/core)
   │  localStorage (UI only): view, docsCollapsed, lastDiagram, editorW, tablesPanel, gen:<id>
   ▼  JSON over HTTP
Fastify API ──► SQLite DATA_DIR/app.db: users, sessions, settings, groups, diagrams, versions,
   │                access grants, shares, comments, connections (secrets AES-256-GCM),
   │                shared-connection access, audit log
   │
   ├─ introspect.js ──► PostgreSQL (pg, read-only txn)   ┐ catalog queries only
   │                └─► Oracle     (oracledb thin, RO)   ┘
   └─ dbml.js: neutral model {tables, refs} → DBML text
```

One Docker image: multi-stage build — Vite builds the UI into `server/public`, the Node image serves API + static files on `:3000`. State is one volume (`/data`).

## Components

| Component | Responsibility |
|-----------|----------------|
| `server/src/index.js` | Routes, request→connection resolution (`resolve`), privilege guardrail enforcement, the audited use of shared connections (`audited`), CSRF Origin guard, login requirement, forced password change, security headers and CSP, SPA fallback, error handler. |
| `server/src/introspect.js` | Per-engine drivers: `schemas`, `tables`, `import`, `privileges`; TLS config; read-only session setup; table filter. |
| `server/src/dbml.js` | Model → DBML: quoting, types, defaults (as backtick expressions), notes, composite PK/indexes, refs with actions. |
| `server/src/store.js` | CRUD of saved connections per account; secret handling (`undefined`/`''` keep, `null` clears). |
| `web/src/dbmlParse.js` | DBML -> `@dbml/core` Database without `@dbml/core`'s `Parser` (which imports every SQL parser): `@dbml/parse` + the model module imported by file path (`../node_modules/@dbml/core/lib/...`: the package exports only its entry point; a path works in Vite and in plain Node); the SQL importer and exporters (`@dbml/core`) are a separate chunk loaded on the first SQL import or export. An upgrade of `@dbml/core` must keep `dbmlParse.test.js` green (it compares with the library's own `Parser`) |
| `server/src/backup.js` | optional daily backup (`BACKUP_DIR`, `BACKUP_KEEP_DAYS`): `VACUUM INTO` one file per day from the housekeeping of `index.js`, old ones deleted |
| `server/src/db.js`, `auth.js`, `admin.js`, `diagrams.js`, `policy.js` | SQLite schema and migrations; accounts + sessions + throttling + settings; users, groups, settings and the last-administrator guard; diagrams, versions, grants, links and comments with access levels; outbound host policy. See [09](09-accounts-sharing.md). |
| `server/src/audit.js`, `presence.js`, `lineage.js`, `cli.js` | Audit log (180 days); who has a diagram open (memory only); column lineage of views read from their SQL; operator CLI (`create-admin`, `reset-password`, `list-users`, `backup`, `restore`). |
| `web/src/App.jsx` | Workspace: parse DBML → nodes/edges, layout (dagre, compound for TableGroups), drawer tabs, refresh/auto-refresh, import/export. |
| `web/src/Editor.jsx` | CodeMirror 6: DBML stream tokenizer, autocomplete, diagnostics from parser errors. |

## Key decisions

- **DBML as the interchange**: import generates DBML; export/diagram consume DBML. Avoids a second schema model and gives free SQL export via `@dbml/core`.
- **Introspection via catalogs** (`pg_catalog`, `ALL_*`) not `information_schema`, for exact types (`format_type`), expressions and ordering.
- **Neutral model** between drivers and DBML so adding an engine = one driver (`schemas`, `tables`, `import`, `privileges`).
- **Oracle thin mode**: no Instant Client in the image; TLS through the TCPS descriptor only (no wallets; a private CA is trusted by the server process with `NODE_EXTRA_CA_CERTS`).
- **Scheduled refresh** (`refresh.js`): a job in the server process, every minute, over the linked diagrams whose connection has an interval; see [03](03-connections-import.md).
- **SQLite via `node:sqlite`** (built in, no native dependency, Node 24): one file in the data volume keeps the single-container deployment. Move to PostgreSQL if write concurrency or multiple app instances are needed.

## Data flow: import / refresh

1. UI posts `{id|draft, schemas, tables}` to `/api/import`.
2. Server merges saved connection + draft (`resolve`), runs the privilege check (warn / 403 if `blockWritable`), introspects in a read-only session, returns `{dbml, tables, refs, warnings, at}`.
3. UI sets the editor text; on **refresh** it compares with the last generated DBML (`gen`): unchanged → no-op; changed → `keepGroups` re-appends the user's TableGroups, toast shows the diff.
