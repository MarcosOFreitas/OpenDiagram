# AGENTS.md

Guide for AI coding agents (and humans who like terse rules) working on **OpenDiagram**: a free, open-source (Apache-2.0), self-hostable, dbdiagram.io-style tool. A DBML editor with a live diagram, generated documentation, and live **read-only** metadata import from PostgreSQL and Oracle, with accounts, sharing and an audit log. It works with any agent that reads `AGENTS.md` (Codex, Cursor, Copilot, Gemini CLI, Claude Code, Aider, ...).

Read [`.specs/README.md`](.specs/README.md) for the specs and their status before any non-trivial work, and update the relevant spec in the same change.

## Setup and commands

Requirements: Docker with Compose v2 to run it; **Node 24** for development (the server uses the built-in `node:sqlite`); Chrome/Chromium only for the UI tools.

```bash
cp .env.example .env                          # set APP_SECRET (openssl rand -hex 32); uncomment COMPOSE_PATH_SEPARATOR + COMPOSE_FILE so the commands below include docker-compose.demo.yml
docker compose up -d --build                  # app on :3000 + demo-pg (+ demo-pg-tls)
docker compose --profile oracle up -d         # demo Oracle (slow first start) + its TLS proxy
docker compose up -d --build app              # rebuild after a code change (the web build runs inside the image)

cd server && npm install && npm start         # API only, data in ./server/data; first account created = administrator
cd web && npm install && npm run dev          # UI with hot reload on :5173, proxies /api to :3000
cd web && npx vite build                      # build into ../server/public; also the quickest syntax check of the UI
node --check server/src/*.js                  # quick syntax check of the API
```

There is **no linter**. Verification = unit tests (fast, no Docker) + the end-to-end scripts below + driving the UI in a browser. All scripts accept `BASE=http://host:port` (default `http://localhost:3000`). Server tests need an administrator of the instance under test; create a throw-away one:
`docker compose exec app node src/cli.js create-admin admin@example.com 'a-long-test-password'`, then `export TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=...`.

```bash
(cd server && npm test)             # unit tests: node:test, ~5 s, no Docker (server/test/*.test.js); http.test.js tries the real routes through app.inject (OD_NO_LISTEN=1)
(cd web && npm test)                # unit + component tests: Vitest, Testing Library, jsdom (web/src/**/*.test.{js,jsx})
git config core.hooksPath .githooks # once per clone: runs the tests the staged files can affect before every commit (FULL=1 = all)
bash .github/ci-e2e.sh              # what the CI `e2e` job runs: stack, test-auth, test-guardrails, uiaudit, behaviorcheck vs web/behavior.golden.json (~25 min in one run, ~8 min as the 4 CI shards; see its header)
node server/test-auth.mjs            # accounts, roles, groups, sharing, link permissions, shared connections, audit, SSRF policy
node server/test-guardrails.mjs      # read-only sessions, privilege warnings, PostgreSQL TLS modes
node server/test-oracle-tls.mjs      # Oracle TLS modes against demo-oracle-tls (needs --profile oracle and -f docker-compose.demo-tls.yml: the app trusts the public demo certificate only then)
node server/test-lineage.mjs         # column lineage of views from their SQL (pure)
node web/lineage-check.mjs           # the `// lineage:` comment parser (pure)
cd web && node roundtrip.mjs         # import -> export -> re-import per format (needs the oracle profile)
node web/uiaudit.mjs [screen ...]    # UI audit of every screen: light/dark, desktop/phone, keyboard; also flags symbol-only names and click targets a keyboard cannot reach (throw-away instance, see the file header)
node web/docshots.mjs                # retakes the documentation pictures (throw-away instance, see the file header)
node server/bench.mjs                # server load measurements for the Hosting requirements page (throw-away container with CPU/memory limits, see the header)
node web/benchclient.mjs             # browser cost of diagrams of several sizes (same page)
node web/visualsnap.mjs snap|compare # refactors: pixel comparison of 21 screens between two builds (see the file header)
node web/behaviorcheck.mjs           # refactors: behaviour fingerprint of menus, popovers, search and the table picker; diff old vs new build
```

`uiaudit.mjs`, `docshots.mjs`, `visualsnap.mjs` and `behaviorcheck.mjs` create accounts and diagrams: run them only against a throw-away instance, never against one that holds real data. For a refactor that must not change the UI, build the old and the new image, run `visualsnap.mjs snap` and `behaviorcheck.mjs` on a fresh instance of each, and require `compare` to report all screens identical and the two fingerprints to be equal. Do not claim a UI change works without loading it.

## Layout

- `server/src/` plain ESM JavaScript, no build step. `index.js` Fastify routes + hooks (CSRF origin guard, login requirement, forced password change, security headers, SPA fallback); `db.js` SQLite schema and migrations; `auth.js` scrypt passwords, sessions, throttling, settings; `admin.js` users/groups/settings and the last-administrator guard; `diagrams.js` diagrams, versions, grants, links, comments, `roleFor`; `store.js` saved connections (secrets AES-256-GCM with `APP_SECRET`) and shared connections; `policy.js` SSRF host policy; `audit.js` audit log; `agents.js` + `mcp.js` the MCP connector (agent accounts, bearer tokens, tools; an agent never sees a connection or credential); `presence.js` who has a diagram open (memory only); `lineage.js` column lineage of views (SQL parsing); `introspect.js` per-engine catalog queries to a neutral model, read-only session setup, TLS, privilege checks; `dbml.js` neutral model to DBML; `cli.js` operator tool (`create-admin`, `reset-password`, `list-users`, `backup`, `restore`).
- `web/src/` React 18 + Vite, JSX, no TypeScript. `App.jsx` root (auth gate, `/s/<token>` route) and `Workspace` (top bar, drawers, canvas, autosave, refresh); `useConnect.js` the Database drawer (connection list, form, schemas, picker state, import) as a hook; `layout.js` table sizes and every layout algorithm (pure); `diagramModel.js` DBML to diagram data, TableGroup merging on refresh, change summary (pure); `Editor.jsx` CodeMirror 6 DBML editor; `Auth.jsx`, `Admin*.jsx`, `Library.jsx`, `SharePanel.jsx`, `History.jsx`, `TablePicker.jsx`, `TablesPanel.jsx`, `Menu.jsx`; `Icons.jsx` shared SVG icons; `a11y.js` accessible names and dialog focus handling; `docsModel.js` + `DocsPage.jsx` the generated documentation (view and standalone HTML/Markdown export); `lineage.js` the lineage comments; `templates.js` starter diagrams; `styles.css` all app styles; `docsite/` the public documentation site served at `/docs` (`pages/*.md` is the content).
- `server/test/*.test.js` and `web/src/*.test.{js,jsx}` unit tests ([`.specs/07-testing.md`](.specs/07-testing.md) lists what each pins down); `.github/workflows/ci.yml` runs them with the build on every push and pull request, plus the `e2e` job (`.github/ci-e2e.sh`). `web/behavior.golden.json` is the expected output of `behaviorcheck.mjs`: when a change alters that behaviour on purpose, regenerate it and commit it with the change.
- `server/test/*.test.js` and `web/src/*.test.{js,jsx}` unit tests ([`.specs/07-testing.md`](.specs/07-testing.md) lists what each pins down); `.github/workflows/ci.yml` runs them with the build on every push and pull request.
- `web/*.mjs` and `server/test-*.mjs` e2e and UI tools (above). `web/cdp.mjs` is the tiny Chrome DevTools driver they share and `web/fixtures.mjs` the API client and the accounts/diagrams the audit and picture tools seed.
- `demo/` sample databases (PostgreSQL, Oracle, TLS proxies) for manual and e2e testing. `.specs/` product, architecture and security specs. `server/public` is a build artifact (git-ignored).

## Conventions

- Match the surrounding code: terse, no new layers, libraries or config for hypothetical needs. Server: plain ESM JavaScript. Web: React + JSX.
- **DBML text is the single source of truth.** Import means "generate DBML"; the diagram is always parsed from the editor text with `@dbml/core`. Never keep a second model in sync.
- Errors thrown by the API carry `statusCode`; the global handler returns `{ error }`. The UI shows them as toasts through `notify` (inside the Administration overlay they are shown in the panel).
- Diagram content (DBML, title, layout, connection link) lives on the server and autosaves; `localStorage` only keeps per-browser UI state (`view`, `lastDiagram`, panel flags, `gen:<id>`). Always wrap it in try/catch (`store()` helper in `api.js`).
- Keep specs, README and the documentation pages (`web/src/docsite/pages/*.md`) consistent with behaviour in the same commit that changes it.
- Commits: one logical change each, short imperative subject with a type prefix (`feat`, `fix`, `docs`, `chore`, `refactor`), body explains why. Never commit secrets, `.env`, real data or screenshots of real data.
- Clean-room: never copy code, text or images from dbdiagram.io or other products.

## Security invariants (do not weaken)

1. Every database session stays read-only: PostgreSQL `BEGIN READ ONLY` + `default_transaction_read_only=on`; Oracle `SET TRANSACTION READ ONLY`. Only catalog queries; never read user table data.
2. Never return or log secrets (`password`, `caPem`). `store.list()` / `listFor()` strip them; `get()` / `getForUse()` decrypt only on the server. A **shared** connection (registered by an administrator) is used exactly as registered: `resolve()` ignores request fields for it, and every use goes through `audited()` into the audit log (never log secrets or request bodies).
3. The Oracle connect descriptor is built from user input: keep the `SAFE` validation in `oraConnectString`.
4. A failed privilege check is reported as a warning, never treated as "safe".
5. Authorization lives in the server, never in the UI. Roles are `admin` / `member`; `/api/admin/*` requires admin; a diagram's effective level is owner > admin (on others' diagrams: everything except the owner's `source` and connections) > edit > comment > view (`roleFor` in `diagrams.js`); the instance keeps at least one active administrator (`guardLastAdmin`); accounts that must change their password can only call `/api/auth/*`; every `/api` route except `health`, `auth/*` and `shared/*` requires a session; resources of other accounts answer 404; share-link routes check the link's level and require login for `comment` and `edit`. Never put `source`, connections or secrets in a `/api/shared` payload.
6. Do not add features that widen exposure (arbitrary SQL execution, file reads, new outbound fetches) without revisiting [`.specs/05-security.md`](.specs/05-security.md). Database hosts go through `assertHostAllowed`.
7. The MCP connector (`/mcp`) acts as an **agent** account with no access except what diagram owners shared with it. It must never return a connection, a credential, `source`, a share link or a setting: build tool output only from the diagram's title, DBML, version, access level and comments (`server/test/mcp.test.js` checks it), mark it as untrusted, and audit every call without its content. Agent tokens (`odt_...`, hash only) are valid only on `/mcp`; agents are never administrators.

## UI standard

Every UI change follows [`.specs/11-ui-review.md`](.specs/11-ui-review.md). The rules are based on the public [ui-ux-pro-max skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT), vendored under `.claude/skills/ui-ux-pro-max` (optional for agents that support skills):

- **Reuse, do not restyle.** Controls, cards, dialogs, menus and motion come from the "UI foundation" layer at the end of `web/src/styles.css` (tokens `--r-*`, `--ctl*`, `--ease`, one control look through zero-specificity `:where()` selectors). No per-container button rules, no new radius, height or duration values, no emoji icons (use `Icons.jsx`).
- **Both themes and both widths.** Light and dark theme (white surfaces such as `.admin` and `.menu-pop` reset `--muted` and `--line`) and 375px without horizontal scroll. Motion only with `opacity` / `transform`, never on canvas nodes, and it must respect `prefers-reduced-motion`.
- **Accessibility floor.** An accessible name on every control (icon buttons get `aria-label`), pointer targets of at least 24px, text contrast of at least 4.5:1 (colours that come from user data are chosen by contrast, see `readable()`), keyboard focus always visible, dialogs built on the `.admin` overlay (role, name, focus trap and focus return come from `a11y.js`).
- **Verify**: rebuild, then `node web/uiaudit.mjs <screen ...>` on a throw-away instance for the screens you touched. The bar is **zero findings**. A new screen, drawer, popup or dialog is added to that script in the same change. If a documented screen changed, rerun `node web/docshots.mjs` and look at every picture.

## Gotchas

- `@dbml/core` (10.x): `importer.import(sql, 'oracle')` reads tables, keys, indexes and comments and skips views, sequences and triggers, but fails on SQL*Plus lines (`connect`) and system-privilege grants (`web/src/formats.test.js`); `json` import still does not round-trip its own export: do not add it as an import option. Group members must be read through `t.schema?.name ?? t.schemaName`.
- Oracle `ALL_TAB_COLUMNS` has no `HIDDEN_COLUMN` (use `ALL_TAB_COLS`); the `SESSION_ROLES` column is `ROLE`. node-pg cannot parse `name[]`: cast `attname::text` inside `array_agg`.
- React Flow render loops: the TableGroup boxes (`g:*`) are derived in `shown` on every render, so their measurements must not reach `onNodesChange` (`nodeChanges` in `diagramModel.js`), and an empty change list must not call it (`applyNodeChanges` returns a new array even for nothing, which re-renders everything); never subscribe the `Workspace` or a node/edge component to the whole viewport (`useViewport` re-renders on every pan frame: read the zoom with `useStore((s) => s.transform[2])` in a small component, or `useStoreApi().getState()` when needed). Frame rates mean nothing in headless Chrome (software drawing): `CDP_GUI=1` opens a real window with the GPU.
- React Flow nodes stay `visibility: hidden` until measured; in a hidden browser pane they are never measured and edges do not render. Sizes measured inside the canvas depend on the zoom.
- React Flow's own CSS sets `outline: none` on nodes with a higher specificity than a plain rule: the focus ring has its own selector.
- Never name a new CSS class `.note` or `.top` (the Docs view and React Flow already use them). The Arrange popover lives inside `.dock`: dock rules must use `.dock > button` / `.dock > span`.
- Docker `postgres` images keep an anonymous volume: editing `demo/pg.sql` has no effect until `docker compose rm -sfv demo-pg && docker compose up -d demo-pg`.
- `node:sqlite` needs Node 24 (the Docker image has it). Fetch clients send `Content-Type: application/json` on `DELETE` and logout with no body; `index.js` registers a lenient JSON parser for that.
- Public sign-up is closed after the first account; tests and scripts need an administrator. A Docker volume keeps `app.db`: `docker compose down -v` starts with a clean user list. An administrator sees every diagram, so a fresh test administrator opens someone else's diagram first: create and select your own before taking screenshots.
- Refresh (`keepGroups`) preserves only TableGroups and node positions; other manual edits to imported tables are overwritten by design.
- On Windows with Git Bash, prefix absolute container paths in `docker compose exec` arguments (and `openssl -subj`) with `MSYS_NO_PATHCONV=1`; PowerShell blocks `npx.ps1` (use `npx.cmd`); heredocs with quotes or backslashes are error-prone, prefer a script file.
- When editing CodeMirror state from a test, use `document.execCommand('insertText')` on `.cm-content`.

## Agent skills (the harness)

Skills live in `.claude/skills/<name>/SKILL.md`; any agent can read one as a plain guide. They are generic on purpose: **the rules of this repository are in this file and win over a skill**; the part below says how each skill applies here. Several can apply to one task (a feature usually goes through the first five rows in order).

| When | Skill |
|------|-------|
| Before a large feature, or a change to table selection, sharing, connections or security | `grill-me` |
| Implementing a feature or fixing a bug | `test-driven-development` |
| Before saying "done", "fixed" or "passes", before a commit or PR | `verification-before-completion` |
| After a feature, before merging | `requesting-code-review` |
| Refactoring | `code-simplification` |
| Input, authentication, secrets, outbound fetches, dependencies | `security-and-hardening` |
| A failing test, a broken build, unexpected behavior | `debugging-discipline` |
| Something is slow, before adding a cache, memo or index | `performance-optimization` |
| SQL, Oracle or PostgreSQL queries and catalog reads | `oracle-postgres-sql` |
| Routes, error shapes, retries, share-link payloads | `api-and-interface-design` |
| The MCP connector (`server/src/mcp.js`) | `mcp-builder` |
| Workflows, the e2e job, Docker, Compose | `ci-cd`, `docker` |
| Checking a UI change in a real browser | `browser-verification`, with the UI standard above and `ui-ux-pro-max` |
| Reviewing or improving an existing screen; colors, states and feedback, layout and type | `ui-ux-review`, `ui-color-system`, `ui-feedback-states`, `ui-layout-typography` |

**How each applies here**

- **`test-driven-development`**: server tests are `cd server && npm test` (`node:test`, `server/test/*.test.js`; a test that touches SQLite imports `./env.js` first; a route's behaviour (status codes, validation, the `{ error }` shape, auth and CSRF guards) is tried first in `server/test/http.test.js` through `app.inject`, the Docker e2e scripts come after); web tests are `cd web && npm test` (Vitest + Testing Library; a plain-module test starts with `// @vitest-environment node`; `userEvent.setup({ delay: null })`). A bug fix ships a regression test that fails on the old code (see Working agreements). Logic that needs a test leaves the component: `diagramModel.js`, `layout.js`, `tableSelection.js`. What each test pins down: `.specs/07-testing.md`. Read `.specs/12-table-selection.md` before touching the table selection.
- **`verification-before-completion`**: the commands that prove a claim here: both `npm test` (the web run includes the keyboard tests of `Library.test.jsx` and `a11y.test.jsx`); `cd web && npx vite build`; `node --check server/src/*.js`; a UI change is loaded in a browser and `node web/uiaudit.mjs <screens>` reports zero findings on a throw-away instance; a refactor that must not change the UI passes `visualsnap.mjs` (all screens identical) and `behaviorcheck.mjs` (fingerprint equal); an end-to-end change passes the scripts of `.specs/07-testing.md` or `bash .github/ci-e2e.sh`. Say what was not tested (for example no Oracle server with a real private CA).
- **`requesting-code-review`**: give the reviewer the spec in `.specs/` and tell it to read this file: the **security invariants** and the **UI standard** are review criteria and a change that weakens one is Critical; a bug fix without a test that fails on the old code is Important at least.
- **`grill-me`**: anchor the questions in the invariants and the specs, and always ask what the smallest version is, which failing test proves it, what it does for a member, a share-link visitor and an agent account, and how it looks at 375 px and in the dark theme. Record locked-in decisions in the matching `.specs/NN` file in the same change.
- **`performance-optimization`**: `node server/bench.mjs` (server, throw-away container with limits) and `node web/benchclient.mjs` (browser cost of diagrams of several sizes); the numbers feed the *Hosting requirements* documentation page. Layouts are pure functions in `web/src/layout.js`: time them before touching the canvas. The import runs catalog queries only; never add a query that reads user table data to speed something up. Motion stays on `opacity` / `transform`, never on canvas nodes.
- **`oracle-postgres-sql`**: invariants 1, 3 and 4 above are the first layer (read-only sessions, the `SAFE` descriptor check, privilege warnings as warnings); the catalog queries live in `server/src/introspect.js`; remember `ALL_TAB_COLS` and `attname::text` from Gotchas; demo databases are in `demo/`.
- **`api-and-interface-design`**: errors carry `statusCode` and the handler returns `{ error }`; every `/api` route except `health`, `auth/*` and `shared/*` requires a session; never put `source`, connections or secrets in a `/api/shared` payload.
- **`mcp-builder`**: invariant 7 is binding (the connector never returns a connection, a credential, `source`, a share link or a setting; `server/test/mcp.test.js` checks it).
- **`ci-cd`**: `.github/workflows/ci.yml` has `unit` on every push and pull request and the sharded `e2e` on `main` and on demand; running e2e only on `main` is a conscious trade-off (see `.specs/07-testing.md`), so keep the golden `web/behavior.golden.json` current.
- **`docker`**: Windows + Git Bash notes (`MSYS_NO_PATHCONV=1`, anonymous volumes of the postgres images) are in Gotchas.
- **`browser-verification`**: this repository drives Chrome through `web/cdp.mjs`; run against a throw-away instance, never one with real data.
- **`ui-ux-review`** (+ `ui-color-system`, `ui-feedback-states`, `ui-layout-typography`): the rubric is the UI standard above and [`.specs/11-ui-review.md`](.specs/11-ui-review.md), not the skill's generic checks (those only fill gaps). The concept skills each cover one slice: `ui-color-system` (roles, contrast, both themes: the tokens and `readable()` here), `ui-feedback-states` (loading, empty, error, permission, toasts, motion tokens), `ui-layout-typography` (hierarchy, spacing scale, 375 px). A review always loads the screen, and fixes keep to the rules learnt in `.specs/11-ui-review.md` (click targets are buttons or `press()`, symbol-only controls get `aria-label`). Findings use the foundation tokens and components (never a new radius, height, color or icon style); the bar for a touched screen is `node web/uiaudit.mjs <screen>` with zero findings, and a documented screen also reruns `node web/docshots.mjs`. Both themes and 375 px are always part of the review. `ui-ux-pro-max` stays an optional extra reference.
- **`code-simplification`**: for a refactor that must not change the UI, the proof is `visualsnap.mjs` plus `behaviorcheck.mjs` on the old and the new image.

The skills are composed from MIT and Apache-2.0 sources; sources, licences and notices are in `.claude/skills/THIRD_PARTY.md`. Add a skill only after reading all of it (scripts, hooks and network calls included) and record it there. The maintainer keeps a wider personal set outside this repository.

## Working agreements

- **Every bug fix ships a regression test that fails on the old code** (break the fix on purpose, watch it fail, restore it); every feature ships unit tests for its logic. Keep logic out of components when a plain module can hold it (`web/src/diagramModel.js` is the example). Details and rules: `.specs/07-testing.md`.
- The table selection (picker, `useConnect`, `source.tables`, `importModel`) broke four times in three days, three times for the same reason (an empty list means "all"). Read [`.specs/12-table-selection.md`](.specs/12-table-selection.md) before touching it and add the missing tests it lists.
- Smallest change that solves the problem; reuse what exists. Report honestly what was and was not tested (for example: no Oracle server with a real private CA was tried).
- Do not weaken a security invariant to make a test pass; fix the test or ask.
- A change that fails `uiaudit.mjs` or breaks an e2e script is not finished.
