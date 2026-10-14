# 01 — Architecture

```
Browser (React + CodeMirror + React Flow)
   │  DBML text (single source of truth, parsed in-browser with @dbml/core)
   │  localStorage (UI only): view, docsCollapsed, lastDiagram, gen:<id>
   ▼  JSON over HTTP
Fastify API ──► SQLite DATA_DIR/app.db: users, sessions, diagrams, shares, comments,
   │                connections (secrets AES-256-GCM)
   │
   ├─ introspect.js ──► PostgreSQL (pg, read-only txn)   ┐ catalog queries only
   │                └─► Oracle     (oracledb thin, RO)   ┘
   └─ dbml.js: neutral model {tables, refs} → DBML text
```

One Docker image: multi-stage build — Vite builds the UI into `server/public`, the Node image serves API + static files on `:3000`. State is one volume (`/data`).

## Components

| Component | Responsibility |
|-----------|----------------|
| `server/src/index.js` | Routes, request→connection resolution (`resolve`), privilege guardrail enforcement, error handler. |
| `server/src/introspect.js` | Per-engine drivers: `schemas`, `import`, `privileges`; TLS config; read-only session setup; table filter. |
| `server/src/dbml.js` | Model → DBML: quoting, types, defaults (as backtick expressions), notes, composite PK/indexes, refs with actions. |
| `server/src/store.js` | CRUD of saved connections per account; secret handling (`undefined`/`''` keep, `null` clears); one-time adoption of the legacy `connections.json`. |
| `server/src/db.js`, `auth.js`, `diagrams.js`, `policy.js` | SQLite schema; accounts + sessions + throttling; diagrams/shares/comments and access levels; outbound host policy. See [09](09-accounts-sharing.md). |
| `web/src/App.jsx` | Workspace: parse DBML → nodes/edges, layout (dagre, compound for TableGroups), drawer tabs, refresh/auto-refresh, import/export. |
| `web/src/Editor.jsx` | CodeMirror 6: DBML stream tokenizer, autocomplete, diagnostics from parser errors. |

## Key decisions

- **DBML as the interchange**: import generates DBML; export/diagram consume DBML. Avoids a second schema model and gives free SQL export via `@dbml/core`.
- **Introspection via catalogs** (`pg_catalog`, `ALL_*`) not `information_schema`, for exact types (`format_type`), expressions and ordering.
- **Neutral model** between drivers and DBML so adding an engine = one driver (`schemas`, `import`, `privileges`).
- **Oracle thin mode**: no Instant Client in the image; TLS through TCPS descriptor + optional PEM wallet (`ewallet.pem`).
- **Client-side refresh timer**: runs in the owner's open browser. Diagrams are now stored server-side, so a server-side scheduler is possible (roadmap).
- **SQLite via `node:sqlite`** (built in, no native dependency, Node 24): one file in the data volume keeps the single-container deployment. Move to PostgreSQL if write concurrency or multiple app instances are needed.

## Data flow: import / refresh

1. UI posts `{id|draft, schemas, tables}` to `/api/import`.
2. Server merges saved connection + draft (`resolve`), runs the privilege check (warn / 403 if `blockWritable`), introspects in a read-only session, returns `{dbml, tables, refs, warnings, at}`.
3. UI sets the editor text; on **refresh** it compares with the last generated DBML (`gen`): unchanged → no-op; changed → `keepGroups` re-appends the user's TableGroups, toast shows the diff.
