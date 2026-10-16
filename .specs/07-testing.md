# 07 — Testing

Verification has three layers (the test pyramid). Unit tests are the base: fast, no Docker, run on every commit and in CI. End-to-end scripts and the UI tools sit on top and need a running stack. The e2e and UI scripts accept `BASE=http://host:port` (default `http://localhost:3000`) and need an administrator of that stack (`TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`).

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
| server | `dbml.test.js` | model to DBML: pk, quoting, refs, views with and without the full DDL, enums, lineage, sequences; triple quotes cannot escape a note |
| server | `policy.test.js` | SSRF policy: private/CGNAT/link-local ranges, allowlist, public-only |
| server | `audit.test.js` | every filter of the audit log, paging, facets, CSV formula guard, retention |
| server | `store.test.js` | secrets encrypted at rest and never listed, shared connection access by user and by group, what members may see |
| server | `merge.test.js` | what a refresh keeps (TableGroups, hand-written lineage) and its summary: the same cases as the browser copy in `diagramModel.test.js` |
| server | `refresh.test.js` | scheduled refresh: which diagrams are due (minimum 5 min, jitter, pause), saved as its own history entry, same text = no-op, baseline for old links, failures and pause, conflict retried, disabled owner / lost connection, skipped while someone edits, audit of shared connections |
| server | `sessions.test.js` | the session list (device, current one, ids that are not the stored hash), revoking one / all but the current / never another person's, session length and inactivity limit, the persistent failed-attempt limiter under a hashed key, link expiry |
| server | `mcp.test.js` | agents (member, no sign-in, hidden, not promotable), tokens (hash only, expiry, revoke, disabled, switched off), the protocol, every tool at each access level, "cannot see = does not exist", stale version, invalid DBML, the history entry, group grants, **no connection data in any output**, audit without content, rate limit |
| server | `recovery.test.js` | the recovery key: needs the password, shown once, any spelling works once, same answer for every failure, limits per address and per e-mail, a new key replaces the old, an administrator reset voids it |
| server | `closing.test.js` | closing an account (signed out, private connections gone, links and grants removed, shared connections kept), the 7-day waiting list, handing a diagram to a person and a group, purge, the failed-sign-in cap |
| server | `diagrams.test.js` | `roleFor`, grants, 404 for other accounts' diagrams, version conflicts (409), history, summaries |
| server | `auth.test.js` | password rules, login throttling, sessions and cookies, sign-up policy |
| server | `admin.test.js` | last-administrator guard, groups, settings, directory search |
| server | `introspect.test.js` | catalog rows to the neutral model (the part that needs no database) |
| web | `useConnect.test.js` | the Database drawer flow: list reloads when the drawer opens or Administration closes, a shared connection is never saved and imports by its own id, schemas for a connection that has none, Full DDL follows the diagram link, save/delete/reset |
| web | `layout.test.js` | every layout algorithm: finite positions, no overlapping tables, deterministic, group boxes never overlap, flow direction (left to right, pipeline, lineage), manual positions kept |
| web | `TablePicker.test.jsx` | search matcher, "nothing ticked = all", tables in a group count as selected, one group per table, Full DDL |
| web | `tableSelection.test.js` | the table selection value and every row of the picker matrix (first import / all / list / gone table x untouched / ticked / unticked / grouped), see [12](12-table-selection.md) |
| web | `AdminAgents.test.jsx` | the Agents tab: list, switched-off warning, token shown once, create, disable, delete |
| web | `Recovery.test.jsx` | the Account recovery-key section (shown once, Copy, wrong password, Remove) and the sign-in screen's "Forgot your password?" form |
| web | `AccountSecurity.test.jsx` | Account sessions (End, sign out the others) and the delete-account form (password, wrong password, cancel) |
| web | `diagramModel.test.js` | DBML to diagram data, TableGroups kept on refresh, change summary, view kind |
| web | `docsModel.test.js`, `templates.test.js` | generated documentation and Markdown; every starter template parses and documents |
| web | `api.test.js`, `historyDiff.test.js`, `Menu.test.jsx`, `AdminAudit.test.jsx` | fetch wrapper and storage guards, line diff, menu dismissal, audit filters sent to the server |

### Rules

- **A bug fix lands with a regression test that fails on the old code.** Prove it: break the fix on purpose, watch the test fail, restore it.
- **A new feature lands with unit tests for its logic** and, when it has UI flows, a check in `behaviorcheck.mjs` / `uiaudit.mjs`.
- Logic that must be tested does not stay inside a React component: move it to a plain module (as `diagramModel.js`) or test the component through Testing Library.
- Assert on behaviour users see (text, roles, what is sent to the server), not on implementation details.
- A `beforeEach` must not return the mock: Vitest runs a returned function as teardown.

### Continuous integration and the hook

`.github/workflows/ci.yml` has two jobs, on every push to `main` and every pull request. `unit`: `node --check`, server tests, the pure lineage checks, web tests and `vite build`. `e2e` (after `unit`, about 20 minutes): `.github/ci-e2e.sh` starts the stack with Docker Compose and runs `server/test-auth.mjs`, `server/test-guardrails.mjs`, `web/uiaudit.mjs` (zero findings) and `web/behaviorcheck.mjs`, whose output must equal `web/behavior.golden.json`. The script runs every step even if one fails and lists what failed; `OD_REUSE=1` runs it against a stack that is already up (see its header). The Oracle checks (`--profile oracle`) and the pixel comparison of `visualsnap.mjs` are not in CI (heavy image; fonts differ between machines).

**`web/behavior.golden.json`** is the expected behaviour fingerprint (menus, popovers, search, table picker, shared connection flow, groups, Full DDL). When a change alters that behaviour on purpose, regenerate it on a throw-away instance (`BASE=... SNAP_EMAIL=... SNAP_PASSWORD=... node web/behaviorcheck.mjs > web/behavior.golden.json`), read the diff and commit it with the change. When the e2e job fails on it, the diff in the log says what moved.

To run the unit tests before every commit: `git config core.hooksPath .githooks` (once per clone; `git commit --no-verify` skips it, CI does not).

### Not covered by unit tests yet

- The rest of the `Workspace` component (autosave, presence, conflict dialog) is covered by `behaviorcheck.mjs`, `uiaudit.mjs` and the e2e scripts only. The connection flow is the hook `useConnect.js` and the layouts are `layout.js`, both unit tested.
- The e2e job has run only through its script on a laptop, not yet on GitHub: check the Actions tab after the first push. Chrome there is started with `--no-sandbox` (when `CI` is set).
- Database drivers (`pgWith`, Oracle) need a real database, see `test-guardrails.mjs`.
- Branch protection (a failing CI blocking the merge) is a repository setting, not part of the code.

## Setup

```bash
docker compose up -d --build
docker compose --profile oracle up -d     # for Oracle checks / roundtrip.mjs
docker compose exec app node src/cli.js create-admin admin@example.com 'a-long-test-password'
export TEST_ADMIN_EMAIL=admin@example.com TEST_ADMIN_PASSWORD='a-long-test-password'
```

## Automated

| Script | Needs | Checks |
|--------|-------|-------------|
| `TEST_ADMIN_EMAIL=… TEST_ADMIN_PASSWORD=… node server/test-auth.mjs` | app + an administrator (`docker compose exec app node src/cli.js create-admin <email> <password>`) | about 190 checks: sessions list and revocation, sign-in events in the audit log, link expiry, closing an account and handing its diagrams over, closed sign-up, admin creates users/temporary passwords/forced change, versions and edit conflicts (409), shared connections with grants and the audit log, link passwords and throttling, presence, roles and 403s, last-admin guard (isolated DB), disable/enable/reset/delete, flat groups with multi-membership, directory, per-account isolation, administrator access to every diagram (no connection link, no borrowed connections), sharing with people and groups (highest level, leave/delete group, revoke), link levels, settings, CSRF, logout, headers, SSRF policy functions. Creates and removes throw-away users/groups |
| `node server/test-guardrails.mjs` (also needs `TEST_ADMIN_*`) | app, `demo-pg`, `demo-pg-tls`, (optional `demo-oracle`) | scheduled refresh: a linked diagram with an old `source.gen` is refreshed by the server within ~2 minutes with no page open, as a history entry by *Scheduled refresh* (waits up to 150 s); privilege warnings (superuser/writer/reader); strict mode blocks writer, allows reader; read-only txn rejects DDL (via `psql`); PG TLS: off, verify w/o CA (fails), verify + CA PEM, noverify, verify vs non-TLS (fails); Oracle descriptor injection rejected; Oracle TCPS vs plain listener fails cleanly |
| `TEST_ADMIN_EMAIL=… TEST_ADMIN_PASSWORD=… node server/test-oracle-tls.mjs` | app + `--profile oracle` (`demo-oracle`, `demo-oracle-tls`) | Oracle TLS modes: verify, host-name mismatch, `serverDn` accepted/refused, `noverify`, TLS off against TCPS, DN injection |
| `node server/test-lineage.mjs` | nothing (pure) | view column lineage: SQL parsing into output column -> source column (joins, aliases, expressions, aggregates, `*`, sub-selects, CTE, UNION, view on view, Oracle upper case, unreadable SQL gives null) |
| `node web/lineage-check.mjs` | nothing (pure) | the `// lineage:` comment parser (table and column level, `(auto)` marker, merging, unknown names) and the upstream/downstream closure |
| `node web/uiaudit.mjs [screen ...]` (needs `AUDIT_EMAIL`/`AUDIT_PASSWORD` of a throw-away instance, see its header) | a throw-away app instance with `demo-pg`; Chrome installed | UI audit of every screen in light/dark and desktop/phone: names, targets, labels, contrast, overflow, dialogs, keyboard walk ([11](11-ui-review.md)); zero findings is the bar |
| `node web/docshots.mjs` (needs `SHOTS_EMAIL`/`SHOTS_PASSWORD` of a throw-away instance) | same | retakes the documentation pictures |
| `node web/visualsnap.mjs snap <dir>` / `compare <dirA> <dirB>` (needs `SNAP_EMAIL`/`SNAP_PASSWORD`) | a throw-away instance per build | refactors: 21 static screens as PNG, compared pixel by pixel between the old and the new build; also reports JavaScript errors per screen |
| `node web/behaviorcheck.mjs` (same variables) | same | JSON fingerprint of menus, popovers, search, export list, copy, the table picker, the shared-connection flow, groups and Full DDL; compared with `web/behavior.golden.json` in CI, and old vs new build in refactors |
| `cd web && node roundtrip.mjs` (also needs `TEST_ADMIN_*`) | app, `demo-pg`, `demo-oracle` | import → export (pg/mysql/mssql/oracle/json) → re-import comparison; prints diffs. Expected: PG→PG, Oracle→PG, Oracle→MSSQL identical; others fail as documented in [04](04-formats.md) |

`test-auth`, `test-guardrails` and `test-oracle-tls` exit non-zero on failure (`roundtrip.mjs` only prints; read its output). Demo data drifts if you alter `shop.*` manually — the scripts assume ≥ 4 PG tables.

## Manual UI checklist (browser)

- Fresh volume: first screen offers to create the administrator; afterwards public sign-up is closed. Admin → create user (temporary password shown once) → sign in as that user: forced password change → workspace. Admin → groups → add member → share a diagram with the group → the member sees it under *Shared with me* with the right permission.
- First sign-in of a new account → the sample "Online store - sample" diagram exists (8 tables, 10 refs, 3 groups); *Start from a template* creates another; switching between two diagrams with identical DBML still draws the canvas → edit → `Saved`; reload keeps content and table positions.
- Share: give a person and a group each a level; and create view/comment/edit links; open each in a private window: read-only editor for view/comment, comments visible, Log in prompt; after signing up the permission chip changes and comment/edit work; owner downgrade/revoke takes effect.
- Import from demo-pg via the drawer → 4+ tables, edges visible, toast shown.
- Test with `writer` → amber warning banner; with `reader` → none.
- Edit DBML with a syntax error → underline + status; fix → clears.
- Toggle dark theme and grid. Open **More → Documentation**: every page opens, no broken internal link, search finds a page, anchors scroll.
- Alter the demo DB, press `↻` → toast with diff, TableGroup kept; press again → "Already up to date".
- Set refresh 5 min on a linked diagram, alter the DB, wait with **no page open** (or set `source.at` far in the past) → the next minute's round saves a *Refresh from database* entry by *Scheduled refresh*; a stopped database shows the error in the Database drawer, and five failures pause it.
- Switch to Docs: sidebar, search, relationship links; collapse/expand a table (chevron), Collapse all / Expand all, reload keeps collapsed state; add a table and a column comment, reload keeps them; export Docs `.html`/`.md` includes the comments and the `.html` opens standalone with working search.
- Export each format; open PNG/SVG and confirm all tables are present (**not yet automated**).

## Known gaps

- Oracle TLS: `verify`, `serverDn` and `noverify` are checked by `server/test-oracle-tls.mjs` against `demo-oracle-tls` (a TLS proxy with a throw-away certificate); `verify` was also checked by hand against OCI. Wallets are not supported. A real Oracle with a private CA was not tried.
- `DB_HOST_POLICY=public-only` / `allowlist` verified only through the policy functions, not through `/api/schemas`.
- A comment-level / edit-level member exercising the UI (the API is covered).
- Read-only enforcement proven with `psql`, not through the app's own pool.
- CI does not run the Oracle checks, `roundtrip.mjs`, `docshots.mjs` or `visualsnap.mjs`. Suggested next: `npm audit`.
- No browser automation for UI flows; tests above were driven by hand/JS in a browser pane.
- When asserting on edges in a headless/hidden pane, nodes may stay `visibility:hidden` (unmeasured) — focus/screenshot first.
