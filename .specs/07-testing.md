# 07 — Testing

Verification has three layers (the test pyramid). Unit tests are the base: fast, no Docker, run on every commit and in CI. End-to-end scripts and the UI tools sit on top and need a running stack; [`tools/README.md`](../tools/README.md) says which instance, port and credentials each one wants.

## Unit tests (every commit, CI)

```bash
cd server && npm test                # node:test (built in, no dependency): server/test/*.test.js
cd web && npm test                   # Vitest + Testing Library + jsdom (devDependencies of the web only): web/src/**/*.test.{js,jsx}
cd web && npm run test:watch         # while developing
cd server && npm run test:coverage   # coverage table of the server tests (Node's built-in coverage)
```

Both finish in seconds and need neither Docker nor Chrome. Test files that touch SQLite import `server/test/env.js` first (a throw-away `DATA_DIR` and a fixed `APP_SECRET`); every file runs in its own process, so each has its own empty database.

| Area | File | What it pins down |
|------|------|-------------------|
| server | `dbml.test.js` | model to DBML: pk, quoting, refs, views with and without the full DDL, enums, lineage, sequences, check constraints (a named `checks` block) and the `PARTITIONED BY` line; triple quotes cannot escape a note |
| server | `policy.test.js` | SSRF policy: private/CGNAT/link-local ranges, allowlist, public-only, IPv6 in any spelling (an IPv4 address written in hex inside IPv6, `0::1`), a zone id refused |
| server | `proxy.test.js` | behind a reverse proxy (`TRUST_PROXY=1`): the Origin check compares with `X-Forwarded-Host`, so a proxy that rewrites `Host` still signs people in (own file: `TRUST_PROXY` is read when `index.js` builds the app) |
| server | `secret.test.js` | `APP_SECRET`: a local trial starts with a warning, a set key starts silently, hosted settings without a key refuse to start, an empty key counts as not set |
| server | `migration.test.js` | `db.js` on a database made before `diagram_seen`: the table is added, the data stays, a seen mark goes with its person or diagram |
| server | `audit.test.js` | every filter of the audit log, paging, facets, CSV formula guard, retention |
| server | `backup.test.js` | daily backup: one complete copy per day (opens on its own), nothing new the same day, old copies deleted, other files kept, the folder inside `DATA_DIR`; checked in a read-only container: written at start, `integrity_check` ok, `cli.js restore` brings it back |
| server | `store.test.js` | secrets encrypted at rest and never listed, shared connection access by user and by group, what members may see; secrets saved under another `APP_SECRET`: the lists still work (`secretLost`), using one asks for the password, saving heals |
| server | `merge.test.js` | what a refresh keeps (TableGroups, hand-written lineage): the same cases as the browser copy in `diagramModel.test.js`; `structural`, the refresh summary (tables added, removed, changed; nothing for a comment, a side that does not parse or a text over 500 KB) |
| server | `dbmlParse.test.js` | the server's DBML parse gives the same database and the same error `diags` as `@dbml/core`'s `Parser` (the web copy has the same test) |
| server | `migration.test.js` | `db.js` on a database made before `diagram_seen`: the table is added, the data stays, a seen mark goes with its person or diagram (child processes on one data folder) |
| server | `refresh.test.js` | scheduled refresh: which diagrams are due (minimum 5 min, jitter, pause), saved as its own history entry with the structural summary (the line summary when nothing structural changed; the audit detail says the same), which lights "changed since you last opened it" for whoever opened the diagram before (an entry with no author id), same text = no-op, baseline for old links, failures and pause, conflict retried, disabled owner / lost connection, skipped while someone edits, audit of shared connections |
| server | `sessions.test.js` | the session list (device, current one, ids that are not the stored hash), revoking one / all but the current / never another person's, session length and inactivity limit, the persistent failed-attempt limiter under a hashed key, link expiry |
| server | `http.test.js` | the real routes through `app.inject` (`OD_NO_LISTEN=1` makes `index.js` build the app without a port or timers): session required except health, the cross-origin guard, `baseVersion` (stale = 409, not an integer = 400), prototype-name access = 400, `{ error }` shape, the summary of a save after a refresh (the next edit starts a new entry; a refresh save without `dbml` still gets its own entry; the parse runs only when the entry is written, never on a 409 or a no-op save, and at most 6 times in 10 minutes per person, then the line summary), "changed since you last opened it" (never opened: nothing; someone else's change lights it, one's own does not, also over a newer version or by restoring one; opening puts it out; the change and the count only for editors). New route behaviour is tried here first, not only by the Docker e2e scripts |
| server | `cli.test.js` | `cli.js` as a separate process: `backup` copies the database (dated name by default, never overwrites), `restore` brings it back, refuses a file that is not an OpenDiagram database (current data untouched) and refuses while the server's 30-second mark is fresh unless `--force` |
| server | `startup.test.js` | starting the server (importing `index.js`) loads no DBML parser; `loadParser()` loads the light one (`@dbml/parse`) and never `@dbml/core` (about 300 MB of memory). A resolve hook in a child process sees every import |
| server | `mysql.test.js` | the MySQL driver without a server: connection options (`disableEval`, no `LOCAL_FILES`, no multiple statements, timeouts, TLS modes, optional database), the read-only session order and rollback on failure, the privilege allowlist on real `SHOW GRANTS` lines (root, writer, reader, `EXECUTE`, table and column grants, LIKE patterns, roles), column mapping (enum, defaults, `AUTO_INCREMENT`), a view's comment, MariaDB's statement limit and default values, and `myExpr` / `myPartition` (check clauses and partition keys as plain SQL, MySQL 8.4's escaped quotes) |
| server | `static.test.js` | the built UI: hashed `/assets` files are cached for a year as immutable and sent pre-compressed (brotli, then gzip, plain without `Accept-Encoding`, `Vary: accept-encoding`); `index.html` and the SPA fallback are `no-cache` (`OD_PUBLIC_DIR` points at a throw-away folder) |
| server | `mcp.test.js` | agents (member, no sign-in, hidden, not promotable), tokens (hash only, expiry, revoke, disabled, switched off), the protocol, every tool at each access level, "cannot see = does not exist", stale version, invalid DBML, the history entry, group grants, **no connection data in any output**, audit without content, rate limit |
| server | `recovery.test.js` | the recovery key: needs the password, shown once, any spelling works once, same answer for every failure, limits per address and per e-mail, a new key replaces the old, an administrator reset voids it |
| server | `closing.test.js` | closing an account (signed out, private connections gone, links and grants removed, shared connections kept), the 7-day waiting list, handing a diagram to a person and a group, purge, the failed-sign-in cap |
| server | `diagrams.test.js` | `roleFor`, grants, 404 for other accounts' diagrams, version conflicts (409), history, summaries |
| server | `auth.test.js` | password rules, login throttling (per address + e-mail, per address across e-mails, per e-mail across addresses; a success does not reset the wider budgets), sessions and cookies, sign-up policy |
| server | `admin.test.js` | last-administrator guard, groups, settings, directory search |
| server | `introspect.test.js` | catalog rows to the neutral model (the part that needs no database): checks and partitioning on their table, Oracle's system `NOT NULL` checks skipped; driver errors in plain words (`explainDbError`); a PostgreSQL partition named in a stored selection is not reported missing; `pgColumn` / `oraColumn` (serial, identity, generated and virtual columns), a partial index's `where`, a partial unique index on the key columns kept |
| web | `useConnect.test.js` | the Database drawer flow: list reloads when the drawer opens or Administration closes, a shared connection is never saved and imports by its own id, schemas for a connection that has none, Full DDL follows the diagram link, save/delete/reset |
| web | `precompress.test.js` | the build step `web/precompress.js` writes `.br` and `.gz` that decompress to the original, for text files of 1 KB or more only (not images) |
| web | `layout.test.js` | every layout algorithm: finite positions, no overlapping tables, deterministic, group boxes never overlap, flow direction (left to right, pipeline, lineage), manual positions kept |
| web | `TablePicker.test.jsx` | search matcher, "nothing ticked = all", tables in a group count as selected, one group per table, Full DDL |
| web | `tableSelection.test.js` | the table selection value and every row of the picker matrix (first import / all / list / gone table x untouched / ticked / unticked / grouped), see [12](12-table-selection.md) |
| web | `AdminAgents.test.jsx` | the Agents tab: list, switched-off warning, token shown once, create, disable, delete |
| web | `Recovery.test.jsx` | the Account recovery-key section (shown once, Copy, wrong password, Remove) and the sign-in screen's "Forgot your password?" form |
| web | `AccountSecurity.test.jsx` | Account sessions (End, sign out the others) and the delete-account form (password, wrong password, cancel) |
| web | `handles.test.js` | `handleColumns`: column handles only for the columns a reference (all of a composite one, self and inline references, quoted names) or a lineage arrow names; `edgesOf` + `handleColumns` on every template and the 50/100/200-table stress schemas: every handle an edge asks for exists. Checked once in a browser too: 2,028 drawn edges of 5 diagrams x 4 display modes had the same SVG path before and after, with no React Flow handle error |
| web | `diagramModel.test.js` | DBML to diagram data, TableGroups kept on refresh, `refreshSummary` (the toast of a manual refresh, in the words of `schemaDiff.js`), view kind, `bentPath` (a line whose label was dragged keeps the chosen style: Rounded and Step stay square, the label stays on the line), `nodeChanges` (the measurements of the derived TableGroup boxes never reach the nodes state: they caused a render loop; `benchclient.mjs` reports `idleReactCommitsPerSecond`, about 1 instead of 45) |
| web | `docsModel.test.js`, `templates.test.js` | generated documentation and Markdown (with the Checks list); every starter template parses and documents |
| web | `api.test.js`, `historyDiff.test.js`, `Menu.test.jsx`, `AdminAudit.test.jsx` | fetch wrapper and storage guards, line diff, menu dismissal, audit filters sent to the server |
| web | `layout.test.js` (fixes of 2026-10-22) | tables new to a diagram with places never overlap the kept ones (a second import did); the header width counts the view mark |
| web | `History.test.jsx` | the Compare dialog: the structural summary and the changes grouped by table above the text diff, a side with DBML errors (text only), no structural change, the 300-line limit |
| server | `schemaDiff.test.js` | the structural diff: no change for layout and documentation, tables and columns added / removed (a rename is both), column properties on one line, the primary key, indexes by columns, relationships by ends, enums, checks by name or expression, notes, the summary and the order |
| web | `formats.test.js` | what the Import drawer relies on from `@dbml/core` (each import format on a sample, the Oracle importer's limits), so a library upgrade that breaks it fails here |
| web | `AdminConnections.test.jsx` | the CA certificate field is offered with TLS verify for PostgreSQL and MySQL, not for Oracle |
| web | `smoke.test.jsx` | the test setup itself (Testing Library renders into jsdom) |
| web | `dbmlParse.test.js` | the app's own DBML parse gives the same database (every template and a full case) and the same error `diags` as `@dbml/core`'s `Parser` |
| web | `workspace.test.jsx` | the `App` with a stubbed API: autosave of the owner (title, DBML, link, layout, `baseVersion`), the edit-conflict dialog on a 409 and no further save, deleting the open diagram leads to the create options, opening a diagram puts its "changed since you last opened it" out at once and the Diagrams tab loads the list again |
| web | `searchPanel.test.js` | the editor's Ctrl+F bar in a real CodeMirror view (jsdom): match count and its text, focus in the find field on open (it went to the DBML), Enter / Shift+Enter, the option toggles, replace on demand and never when read-only, Escape; `uiaudit.mjs editor-search` audits it |
| web | `emptyHome.test.jsx` | the whole `App` with a stubbed API: an account without diagrams gets the create options and no `POST /api/diagrams` (the sample used to be created behind its back); `uiaudit.mjs home-empty` audits the screen |
| web | `Library.test.jsx`, `a11y.test.jsx` | `pickDiagrams` (search by title or owner, sort, linked only), the search box from 9 diagrams on, delete asked in the card with the focus on Cancel, "changed since you last opened it" (the latest change and the count for editors, the badge alone for view, nothing when there is nothing new); the Diagrams list is reachable by keyboard (Tab + Enter opens, once), delete buttons name the diagram, the open one is `aria-current` and says so in words; `press()` makes a non-button focusable and Enter/Space-operable |

### Rules

- **A bug fix lands with a regression test that fails on the old code.** Prove it: break the fix on purpose, watch the test fail, restore it.
- **A new feature lands with unit tests for its logic** and, when it has UI flows, a check in `behaviorcheck.mjs` / `uiaudit.mjs`.
- Logic that must be tested does not stay inside a React component: move it to a plain module (as `diagramModel.js`) or test the component through Testing Library.
- Assert on behaviour users see (text, roles, what is sent to the server), not on implementation details.
- A `beforeEach` must not return the mock: Vitest runs a returned function as teardown.

### Continuous integration and the hook

`.github/workflows/ci.yml` has the `unit` job and the `e2e` job (run as four `e2e-shard` jobs plus `e2e`, which reports their result). Every action is pinned by commit SHA (the tag is in a comment; Dependabot updates both). `unit` runs on every push to `main` and every pull request (about 1.5 minutes); `e2e` only on push to `main` and on demand (Actions -> ci -> Run workflow), not on pull requests. A newer push to the same pull request cancels the run still going (a push to `main` is never cancelled: that commit would stay unverified). Jobs run on `ubuntu-24.04` (pinned: `ubuntu-latest` moves to Ubuntu 26 on 2026-10-19, and Chrome, Docker and Compose come from the runner image), with `contents: read` permissions and a timeout each. `.github/ci-e2e.sh` waits for the app with a limit and prints the container logs when it fails, and a change that only touches root `*.md`, `.specs/` or `LICENSE` runs nothing. `unit`: `npm audit --audit-level=high` for the server and the web (dev dependencies included: a high advisory turns CI red), `node --check`, server tests, the pure lineage checks, web tests and `vite build`. `e2e` (after `unit`, about 8 minutes of wall time: the UI audit was 22 of the 25 minutes, so it runs as 4 parallel shards, `e2e-shard` 1 to 4, one runner each; the job called `e2e` only reports their combined result): `.github/ci-e2e.sh` starts the stack with Docker Compose and runs `tools/test-auth.mjs`, `tools/test-guardrails.mjs`, `tools/uiaudit.mjs` (zero findings) and `tools/behaviorcheck.mjs`, whose output must equal `tools/behavior.golden.json`. The script runs every step even if one fails and lists what failed; `OD_REUSE=1` runs it against a stack that is already up (see its header). `tools/docsjump.mjs` clicks the Docs index and an in-content link with real mouse events on a big diagram and checks every table lands at the top of the content pane (exits 1 otherwise): the sections far from the screen are laid out late (`content-visibility`), which a first jump does not see. Run it by hand after touching `DocsPage.jsx` (`node tools/stressdbml.mjs 200` gives the diagram).

`.github/workflows/release.yml` runs on a pushed `v*` tag: it builds the image for `linux/amd64` and `linux/arm64`, pushes it to GHCR (`1.2.3`, `1.2` and `latest` for a release; only the full version for a pre-release such as `1.0.0-rc.1`) and opens a **draft** GitHub release with notes generated from the commits, which the author reviews and publishes. The workflows pass `actionlint` (`docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint`). The Oracle checks (`--profile oracle`) and the pixel comparison of `visualsnap.mjs` are not in CI (heavy image; fonts differ between machines).

**`tools/behavior.golden.json`** is the expected behaviour fingerprint (menus, popovers, search, table picker, shared connection flow, groups, Full DDL). When a change alters that behaviour on purpose, regenerate it on a throw-away instance (`BASE=... SNAP_EMAIL=... SNAP_PASSWORD=... node tools/behaviorcheck.mjs > tools/behavior.golden.json`), read the diff and commit it with the change. When the e2e job fails on it, the diff in the log says what moved.

To run the unit tests before every commit: `git config core.hooksPath .githooks` (once per clone; `git commit --no-verify` skips it, CI does not). The hook runs only what the staged files can affect: nothing for docs and specs, the server tests when `server/` changed, and for `web/` only the tests that import a changed file (`vitest related`; all of them when `package.json`, the Vite config or `test-setup.js` changed), server and web in parallel. `FULL=1 git commit ...` runs everything.

**Keeping the unit tests fast** (the web suite went from ~31 s to ~6 s): test files of plain modules start with `// @vitest-environment node` (no jsdom, and `test-setup.js` does not even load React for them); `userEvent.setup({ delay: null })` in component tests; a wait that exists only for the user (a debounce) is shortened in the test (see `AdminAudit.test.jsx`), never in the component. Measure with `npx vitest run --reporter=json --outputFile=out.json` and sort the files by time.

### Not covered by unit tests

- Presence and most of the `Workspace` (beyond the autosave, conflict, delete and "last opened" paths of `workspace.test.jsx`) are covered by `behaviorcheck.mjs`, `uiaudit.mjs` and the e2e scripts. The connection flow is the hook `useConnect.js` and the layouts are `layout.js`, both unit tested.
- Database drivers (`pgWith`, `oraWith`, `myWith` and the catalog queries) need a real database: `test-guardrails.mjs` (PostgreSQL and MySQL against the demo databases: privileges of root / writer / reader, strict mode, the picker, enum, increment, defaults, relationships, views and their lineage, triggers, check constraints and the `PARTITIONED BY` line, a write refused inside the app's own read-only session, TLS modes). Oracle is tried by `test-oracle-tls.mjs`, `roundtrip.mjs` and `ORACLE_PORT=1522 node tools/test-guardrails.mjs` with the Oracle demo, none of them in CI.
- Branch protection (a failing CI blocking the merge) is a repository setting, not part of the code ([`FORKING.md`](../FORKING.md)).

## Local test topology

Which instance, port and credentials each tool wants, and a throw-away instance recipe: [`tools/README.md`](../tools/README.md). Every UI tool refuses `:3000`; `ci-e2e.sh` needs `:3000` and `:3100` free.

## Setup

```bash
# uncomment COMPOSE_PATH_SEPARATOR and COMPOSE_FILE in .env (see .env.example) so docker compose includes docker-compose.demo.yml
docker compose up -d --build
docker compose --profile oracle up -d     # for Oracle checks / roundtrip.mjs
docker compose exec app node src/cli.js create-admin admin@example.com 'a-long-test-password'
export TEST_ADMIN_EMAIL=admin@example.com TEST_ADMIN_PASSWORD='a-long-test-password'
```

## Automated

| Script | Needs | Checks |
|--------|-------|-------------|
| `TEST_ADMIN_EMAIL=… TEST_ADMIN_PASSWORD=… node tools/test-auth.mjs` | app + an administrator (`docker compose exec app node src/cli.js create-admin <email> <password>`) | about 230 checks: sessions list and revocation, sign-in events in the audit log, link expiry, closing an account and handing its diagrams over, closed sign-up, admin creates users/temporary passwords/forced change, versions and edit conflicts (409), shared connections with grants and the audit log, link passwords and throttling, presence, roles and 403s, last-admin guard (isolated DB), disable/enable/reset/delete, flat groups with multi-membership, directory, per-account isolation, administrator access to every diagram (no connection link, no borrowed connections), sharing with people and groups (highest level, leave/delete group, revoke), link levels, settings, CSRF, logout, headers, SSRF policy functions. Creates and removes throw-away users/groups |
| `node tools/test-guardrails.mjs` (also needs `TEST_ADMIN_*`) | app, `demo-pg`, `demo-pg-tls`, `demo-mysql`, (optional `demo-oracle`) | scheduled refresh: a linked diagram with an old `source.gen` is refreshed by the server within ~2 minutes with no page open, as a history entry by *Scheduled refresh* (waits up to 150 s); privilege warnings (superuser/writer/reader); strict mode blocks writer, allows reader; a write refused inside the app's own read-only session (`pgWith`, `myWith`; `oraWith` with `ORACLE_PORT`); PG TLS: off, verify w/o CA (fails), verify + CA PEM, noverify, verify vs non-TLS (fails); Oracle descriptor injection rejected; Oracle TCPS vs plain listener fails cleanly |
| `TEST_ADMIN_EMAIL=… TEST_ADMIN_PASSWORD=… node tools/test-oracle-tls.mjs` | app + `--profile oracle` (`demo-oracle`, `demo-oracle-tls`) and `-f docker-compose.demo-tls.yml` (the app trusts the demo certificate) | Oracle TLS modes: verify, host-name mismatch, `serverDn` accepted/refused, `noverify`, TLS off against TCPS, DN injection |
| `node tools/test-lineage.mjs` | nothing (pure) | view column lineage: SQL parsing into output column -> source column (joins, aliases, expressions, aggregates, `*`, sub-selects, CTE, UNION, view on view, Oracle upper case, unreadable SQL gives null) |
| `node tools/lineage-check.mjs` | nothing (pure) | the `// lineage:` comment parser (table and column level, `(auto)` marker, merging, unknown names) and the upstream/downstream closure |
| `node tools/uiaudit.mjs [screen ...]` (needs `AUDIT_EMAIL`/`AUDIT_PASSWORD` of a throw-away instance, see its header) | a throw-away app instance with `demo-pg`; Chrome installed | UI audit of every screen in light/dark and desktop/phone: names, controls named only by a symbol (✕), click targets the keyboard cannot reach (an element with a pointer cursor that is not, and has no, focusable parent or child), targets, labels, contrast, overflow, dialogs, keyboard walk ([11](11-ui-review.md)); also the PNG and SVG exports (`export-images`), a comment-level member posting a column comment with real key events (`member-comment`) and an edit-level member's autosave (`member-edit-save`), each confirmed through the API; zero findings is the bar |
| `node tools/docshots.mjs` (needs `SHOTS_EMAIL`/`SHOTS_PASSWORD` of a throw-away instance) | same | retakes the documentation pictures |
| `node tools/visualsnap.mjs snap <dir>` / `compare <dirA> <dirB>` (needs `SNAP_EMAIL`/`SNAP_PASSWORD`) | a throw-away instance per build | refactors: 21 static screens as PNG, compared pixel by pixel between the old and the new build; also reports JavaScript errors per screen |
| `node tools/behaviorcheck.mjs` (same variables) | same | JSON fingerprint of menus, popovers, search, export list, copy, the table picker, the shared-connection flow, groups and Full DDL; compared with `tools/behavior.golden.json` in CI, and old vs new build in refactors |
| `node tools/roundtrip.mjs` (also needs `TEST_ADMIN_*`) | app, `demo-pg`, `demo-mysql`, `demo-oracle` | import → export (pg/mysql/mssql/oracle/json) → re-import comparison; prints diffs. Expected: PG→PG, Oracle→PG, Oracle→MSSQL identical; others fail as documented in [04](04-formats.md) |

`test-auth`, `test-guardrails` and `test-oracle-tls` exit non-zero on failure (`roundtrip.mjs` only prints; read its output). Demo data drifts if you alter `shop.*` manually — the scripts assume ≥ 4 PG tables.

## Manual UI checklist (browser)

- Fresh volume: first screen offers to create the administrator; afterwards public sign-up is closed. Admin → create user (temporary password shown once) → sign in as that user: forced password change → workspace. Admin → groups → add member → share a diagram with the group → the member sees it under *Shared with me* with the right permission.
- First sign-in of a new account → **No diagrams yet** with *New blank diagram* and the templates, nothing created; choosing the sample gives "Online store - sample" (8 tables, 10 refs, 3 groups); deleting the last diagram comes back to that screen; *Start from a template* creates another; switching between two diagrams with identical DBML still draws the canvas → edit → `Saved`; reload keeps content and table positions.
- Share: give a person and a group each a level; and create view/comment/edit links; open each in a private window: read-only editor for view/comment, comments visible, Log in prompt; after signing up the permission chip changes and comment/edit work; owner downgrade/revoke takes effect.
- Import from demo-pg via the drawer → 4+ tables, edges visible, toast shown.
- Test with `writer` → amber warning banner; with `reader` → none.
- Edit DBML with a syntax error → underline + status; fix → clears.
- Toggle dark theme and grid. Open **More → Documentation**: every page opens, no broken internal link, search finds a page, anchors scroll.
- Alter the demo DB, press `↻` → toast with diff, TableGroup kept; press again → "Already up to date".
- Set refresh 5 min on a linked diagram, alter the DB, wait with **no page open** (or set `source.at` far in the past) → the next minute's round saves a *Refresh from database* entry by *Scheduled refresh*; a stopped database shows the error in the Database drawer, and five failures pause it.
- Switch to Docs: sidebar, search, relationship links; collapse/expand a table (chevron), Collapse all / Expand all, reload keeps collapsed state; add a table and a column comment, reload keeps them; export Docs `.html`/`.md` includes the comments and the `.html` opens standalone with working search.
- Export each format (PNG and SVG are also checked by `uiaudit.mjs export-images`).

## Known gaps

- Oracle TLS: `verify`, `serverDn` and `noverify` are checked by `tools/test-oracle-tls.mjs` against `demo-oracle-tls` (a TLS proxy with a throw-away certificate); `verify` was also checked by hand against OCI. Wallets are not supported, and a real Oracle server with a private CA was never tried.
- CI does not run the Oracle checks, `roundtrip.mjs`, `docshots.mjs` or `visualsnap.mjs`: run them before a release ([`RELEASING.md`](../RELEASING.md)).
- No screen reader, Windows high-contrast or tablet pass; the interface audit runs in Chrome only.
- When asserting on edges in a headless/hidden pane, nodes may stay `visibility:hidden` (unmeasured): focus or screenshot first.
