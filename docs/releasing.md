# Releasing

How a version of OpenDiagram is checked and published. The 1.0.0 release followed these steps; a fork uses them too (see [the forking guide](forking.md) first).

## Where the version lives

- `server/package.json` and `web/package.json` carry the same `version` (bump both, and their lockfiles: `npm version X.Y.Z --no-git-tag-version` in each folder).
- The MCP connector reports it to clients (`serverInfo.version`, read from `server/package.json`).
- The image tags come from the git tag: `vX.Y.Z` publishes `X.Y.Z`, `X.Y` and `latest`; a pre-release such as `vX.Y.Z-rc.1` publishes only its own tag.
- `docker-compose.yml` pins the default tag (`${OPENDIAGRAM_VERSION:-X.Y.Z}`): set it to the new version in the commit you tag, so a plain install gets it.
- `web/src/docsite/pages/release-notes.md` gets a `## X.Y.Z` section with what changed and what was **not tested**.

## Checklist before tagging

Everything here is described in [`.specs/07-testing.md`](../.specs/07-testing.md); the instances the tools need are listed there too.

- [ ] `(cd server && npm test)` and `(cd web && npm test)` green; `(cd web && npx vite build)` clean; `for f in server/src/*.js; do node --check "$f"; done` clean.
- [ ] The CI run of the commit you tag is green, `e2e` included (CI runs it on `main`; locally, `bash .github/ci-e2e.sh` needs port 3000 free). The release workflow does **not** wait for CI.
- [ ] `node tools/uiaudit.mjs` zero findings on every screen (part of the e2e run), and `tools/behavior.golden.json` current.
- [ ] `node tools/docshots.mjs` rerun on a throw-away instance and every picture looked at (no personal data, nothing cut off).
- [ ] `node tools/roundtrip.mjs` with the Oracle demo (`--profile oracle`) matches the table in [`.specs/04-formats.md`](../.specs/04-formats.md).
- [ ] If performance-relevant code changed: `node tools/bench.mjs` and `node tools/benchclient.mjs`, numbers updated in the *Hosting requirements* page.
- [ ] License consistent (`LICENSE`, `NOTICE`, both `package.json`); `npm audit --audit-level=high` clean in both folders (CI runs it).
- [ ] README, specs and documentation pages match the behaviour; the release notes have the new section and its *Not tested* list.

## Publishing

1. Commit the version bump and the release notes on `main`; wait for CI to be green.
2. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. `.github/workflows/release.yml` builds the image for `linux/amd64` and `linux/arm64`, pushes it to `ghcr.io/<owner>/<repo>` and opens a **draft** GitHub release with notes generated from the commits. Review the draft (point to the release notes page) and publish it.
4. **First release only:** a new GHCR package is private. In the package settings, make it **public**, or `docker compose pull` without a login fails for everybody.
5. On a clean machine, follow the README's quick start with the published image: first account, a demo import, a share link, a backup and a restore.

Running the workflow by hand (*Actions → release → Run workflow*) builds and pushes an image tagged with the branch name (for example `:main`): useful to try the build, not a release.

## After a release

Security reports arrive through GitHub's private vulnerability reporting ([`SECURITY.md`](../SECURITY.md)). A fix lands on `main` and in the next tag; older releases are not patched. There are no automatic dependency updates; updates are done by hand, majors in pairs (see *Dependencies* in [Development](development.md)).
