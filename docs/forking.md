# Forking

OpenDiagram is Apache-2.0: you may copy it, change it and publish your own version. This is what to change so that your copy publishes its own image and receives its own reports. To cut a release afterwards, see [the releasing guide](releasing.md).

## Rename

| Where | What | To |
|---|---|---|
| `docker-compose.yml` (`image:`) | `ghcr.io/marcosoliveira-intelicity/opendiagram` | `ghcr.io/<your-owner>/<your-repo>` in lowercase (the release workflow already publishes to `ghcr.io/${{ github.repository }}`) |
| `README.md` (quick start), `web/src/docsite/pages/self-hosting.md`, `SECURITY.md`, `CONTRIBUTING.md` | the image name and the repository URLs | yours |
| `.github/ISSUE_TEMPLATE/config.yml` | the security advisory link | your repository's `/security/advisories/new` |
| `NOTICE` | keep the original copyright line | add your own line below it (Apache-2.0 section 4); keep `LICENSE` |

Do this before your first `docker compose up --build`: a local build is tagged with the image name of `docker-compose.yml`, and a later `docker compose pull` would replace it with the original project's image.

## Keep, on purpose

- The scrypt salt `'dbdiagram-open'` in `server/src/store.js`: it derives the key of every stored secret. Changing it makes every saved connection password unreadable.
- The agent token prefix `odt_`: tokens are recognised by it.
- The product name in the interface and the docs is yours to change; nothing depends on it.

## Repository settings

- **Actions**: enable them (forks start with them off). `ci.yml` runs the unit job on every push to `main` and every pull request, and the end-to-end job on `main` and on demand; `release.yml` runs on a pushed `v*` tag.
- **Private vulnerability reporting** (Settings → Code security): `SECURITY.md` and the issue template point to it.
- **Dependabot** alerts and security updates (Settings → Code security); version updates come from `.github/dependabot.yml`.
- **Branch protection** (optional): require the `unit` check. Do not require `e2e` on pull requests: it does not run there.
- **GHCR package**: after your first tag, make the package public (see [Releasing](releasing.md)).

## Running next to the original

`docker-compose.yml` fixes the Compose project name (`name: opendiagram`), so its data volume is always `opendiagram_appdata`, whatever the folder is called. Two stacks with that name on one Docker host share containers and data. Give your copy another name (`name:` in `docker-compose.yml`, or `docker compose -p <name>`), and remember that the UI tools' headers (`tools/uiaudit.mjs`, `tools/docshots.mjs`) use the network `opendiagram_default`.
