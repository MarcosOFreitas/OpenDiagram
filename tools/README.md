# Tools

The scripts that prove OpenDiagram works beyond its unit tests: end-to-end checks against a running stack, the interface audit, the documentation pictures, visual and behaviour comparisons between two builds, and the performance measurements. None of them is part of the app, and none of them is needed to run it. They are plain Node 24 ES modules with no dependencies of their own: they import the app's code (`../server/src`, `../web/src`) and the Chrome DevTools driver `cdp.mjs`.

Unit tests are not here: they live next to the code (`server/test/*.test.js`, `web/src/**/*.test.{js,jsx}`) and run with `npm test` in each folder. What each test and tool proves is in [`.specs/07-testing.md`](../.specs/07-testing.md).

## The tools

| Tool | What it does | Runs in CI |
|------|--------------|------------|
| `test-auth.mjs` | Accounts, roles, groups, sharing, link permissions, shared connections, audit, the host policy, through the HTTP API (about 230 checks). | yes (e2e) |
| `test-guardrails.mjs` | Read-only sessions (a write must fail inside the app's own session), privilege warnings, PostgreSQL TLS modes, the table picker, the scheduled refresh, the MySQL import. `ORACLE_PORT=1522` adds the Oracle session check. | yes (e2e) |
| `test-oracle-tls.mjs` | Oracle TLS modes (`verify`, `serverDn`, `noverify`) against the demo TLS proxy. | no |
| `test-lineage.mjs`, `lineage-check.mjs` | Pure checks: column lineage of views read from their SQL; the `// lineage:` comment parser. No stack needed. | yes (unit job) |
| `roundtrip.mjs` | Import from each demo database, export to every SQL dialect, import again, print the differences (expected results: [`.specs/04-formats.md`](../.specs/04-formats.md)). | no |
| `uiaudit.mjs` | Opens every screen, drawer, menu and dialog in headless Chrome, light and dark, desktop and phone, and reports accessibility and layout problems (names, contrast, targets, focus, overflow, keyboard), plus the PNG/SVG exports and two member flows. The bar is zero findings. | yes (e2e, 4 shards) |
| `behaviorcheck.mjs` | A JSON fingerprint of menus, popovers, search, pickers and other interactive parts; CI compares it with `behavior.golden.json`. | yes (e2e) |
| `visualsnap.mjs` | Screenshots of 21 static screens, then a pixel comparison between two builds (for refactors that must not change the UI). | no |
| `docshots.mjs` | Retakes the pictures of the documentation site (`web/src/docsite/img`). | no |
| `bench.mjs`, `benchclient.mjs` | Server latencies, memory and CPU under load; browser cost of diagrams of several sizes. They feed the *Hosting requirements* page. | no |
| `docsjump.mjs` | Where the Docs view's links land, on a large diagram. | no |
| `stressdbml.mjs` | Writes a realistic synthetic schema of N tables: `node tools/stressdbml.mjs 200 > stress-200.dbml`. | used by others |
| `cdp.mjs`, `fixtures.mjs` | Shared helpers: the headless Chrome driver; the API client and the accounts and diagrams the UI tools seed. | |

Each file's header says exactly how to run it. Run every tool from the repository root (`node tools/<name>.mjs`).

## Instances: never one with real data

The tools create accounts, groups and diagrams. Run them only against a **throw-away instance**; every UI tool refuses `:3000`, the port of the usual dev stack.

| Tool | Instance (default `BASE`) | Credentials | Also needs |
|------|----------|-------------|------------|
| `test-auth`, `test-guardrails`, `test-oracle-tls`, `roundtrip` | the dev stack on `:3000` | `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` (`docker compose exec app node src/cli.js create-admin <email> <password>`) | the demo databases: run from the repository root with `COMPOSE_FILE` set as in `.env.example`. `test-guardrails` creates and drops `shop.late_table` and waits up to 150 s for the scheduled refresh. `test-oracle-tls` needs the three compose files of `docker-compose.demo-tls.yml`'s header |
| `uiaudit` | a container on `:3100` (`audit-app`, or `AUDIT_CONTAINER`) on the network `opendiagram_default` | `AUDIT_EMAIL` / `AUDIT_PASSWORD` | Chrome; `docker exec` into the container (it writes two rows of state straight into its database); the `first-run` screen only with an empty instance on `BASE_EMPTY` and its name given |
| `docshots` | a container on `:3100` | `SHOTS_EMAIL` / `SHOTS_PASSWORD` | Chrome; `demo-pg` on its network |
| `visualsnap` | one container per build (`:3110`) | `SNAP_EMAIL` / `SNAP_PASSWORD` | Chrome |
| `behaviorcheck` | `BASE` is required | `SNAP_EMAIL` / `SNAP_PASSWORD` | Chrome; regenerate `behavior.golden.json` on a fresh instance |
| `bench`, `benchclient` | a container with limits on `:3200` | `BENCH_EMAIL` / `BENCH_PASSWORD` | Chrome for `benchclient` |
| `docsjump` | positional: `<base> <email> <password> <diagramId>` | | Chrome; a large diagram |

A throw-away instance of the current code, next to the dev stack:

```bash
docker build -t opendiagram-audit .
docker run -d --name audit-app --network opendiagram_default -p 3100:3000 -e APP_SECRET=$(openssl rand -hex 24) opendiagram-audit
docker exec audit-app node src/cli.js create-admin audit@example.com 'audit-password-123'
BASE=http://localhost:3100 AUDIT_EMAIL=audit@example.com AUDIT_PASSWORD=audit-password-123 node tools/uiaudit.mjs main menu-export
docker rm -f audit-app
```

Chrome is found in the usual places; `CHROME=/path/to/chrome` overrides it, and `CDP_GUI=1` opens a real window (frame rates mean nothing in headless Chrome). On Windows with Git Bash, prefix commands that pass container paths (`/data/...`) with `MSYS_NO_PATHCONV=1`.

## Everything at once

`bash .github/ci-e2e.sh` is what CI's end-to-end job runs: it builds the image, starts its own stack (Compose project `odci`, so `:3000` and `:3100` must be free), runs `test-auth`, `test-guardrails`, the interface audit and the behaviour fingerprint, and removes the stack. About 25 minutes in one run; CI splits the audit in four shards. Its header lists the options (reuse a running stack, one shard).

The tools that CI does not run (`test-oracle-tls`, `roundtrip`, `docshots`, `visualsnap`, the benches) are part of the release checklist in [the releasing guide](../docs/releasing.md).
