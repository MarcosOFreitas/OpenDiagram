# Development

How to run OpenDiagram from source, change it, and prove the change. The rules behind these steps are in `AGENTS.md`; the contribution process is in `CONTRIBUTING.md`.

## Requirements

- **Docker** with Compose v2, to run the app and the demo databases.
- **Node 24** for development: the server uses the built-in `node:sqlite`.
- **Chrome or Chromium**, only for the tools that drive a browser (`tools/`).

## Run it

```bash
cp .env.example .env    # set APP_SECRET (openssl rand -hex 32); uncomment COMPOSE_PATH_SEPARATOR and COMPOSE_FILE to include the demo databases
docker compose up -d --build                    # the app on :3000, built from source, plus demo-pg, demo-pg-tls, demo-mysql
docker compose --profile oracle up -d           # the Oracle demo (slow first start) and its TLS proxy
docker compose up -d --build app                # rebuild after a change (the web build runs inside the image)
```

For a faster loop, run the parts from source:

```bash
cd server && npm install && npm start           # the API on :3000; data in ./server/data; the first account is the administrator
cd web && npm install && npm run dev            # the interface with hot reload on :5173, proxying /api to :3000
```

Open the app and create the first account: it becomes the administrator. The demo databases, their hosts and users are in the README (*Quick start*).

## The loop

1. **Read first.** The spec of the area you touch (`.specs/`), and `.specs/12-table-selection.md` before touching the table selection.
2. **Test first.** Write the test that fails, then the code. A bug fix ships a regression test that fails on the old code (break the fix on purpose, watch the test fail, restore it). Logic that needs a test leaves the component for a plain module (`diagramModel.js`, `layout.js`, `tableSelection.js`).
3. **Prove it.** Before a commit:
   - `(cd server && npm test)` and `(cd web && npm test)`, seconds each, no Docker;
   - `(cd web && npx vite build)` and `for f in server/src/*.js; do node --check "$f"; done`;
   - for an interface change: load it in a browser, and `node tools/uiaudit.mjs <screen ...>` on a throw-away instance reports zero findings ([Tools](../tools/README.md));
   - for a change the e2e scripts cover: the matching script, or `bash .github/ci-e2e.sh`.
4. **Commit** one logical change, with a short imperative subject and a type prefix (`feat`, `fix`, `docs`, `chore`, `refactor`), and a body that says why. Specs, README and documentation pages move with the code. `git config core.hooksPath .githooks` runs the affected unit tests before every commit.

## Common changes

| Change | Where, and what proves it |
|--------|----------------|
| A route | `server/src/index.js`; its behaviour (status codes, validation, the `{ error }` shape, who may call it) is tried first in `server/test/http.test.js` through `app.inject`. Authorization rules: security invariant 5 in `AGENTS.md`. |
| A screen, drawer, popup or dialog | The UI standard in `AGENTS.md` (shared controls and tokens, both themes, 375 px, accessible names); add it to `tools/uiaudit.mjs` in the same change; rerun `tools/docshots.mjs` if a documented screen changed. |
| A documentation page | `web/src/docsite/pages/<slug>.md` and its place in `web/src/docsite/nav.js`; pictures come from `tools/docshots.mjs`. |
| A database engine | *Adding a database engine* in `.specs/01-architecture.md` (the places MySQL touched). |
| A change to the SQLite schema | *Schema migrations* in `.specs/01-architecture.md`; prove it like `server/test/migration.test.js`. |
| DBML parsing | The app parses with `@dbml/parse` and the model of `@dbml/core` (`web/src/dbmlParse.js` and its server copy); an upgrade keeps both `dbmlParse.test.js` green, and `web/src/formats.test.js` pins what the import relies on. |
| Dependencies | `npm audit --audit-level=high` runs in CI. `vite`, `vitest` and their plugins move together, by hand (`.github/dependabot.yml`). |
| Anything that connects out, reads data or widens exposure | Security invariant 6: revisit `.specs/05-security.md` first. |

## Pitfalls

The *Gotchas* of `AGENTS.md` collect what cost time before: React Flow render loops, nodes that stay hidden until measured, the `@dbml/core` importer's limits, Oracle catalog names, Docker volumes of the demo databases, Windows and Git Bash paths.
