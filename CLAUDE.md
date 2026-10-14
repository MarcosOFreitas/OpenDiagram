# CLAUDE.md

OpenDiagram: open-source dbdiagram.io-style tool. DBML editor + diagram, plus live metadata import from PostgreSQL/Oracle. Read `.specs/README.md` for specs and status before non-trivial work; update the relevant spec in the same change.

## Commands

```bash
docker compose up -d --build                 # app :3000 + demo-pg (+ demo-pg-tls)
docker compose --profile oracle up -d        # demo Oracle (slow first start)
docker compose up -d --build app             # rebuild after code changes (web is built inside the image)

cd web && npx vite build                     # quick syntax check of the UI (outputs to ../server/public)
node --check server/src/*.js                 # quick syntax check of the API
node server/test-guardrails.mjs              # e2e: read-only/privilege guardrails + PG TLS (stack must be up)
cd web && node roundtrip.mjs                 # e2e: import → export → re-import per format (needs oracle profile)
```

There is no unit-test framework and no linter configured. Verification = the two e2e scripts + driving the UI in a browser. Do not claim a UI change works without loading it.

## Layout

- `server/src/index.js` — Fastify routes (`/api/connections`, `/api/schemas`, `/api/import`) + static UI from `server/public`.
- `server/src/introspect.js` — per-engine catalog queries (`pg_catalog`, `ALL_*` views) → neutral model `{tables, refs}`; read-only session setup; TLS; privilege checks.
- `server/src/dbml.js` — neutral model → DBML text.
- `server/src/store.js` — `connections.json` in `DATA_DIR`; secrets AES-256-GCM encrypted with `APP_SECRET`.
- `web/src/App.jsx` — whole workspace (topbar, drawer tabs, canvas, refresh logic). `Editor.jsx` CodeMirror DBML editor. `Docs.jsx` in-app Help tab (usage + DBML examples). `docsModel.js` / `DocsPage.jsx` generate the documentation view and the standalone HTML/Markdown export.
- `demo/` — sample DBs for manual/e2e testing. `.specs/` — specs. `server/public` is a build artifact (gitignored).

## Conventions

- Server: plain ESM JavaScript, no build step, no TypeScript. Web: React 18 + Vite, JSX, no TS. Match the existing terse style; do not add layers, libraries or config for hypothetical needs.
- **DBML text is the single source of truth.** Import = generate DBML; the diagram is always parsed from the editor text (`@dbml/core`). Never keep a second model in sync.
- Errors thrown by the API carry `statusCode`; the global handler returns `{error}`. UI shows them as toasts via `notify`.
- Frontend persists to `localStorage` only: `dbml`, `title`, `view`, `source`, `gen`. Always wrap in try/catch (`store()` helper).

## Security invariants (do not weaken)

1. Every DB session must stay read-only: Postgres `BEGIN READ ONLY` + `default_transaction_read_only=on`; Oracle `SET TRANSACTION READ ONLY`. Only catalog queries; never read user table data.
2. Never return or log secrets (`password`, `caPem`, `walletPassword`). `store.list()` strips them; `get()` decrypts only server-side.
3. Oracle connect descriptor is built from user input — keep the `SAFE` validation in `oraConnectString`.
4. A failed privilege check is reported as a warning, never treated as "safe".
5. The app has **no auth yet**; do not add features that make it riskier to expose (e.g. arbitrary SQL execution, file reads) without the auth/allowlist work in `.specs/05-security.md`.

## Gotchas

- Docker `postgres` images keep an anonymous volume: editing `demo/pg.sql` has no effect until `docker compose rm -sfv demo-pg && docker compose up -d demo-pg`.
- `@dbml/core`: `importer.import(sql,'oracle')` returns empty; `json`/`jsonv2` import does not round-trip its own export. Don't re-add those as import options. Group members must be parsed via `t.schema?.name ?? t.schemaName`.
- Oracle `ALL_TAB_COLUMNS` has no `HIDDEN_COLUMN` (use `ALL_TAB_COLS`); `SESSION_ROLES` column is `ROLE`. node-pg cannot parse `name[]` — cast `attname::text` inside `array_agg`.
- React Flow nodes stay `visibility:hidden` until measured; in a hidden/background browser pane they never get measured and edges don't render. Bring the pane to the front/take a screenshot before asserting on edges.
- When editing CodeMirror state from tests use `document.execCommand('insertText')` on `.cm-content`; setting `textarea.value` no longer applies.
- Refresh (`keepGroups`) preserves only TableGroups and node positions; other manual edits to imported tables are overwritten by design.
- Writing files with shell heredocs containing quotes/backslashes is error-prone on this Windows setup; prefer the editor tools.

## Working agreements

- Smallest change that solves the problem; reuse what exists. Keep specs, README and the in-app Help tab consistent when behaviour changes.
- Report honestly what was and was not tested (e.g. Oracle TLS is unverified end-to-end).
- No attribution to third-party products in code/assets: this is a clean-room implementation, never copy code or images from dbdiagram.io.
