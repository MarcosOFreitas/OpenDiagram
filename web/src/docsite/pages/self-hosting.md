# Self-hosting

OpenDiagram ships as **one Docker image** with built-in SQLite storage. No other service is needed.

## Quick start

Requires Docker with Compose v2.

```bash
cp .env.example .env            # set APP_SECRET (openssl rand -hex 32)
docker compose up -d --build    # the app on :3000 plus a demo PostgreSQL
```

Open `http://localhost:3000` and create the first account: it becomes the **administrator**.

Optional demo databases to try the import:

```bash
docker compose --profile oracle up -d    # demo Oracle Free (the first start is slow)
```

> **Warning** The `demo-*` services are only for trying the app. Remove them for a real deployment.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `APP_SECRET` | `dev-secret-change-me` | Key that encrypts saved passwords and certificates. **Set it** outside local development. Changing it makes saved connections unreadable. |
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `/data` (container) | where `app.db` lives (Docker volume `appdata`). **Back it up.** |
| `ALLOW_SIGNUP` | empty | empty: the administrator decides (closed after the first account); `1` opens sign-up; `0` forces it closed |
| `DB_HOST_POLICY` | `open` | which database hosts users may reach: `open`, `public-only` (blocks private, loopback and link-local addresses) or `allowlist` |
| `DB_HOST_ALLOWLIST` | | comma-separated hosts, only with `allowlist` |
| `COOKIE_SECURE` | `0` | `1` when served over HTTPS |
| `TRUST_PROXY` | `0` | `1` behind a reverse proxy, so rate limits use the real client address |

## Publishing it

Before exposing the instance beyond your own network:

1. Serve it over **HTTPS** and set `COOKIE_SECURE=1` (and `TRUST_PROXY=1` behind a proxy).
2. Set a strong `APP_SECRET`.
3. Set `DB_HOST_POLICY=public-only` or `allowlist` so users cannot point the app at your internal network.
4. Keep sign-up closed and create accounts as the administrator.
5. Read the security notes of the project (`.specs/05-security.md`) first.

## Backup and moving to another machine

Everything is one SQLite file in the `appdata` volume. Restoring needs the **same** `APP_SECRET`.

```bash
docker compose cp app:/data ./backup        # backup (the app can keep running)
# on the new machine: start once, then restore and restart
docker compose up -d --build
docker compose cp ./backup/. app:/data && docker compose restart app
```

## Updating

Pull the new version of the repository and run `docker compose up -d --build app`. The data volume is kept.
