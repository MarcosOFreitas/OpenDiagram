# Contributing to OpenDiagram

Thanks for helping. This project is small on purpose: the smallest change that solves a problem is the best change. Contributions by humans and by AI coding agents follow the same rules (agents: read [`AGENTS.md`](AGENTS.md) first).

## Before you start

- **Open an issue** for anything bigger than a typo or a small fix, so we can agree on the approach (and on whether it fits [the roadmap](.specs/06-roadmap.md)) before you write code.
- **Security problems are not issues.** See [`SECURITY.md`](SECURITY.md).
- OpenDiagram is a **clean-room** implementation: do not copy code, text or images from dbdiagram.io, dbdocs or other products. Only contribute code you have the right to license under [MIT](LICENSE).

## Set up

```bash
git clone https://github.com/<you>/OpenDiagram.git   # your fork of https://github.com/MarcosOliveira-Intelicity/OpenDiagram
cp .env.example .env                          # set APP_SECRET (openssl rand -hex 32)
docker compose up -d --build                  # app on http://localhost:3000 + demo databases
cd server && npm install && npm start         # or: run the API from source (Node 24)
cd web && npm install && npm run dev          # UI with hot reload on :5173
```

Open <http://localhost:3000> and create the first account (it becomes the administrator). The demo databases and their users are listed in the [README](README.md#quick-start).

## Checks

There is no linter. Unit tests (`cd server && npm test`, `cd web && npm test`) run in seconds without Docker, in CI and, once enabled with `git config core.hooksPath .githooks`, before every commit; the CI `e2e` job (`.github/ci-e2e.sh`) runs the end-to-end scripts, the UI audit and the behaviour fingerprint, which cover what a unit test cannot. A bug fix comes with a regression test that fails on the old code; a feature comes with tests for its logic. The scripts and what they need are in [`.specs/07-testing.md`](.specs/07-testing.md). At minimum, before opening a pull request:

1. `cd web && npx vite build` and `node --check server/src/*.js` pass.
2. The e2e scripts that cover what you touched pass (`server/test-auth.mjs`, `server/test-guardrails.mjs`, `web/roundtrip.mjs`, ...). Create a throw-away administrator with `docker compose exec app node src/cli.js create-admin ...` and export `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`.
3. For a **UI change**: you loaded it in a browser, and `node web/uiaudit.mjs <screen ...>` reports zero findings for the screens you touched (it needs a throw-away instance, see the header of the file). New screens, drawers, popups and dialogs are added to that script. Follow the **UI standard** in [`AGENTS.md`](AGENTS.md#ui-standard) and [`.specs/11-ui-review.md`](.specs/11-ui-review.md) (the rules come from the [ui-ux-pro-max skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), MIT; agents can use the copy under `.claude/skills`): shared controls and tokens, light and dark theme, 375px width, keyboard focus, accessible names, contrast.
4. **Documentation moves with the code**: update the relevant spec in `.specs/`, the page in `web/src/docsite/pages/` and the README if behaviour, labels, defaults or limits change. If a documented screen looks different, regenerate the pictures with `node web/docshots.mjs`.

## Rules that are not negotiable

- **Read-only database access.** Every database session is read-only and only reads catalog metadata. A change that could run arbitrary SQL, read table data or widen outbound access needs a discussion first. The full list of security invariants is in [`AGENTS.md`](AGENTS.md#security-invariants-do-not-weaken).
- **No secrets in the repository**, in logs or in API responses; no real data or screenshots of real data.
- **Authorization lives in the server**, never only in the UI.

## Pull requests

- One logical change per pull request and per commit. Short imperative subject with a type prefix (`feat`, `fix`, `docs`, `chore`, `refactor`); the body says why, not what.
- Fill in the checklist of the pull request template. Say honestly what you tested and what you did not.
- Keep the diff focused: no drive-by reformatting, no new dependency for something a few lines can do.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
