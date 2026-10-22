# 14 — Release v1.0 (open source, single release)

**Status:** agreed plan, written 2026-10-21. Replaces the ordering of [13](13-feature-plan.md) for the release; items of 13 not listed here stay there as ideas for forks.

## Goal

Ship **one** release, v1.0, that a team can install, run, upgrade-free and understand **without the author**. After v1.0 the repository stays open (issues and pull requests accepted) with no promised support; the README says "feature-complete, forks welcome".

Budget: about **15 sessions** (about one month, target 2026-11-20). Estimates below are in sessions and are guesses.

## Decisions (locked 2026-10-21)

| Decision | Choice | Why |
|---|---|---|
| License | **Apache-2.0**, final | OSI open source; permissive fits a project with no maintainer; patent grant. Competitors are AGPL-3.0 (ChartDB, drawDB) or MIT (Azimutt). |
| `@dbml/core` | **Stay on 10.x**; no Web Worker | A parse of a typical diagram (≤ 30 tables) costs ~18 ms vs ~9 ms on 3.x, below perception; `useDeferredValue` covers typing. |
| Real performance cost | **Transfer size**: the `App` chunk is 16.3 MB raw / 2.9 MB gzip and the server sends it uncompressed, with no cache header | Measured 2026-10-21 with `npx vite build` and a search of `server/src/index.js`. |
| Storage | **SQLite is final** (`node:sqlite`, one file). No PostgreSQL, not even as an option | Measured: every call but sign-in takes 2 to 28 ms (p50); load is small and read-mostly. PostgreSQL would rewrite ~170 synchronous queries (4-6 sessions), add a second container, `pg_dump` backups and major-version upgrades for every self-hoster, and only buys several app instances, which v1.0 does not need. An optional second engine doubles the test matrix with nobody to maintain it. |
| Sign-in cost | **Kept** (scrypt, about 40 ms of CPU each, async on the libuv thread pool) | The cost is the protection against password guessing, not a database problem; it only shows when dozens sign in in the same second, and sessions last days. Lowering it would weaken security. |
| After v1.0 | Open, no support; Dependabot security alerts only | The author has no time to continue. |
| Bets, in priority order | MySQL/MariaDB live import > migration script from a diff > PII tags | Only what fits the budget ships (see cut line). |
| Not in v1.0 | SSO (accounts, recovery key and administrator reset are enough for self-hosting), password reset by e-mail code (needs SMTP: new config, secret and outbound connection, and the most likely source of unanswered issues; the recovery key and administrator reset cover it), public hosted instance, notifications, proposed changes, co-editing, SQL Server, in-app LLM, Web Worker parse, general API rate limit (left to the reverse proxy, documented) | Each needs ongoing operation or does not fit the budget. |

## Plan, in order

The riskiest item (MySQL) comes right after the foundation, with a kill criterion, so a failure is known early and costs only the bet.

| # | Item | Size | Done when (validation) |
|---|---|---|---|
| **Wave 0: foundation (required for the release)** ||||
| 1 | **Done 2026-10-22.** License Apache-2.0: `LICENSE` + `NOTICE` (also copied into the image), both `package.json` and lockfiles, README, `license.md` docs page | 0.5 | `git grep -i polyform` finds nothing outside the vendored skills |
| 2 | **Done 2026-10-21** (`App` chunk 16.3 MB raw, 1.59 MB brotli, 2.85 MB gzip; build about 20 s longer). Compressed and cached assets: build step writes `.br` / `.gz` with `node:zlib`; `@fastify/static` `preCompressed: true`; `Cache-Control: public, max-age=31536000, immutable` on `/assets/*`, `no-cache` on `index.html` | 1 | `http.test.js`: `Accept-Encoding: br` gets `Content-Encoding: br`, headers as stated; transfer size of the `App` chunk measured and written in the *Hosting requirements* page |
| 3 | **Done 2026-10-21 except the first publish** (built and checked locally for amd64 and arm64: `healthy`, uid 1000, `docker stop` exit 0; the release workflow runs on the first `v*` tag the author pushes). Image: `npm ci`, `USER node`, `HEALTHCHECK` on `/api/health` (which runs `select 1`), published to GHCR for `linux/amd64` and `linux/arm64` by a tag workflow | 2 | On a machine with no clone: `docker run -e APP_SECRET=… -p 3000:3000 ghcr.io/<owner>/opendiagram:1.0.0-rc.1` → health 200, container `healthy`, `docker inspect` user is not root |
| 3b | **Done 2026-10-22.** Measured with `server/bench.mjs` (1 vCPU, 512 MB, two runs each, Docker Desktop on Windows: every call has a ~15 ms network floor). Kept: `@dbml/core` loaded on first use in the server (idle memory 248 -> 73 MB, peak with 150 people 316 -> 145 MB; it alone takes ~330 MB of RSS when loaded), `synchronous = normal` (a save 5-20 % faster, noisy), `busy_timeout` (correctness: the CLI writes while the server does), `audit_log` indexes on `diagram_id` and `connection_id` (200k rows: filter 9 -> 0.1 ms, facet 17 -> 2 ms; an `actor_id` index made the people facet 64 -> 437 ms and was dropped). Not kept: `cache_size`, `temp_store` (no gain), `UV_THREADPOOL_SIZE` (default 4 threads already covers typical vCPU counts; sign-in bursts are CPU-bound), `init` (Node already stops in ~1 s with exit 0), a smaller image (414 of 470 MB is the `node:24-slim` base; distroless has no shell or `chown` for the documented volume commands). All other hot queries use a primary key or an index (plan of every statement the unit tests run). Original scope: SQLite and container tuning, measured: `server/bench.mjs` before and after for each change, keep only what helps. Candidates: `synchronous = normal` (safe in WAL), `busy_timeout`, `temp_store = memory`, `cache_size`, a periodic `pragma optimize`, `wal_checkpoint(truncate)` on shutdown; `EXPLAIN QUERY PLAN` of the hot queries (session lookup, diagram list, history, save) and the missing indexes; the first-save p95 (119 ms at 200 tables); `UV_THREADPOOL_SIZE` against the vCPU count for sign-in bursts; `init: true` and the stop grace period; image size (470 MB) | 1 | Numbers before and after in *Hosting requirements*; `npm test` and `test-auth.mjs` green; a pragma without a measured gain is not kept |
| 4 | **Done 2026-10-21** (no-clone install from the compose file alone, old-volume copy, read-only root filesystem and `ci-e2e.sh` on both files checked locally). Production compose: `docker-compose.yml` = app only (image from GHCR, `read_only: true`, `tmpfs /tmp`, restart policy); demos move to `docker-compose.demo.yml`; demo ports bound to `127.0.0.1`; fixed project name `opendiagram` so renaming the folder no longer switches the data volume | 1 | `docker compose up -d` starts the app with no public demo passwords; `ci-e2e.sh` runs with both files |
| 5 | **Done 2026-10-22** (also tried in containers: backup while running, restore refused while running, restored after stop). Backup / restore: `cli.js backup <file>` (`VACUUM INTO`, safe while running), `restore <file>` (refuses while the server holds the database) | 0.5 | `server/test/cli.test.js`: backup, change, restore, compare; README section rewritten |
| 6 | **Done 2026-10-22 except the first real run** (`actionlint` clean; `npm audit` finds nothing today; the first `v*` tag the author pushes proves the release workflow). CI: `npm audit --audit-level=high` step, actions pinned by SHA, release workflow (tag → image + GitHub release) | 1 | A test tag `v1.0.0-rc.1` produces the image and a draft release |
| **Bet 1 (time-boxed: 4 sessions; kill criterion below)** ||||
| 7 | MySQL / MariaDB live import: `grill-me` + revision of [05](05-security.md) first; driver `mysql2`; read-only session (`START TRANSACTION READ ONLY`), privilege check from `SHOW GRANTS` reported as warnings, TLS modes, `assertHostAllowed`; catalog from `information_schema`; `demo-mysql` with root / writer / reader users | 4 | `introspect` unit tests; `test-guardrails.mjs` extended (read-only enforced, warnings for root and writer, clean for reader); table picker rules of [12](12-table-selection.md) tested; `roundtrip.mjs` MySQL → MySQL identical; `uiaudit.mjs drawer-database` zero findings |
| **Wave 1: "kept up to date" visible** ||||
| 8 | Structural schema diff between two versions (tables, columns, types, defaults, nullability, keys, refs, indexes) in the History compare dialog, above the text diff | 2 | Pure module with unit tests from DBML pairs (rename = remove + add, type change, FK change); `uiaudit.mjs drawer-history-compare` zero findings; `versions-and-history` docs picture retaken |
| 9 | Drift: a refresh that changes the structure stores a summary on its version ("+2 tables, 1 type changed"); the Library card says "changed since you last opened it" (`last_seen_version` per user and diagram) | 1.5 | `refresh.test.js` and `http.test.js` cover summary and badge; migration in `db.js` tested on an old database |
| 10 | **Done 2026-10-22** (`pickDiagrams` and the in-card delete tested in `Library.test.jsx`; the full `uiaudit` run is pending). Library: search, sort (name / last change), filter "linked to a database" | 0.5 | `Library.test.jsx`; `uiaudit.mjs library` zero findings at 375 px and both themes |
| **Release** ||||
| 11 | Release: README status line, release notes, `docshots.mjs`, full `ci-e2e.sh`, `behaviorcheck` golden current, tag `v1.0.0` (the author pushes) | 1 | Release checklist below all ticked |
| | **Total** | **16** | |

**Cut line (if the budget runs out):** cut from the bottom of the bets, never from Wave 0 or the release item. Order of cuts: item 10, then item 9, then item 7 (kill criterion). Wave 0 + item 8 + release (about 7.5 sessions) is still a worthy v1.0.

**Stretch (only if under budget), in this order:**

1. **Drift webhook** (1.5 sessions, needs item 9). Administrator-only setting: one URL and one secret per instance (or per shared connection). One event only: a refresh that changed the structure. Payload: diagram id, title, version and the drift summary; never DBML, `source`, a connection or a credential (same line as invariant 7). Signed with HMAC-SHA256 in a header (`node:crypto`), sent with native `fetch`, short timeout, one retry, no queue; every delivery and failure goes to the audit log. The URL goes through a host policy like `DB_HOST_POLICY`. It is a new outbound connection: revisit [05](05-security.md) first (invariant 6). *Done when:* `http.test.js` / `refresh.test.js` check the signature, the payload fields (no forbidden ones), the policy refusal and the audit row; a local receiver gets the event in `ci-e2e.sh` or a manual check written in [07](07-testing.md).
2. Migration `ALTER` script for PostgreSQL from the diff of item 8 (2 sessions; the app only generates the file, never runs it).
3. PII tags on columns (2 sessions).

If item 7 (MySQL) hits its kill criterion, the freed sessions go to the stretch list in this order.

**Kill criterion for item 7:** if after 2 sessions the read-only session and the privilege warnings are not green on `demo-mysql`, stop, keep the work on a branch, and move MySQL back to [13](13-feature-plan.md) for forks.

**Open design decision for item 8/9:** the diff runs in the browser (History) and in the server (scheduled refresh). The Docker image only copies `server/src`. Decide in item 8 between one module under `server/src/` imported by the web build (Vite `server.fs.allow`) or a module under `web/src/` copied at build time. Never two hand-kept copies.

## Release checklist (definition of done for v1.0)

- [ ] `(cd server && npm test)` and `(cd web && npm test)` green; `npx vite build` and `node --check server/src/*.js` clean.
- [ ] `bash .github/ci-e2e.sh` green on the release candidate image.
- [ ] `node web/uiaudit.mjs` zero findings on every screen; `docshots.mjs` rerun and every picture looked at.
- [ ] Fresh install from the published image on a clean machine: first account, demo import (PostgreSQL, and MySQL if shipped), share link, backup and restore.
- [ ] Transfer size of the first load and parse times at 30 / 200 tables recorded in *Hosting requirements*.
- [ ] License consistent everywhere (item 1 check); `NOTICE` lists third-party licenses.
- [ ] README, specs and docs pages match the behaviour; README says: feature-complete, no support promised, forks welcome; `SECURITY.md` says reports are read on a best-effort basis.
- [ ] What was not tested is listed in the release notes (for example: Oracle with a real private CA, MySQL with a real cloud TLS endpoint).

## Every item follows the loop of [13](13-feature-plan.md)

Decide (`grill-me` for item 7 and anything touching security) → plan → test first → prove (`verification-before-completion`) → review (`requesting-code-review`, security invariants and UI standard as criteria) → one commit per logical change with spec, README and docs page; the author pushes.
