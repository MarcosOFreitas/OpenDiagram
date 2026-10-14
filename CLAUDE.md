# CLAUDE.md

OpenDiagram: open-source dbdiagram.io-style tool. DBML editor + diagram, plus live metadata import from PostgreSQL/Oracle. Read `.specs/README.md` for specs and status before non-trivial work; update the relevant spec in the same change.

## Commands

```bash
docker compose up -d --build                 # app :3000 + demo-pg (+ demo-pg-tls)
docker compose --profile oracle up -d        # demo Oracle (slow first start)
docker compose up -d --build app             # rebuild after code changes (web is built inside the image)

cd web && npx vite build                     # quick syntax check of the UI (outputs to ../server/public)
node --check server/src/*.js                 # quick syntax check of the API
node server/test-auth.mjs                    # e2e: accounts, roles, groups, sharing, links, SSRF policy (stack up; needs TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD of an admin: `docker compose exec app node src/cli.js create-admin <email> <password>`)
node server/test-guardrails.mjs              # e2e: read-only/privilege guardrails + PG TLS (stack up; also needs TEST_ADMIN_*)
cd web && node roundtrip.mjs                 # e2e: import → export → re-import per format (needs oracle profile + TEST_ADMIN_*)
```

All three scripts accept `BASE=http://host:port` (default `http://localhost:3000`). There is no unit-test framework and no linter configured. Verification = those e2e scripts + driving the UI in a browser. Do not claim a UI change works without loading it.

## Layout

- `server/src/index.js` — Fastify routes (auth, connections, schemas/import, diagrams, shares, comments, `/api/shared/:token`) + CSRF guard, login requirement, security headers, SPA fallback, static UI from `server/public`.
- `server/src/db.js` (SQLite via built-in `node:sqlite`, schema), `auth.js` (scrypt, roles, sessions, throttling, settings), `admin.js` (users/groups/settings/directory + last-admin guard), `diagrams.js` (diagrams, access grants, links, comments), `policy.js` (SSRF host policy), `cli.js` (operator tool: create-admin, reset-password, list-users).
- `server/src/introspect.js` — per-engine catalog queries (`pg_catalog`, `ALL_*` views) → neutral model `{tables, refs}`; read-only session setup; TLS; privilege checks.
- `server/src/dbml.js` — neutral model → DBML text.
- `server/src/store.js` — saved connections per account (SQLite); secrets AES-256-GCM encrypted with `APP_SECRET`.
- `web/src/App.jsx` — root (auth gate, `/s/<token>` route) + `Workspace` (topbar, drawer tabs, canvas, autosave, refresh). `Auth.jsx` sign-in/up + password form, `Admin.jsx` administration overlay, `Library.jsx` diagrams tab, `SharePanel.jsx` people/groups/links, `Menu.jsx` top-bar dropdown, `api.js` fetch helper. `Editor.jsx` CodeMirror DBML editor (highlighting, autocomplete, diagnostics, color swatches, find/replace bar, read-only/wrap compartments). `Docs.jsx` in-app Help tab (usage + DBML examples). `docsModel.js` / `DocsPage.jsx` generate the documentation view and the standalone HTML/Markdown export.
- `demo/` — sample DBs for manual/e2e testing. `.specs/` — specs. `server/public` is a build artifact (gitignored).

## Conventions

- Server: plain ESM JavaScript, no build step, no TypeScript. Web: React 18 + Vite, JSX, no TS. Match the existing terse style; do not add layers, libraries or config for hypothetical needs.
- **DBML text is the single source of truth.** Import = generate DBML; the diagram is always parsed from the editor text (`@dbml/core`). Never keep a second model in sync.
- Errors thrown by the API carry `statusCode`; the global handler returns `{error}`. UI shows them as toasts via `notify` (inside the Admin overlay they are shown in the panel, because the overlay covers the toast area).
- Diagram content (`dbml`, title, layout, connection link) lives on the server and autosaves; `localStorage` only keeps per-browser UI state: `view`, `docsCollapsed`, `lastDiagram`, `gen:<diagramId>` (last generated DBML for refresh diffs). Always wrap in try/catch (`store()` helper).

## Security invariants (do not weaken)

1. Every DB session must stay read-only: Postgres `BEGIN READ ONLY` + `default_transaction_read_only=on`; Oracle `SET TRANSACTION READ ONLY`. Only catalog queries; never read user table data.
2. Never return or log secrets (`password`, `caPem`, `walletPassword`). `store.list()` strips them; `get()` decrypts only server-side.
3. Oracle connect descriptor is built from user input — keep the `SAFE` validation in `oraConnectString`.
4. A failed privilege check is reported as a warning, never treated as "safe".
5. Authorization lives in the server, never in the UI: roles are `admin`/`member`; `/api/admin/*` requires admin; a diagram's effective level is owner > admin (administrators on others' diagrams: everything except the owner's `source`/connections) > edit > comment > view (`roleFor` in `diagrams.js`); the instance must keep one active admin (`guardLastAdmin`); accounts with `mustChangePassword` can only call `/api/auth/*`; every `/api` route except `health`, `auth/*`, `shared/*` requires a session; resources of other accounts answer 404; share-link routes must check the link's access level (`view < comment < edit`) and require login for `comment`/`edit`. Never put `source`, connections or secrets in a `/api/shared` payload.
6. Do not add features that widen exposure (arbitrary SQL execution, file reads, new outbound fetches) without revisiting `.specs/05-security.md`; DB hosts go through `assertHostAllowed`.

## Gotchas

- Docker `postgres` images keep an anonymous volume: editing `demo/pg.sql` has no effect until `docker compose rm -sfv demo-pg && docker compose up -d demo-pg`.
- `@dbml/core`: `importer.import(sql,'oracle')` returns empty; `json`/`jsonv2` import does not round-trip its own export. Don't re-add those as import options. Group members must be parsed via `t.schema?.name ?? t.schemaName`.
- Oracle `ALL_TAB_COLUMNS` has no `HIDDEN_COLUMN` (use `ALL_TAB_COLS`); `SESSION_ROLES` column is `ROLE`. node-pg cannot parse `name[]` — cast `attname::text` inside `array_agg`.
- React Flow nodes stay `visibility:hidden` until measured; in a hidden/background browser pane they never get measured and edges don't render. Bring the pane to the front/take a screenshot before asserting on edges.
- When editing CodeMirror state from tests use `document.execCommand('insertText')` on `.cm-content`; setting `textarea.value` no longer applies.
- `node:sqlite` needs Node 24 (Docker image has it). Fetch clients send `Content-Type: application/json` on DELETE/logout with no body; `index.js` registers a lenient JSON parser for that.
- Public sign-up is closed after the first account; tests and scripts need an admin (see above). Existing demo Docker volumes keep `app.db`: delete the volume (`docker compose down -v`) to start with a clean user list.
- Refresh (`keepGroups`) preserves only TableGroups and node positions; other manual edits to imported tables are overwritten by design.
- On Windows (Git Bash) writing files with shell heredocs that contain quotes/backslashes is error-prone: prefer the editor tools or a script file. Git Bash also rewrites absolute container paths in `docker compose exec` arguments: prefix with `MSYS_NO_PATHCONV=1`. PowerShell blocks `npx.ps1`: use `npx.cmd`.

## Current state and where to resume

Everything below is implemented, committed and covered by the e2e scripts unless marked otherwise (details and acceptance criteria in `.specs/`): DBML editor + diagram, live import from PostgreSQL/Oracle (read-only sessions, privilege guardrails, TLS, manual/auto refresh), generated documentation with comments, accounts and administration (first account = administrator, groups, settings), private diagrams with autosave, sharing with people/groups/links, administrators manage every diagram (never others' connections), SSRF host policy.

Not verified yet: Oracle TLS success path (needs an Oracle with TCPS); `DB_HOST_POLICY=public-only` through the HTTP routes (only the policy functions are tested); a comment-level/edit-level *member* exercising the UI (API covered); opening a downloaded docs `.html` straight from disk.

Next steps, in order (`.specs/06-roadmap.md`): group-owned database connections (members use a read-only connection without seeing the secret, with an audit log), server-side scheduled refresh, account hardening (SSO, e-mail verification/reset, link expiry), public-deployment hardening.

Starting on a new machine: clone, `cp .env.example .env` (set `APP_SECRET`), `docker compose up -d --build`, open http://localhost:3000 and create the first (administrator) account, or `docker compose exec app node src/cli.js create-admin <email> <password>`. For the tests create a throw-away administrator and export `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`. The `demo-pg` roles `reader` (select only) and `writer` (can write) exist for the guardrail tests; the Oracle demo needs `--profile oracle` and may need `demo/oracle.sql` loaded once (see README).

The REA reverse-engineering MCP was only used to study the public dbdiagram.io UI for feature ideas; it is not needed to build, run or test the project (to use it again: `npx.cmd -y rea-agents setup --client claude_code --yes`, then restart Claude Code).

## Working agreements

- Smallest change that solves the problem; reuse what exists. Keep specs, README and the in-app Help tab consistent when behaviour changes.
- Report honestly what was and was not tested (e.g. Oracle TLS is unverified end-to-end).
- No attribution to third-party products in code/assets: this is a clean-room implementation, never copy code or images from dbdiagram.io.
