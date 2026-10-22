# Self-hosting

OpenDiagram ships as **one Docker image** with built-in SQLite storage. No other service is needed.

## Quick start

Requires Docker with Compose v2.

```bash
mkdir opendiagram && cd opendiagram
curl -fsSLO https://raw.githubusercontent.com/MarcosOliveira-Intelicity/OpenDiagram/main/docker-compose.yml
echo "APP_SECRET=$(openssl rand -hex 32)" > .env
docker compose up -d            # pulls the image and starts the app on :3000
```

Open `http://localhost:3000` and create the first account: it becomes the **administrator**.

The compose file runs the container with a read-only filesystem (only the `/data` volume and a small `/tmp` are writable), restarts it unless you stop it, and keeps the data in the volume `opendiagram_appdata`. Set `OPENDIAGRAM_VERSION=1.0.0` in `.env` to pin a version.

Demo databases to try the import (PostgreSQL, and Oracle with `--profile oracle`) need a clone of the repository: `docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d --build`. They are for trying the app only (their passwords are public).

> **Info** How much CPU, memory and disk it needs, measured: [Hosting requirements](hosting-requirements). A database behind a VPN or a firewall: see *Databases behind a VPN or a firewall* below.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `APP_SECRET` | empty | Key that encrypts saved passwords and certificates. Empty = a public development key and a warning at startup (local trial only); the server refuses to start without it when `COOKIE_SECURE=1`, `DB_HOST_POLICY` is not `open`, or `REQUIRE_APP_SECRET=1`. Changing it makes the saved passwords unreadable: the connections stay listed, with a warning, and each password has to be entered again (a saved CA certificate is dropped and pasted again). |
| `PORT`, `DATA_DIR` | `3000`, `/data` | fixed inside the image (Dockerfile); they are not read from `.env`. To change the host port edit `ports:` in `docker-compose.yml` (for example `8080:3000`). `app.db` lives in `DATA_DIR` (Docker volume `appdata`). **Back it up.** |
| `ALLOW_SIGNUP` | empty | empty: the administrator decides (closed after the first account); `1` opens sign-up; `0` forces it closed |
| `DB_HOST_POLICY` | `open` | which database hosts users may reach: `open`, `public-only` (blocks hosts that resolve to private, loopback, link-local, CGNAT or multicast addresses) or `allowlist` |
| `DB_HOST_ALLOWLIST` | | comma-separated exact host names (no wildcards or ranges), only with `allowlist` |
| `COOKIE_SECURE` | `0` | `1` when served over HTTPS (it is also set automatically when the proxy sends `X-Forwarded-Proto: https`) |
| `TRUST_PROXY` | `0` | `1` behind a reverse proxy, so rate limits use the real client address and the request check reads `X-Forwarded-Host` |

## Databases behind a VPN or a firewall

OpenDiagram connects to your databases **from the server**, not from the browser. So the machine that runs the app (or its container) must be able to reach the database host and port, **exactly as any program on that machine would**. There is no VPN setting inside the app, and the people who use it do **not** need the VPN: only the server does.

- **The server is already on the network** (a VM or a host in the company network, or with the VPN client running on it): nothing to configure. Docker containers on a Linux host reuse the host's routes, so they reach what the host reaches.
- **Docker Desktop (Windows, macOS)**: containers run in a small VM and often **do not** use the VPN of your PC. Run the app directly on the PC (`cd server && npm start`, Node 24) while you work on it, or put the app on a server that is on the VPN.
- **A VPN client in a container** (a "sidecar", for example OpenVPN or WireGuard): run it as a service in `docker-compose.yml` and attach the app to its network with `network_mode: "service:vpn"` on the `app` service. The app then sees the VPN, and its port `3000` is published on the `vpn` service.
- **Only one bastion is reachable**: open an SSH tunnel on the server (`ssh -N -L 0.0.0.0:15432:db.internal:5432 user@bastion`; keep that port closed to the network with a firewall) and register the connection with that host and port. From a container use `host.docker.internal` (on Linux add `extra_hosts: ["host.docker.internal:host-gateway"]` to the `app` service).
- **Names**: use the host name the server can resolve. If the container does not resolve internal names, use the IP address or set `dns:` for the `app` service.
- **Host policy**: VPN and internal addresses are private. `DB_HOST_POLICY=public-only` **blocks** them; keep `open` (the default) or use `allowlist` with the exact host names. See *Configuration* above.

If a connection test says it cannot connect, test from the same place the app runs: `docker compose exec app node -e "require('net').connect(5432,'db.internal').on('connect',()=>{console.log('ok');process.exit()}).on('error',e=>{console.log(e.message);process.exit(1)})"` (change the host and port).

Importing and refreshing read only the catalog, so a read-only user is enough. The scheduled refresh also runs on the server, so it needs the same network path. A shared or scheduled connection stops working when the VPN is down, and the Database drawer shows the last error.

**Logs:** `docker compose logs app` shows every request (share-link tokens are masked) and every failed scheduled refresh (`scheduled refresh failed`, with the diagram id and the error). Each answer of the app carries an `x-request-id` header (visible in the browser's developer tools, Network tab): it is the `reqId` of the matching log line, so a person reporting a problem can give it to you.

## Publishing it

Before exposing the instance beyond your own network:

1. Serve it over **HTTPS** and set `COOKIE_SECURE=1` (and `TRUST_PROXY=1` behind a proxy). The proxy must tell the app which address the browser used: keep the `Host` header (nginx: `proxy_set_header Host $host;`, Caddy and Traefik do it by default) or send `X-Forwarded-Host`. Otherwise every change, sign-in included, is refused as *cross-origin request blocked*.
2. Set a strong `APP_SECRET`.
3. Set `DB_HOST_POLICY=public-only` or `allowlist` so users cannot point the app at your internal network.
4. Keep sign-up closed and create accounts as the administrator. Sessions last 30 days. Wrong passwords lock sign-in for a few minutes after 8 in 15 minutes for the same e-mail and address, 50 from one address whatever the e-mail, or 30 for one e-mail from any address (behind a proxy set `TRUST_PROXY=1` so the real address is seen; otherwise everyone shares the proxy's address and its budget of 50).
5. Read the security notes of the project (`.specs/05-security.md`) first.

## Backup and moving to another machine

Everything is one SQLite file in the `appdata` volume. Restore with the **same** `APP_SECRET`: with another one everything works except the saved database passwords, which the Database tab and *Administration → Connections* then ask you to enter again.

```bash
docker compose exec app node src/cli.js backup                       # a consistent copy while the app runs: /data/backup-<date>-<time>.db
docker compose cp app:/data/backup-20261022-101500.db .              # take it off the machine (the name is printed by the command above)
# restore, on this machine or a new one (start the app once there so the volume exists)
docker compose cp ./backup-20261022-101500.db app:/data/
docker compose stop app
docker compose run --rm app node src/cli.js restore /data/backup-20261022-101500.db
docker compose start app
```

`restore` checks that the file is an OpenDiagram database and refuses while the app is running on the data (stop it first; `--force` skips that check when a crashed app left its mark). Backups stay in the volume until you delete them (`docker compose exec app sh -c 'rm /data/backup-*.db'`).

## Updating

Run `docker compose pull && docker compose up -d` (from a clone: pull the repository and run `docker compose up -d --build app`). The data volume is kept.

> **Warning** Older versions named the data volume after the folder of the repository (for example `myfolder_appdata`); the compose file now always uses the project name `opendiagram`, so the volume is `opendiagram_appdata`. Copy the old one over once, with the app stopped (`docker volume ls` shows the old name):
>
> ```bash
> docker compose down
> docker volume create opendiagram_appdata
> docker run --rm -v OLDNAME_appdata:/from:ro -v opendiagram_appdata:/to alpine sh -c "cp -a /from/. /to/ && chown -R 1000:1000 /to"
> docker compose up -d
> ```

> **Warning** Since the release that runs the container as the unprivileged user `node`, a data volume created by an older version belongs to `root` and the app stops at start-up with "/data is not writable". Hand it over once, then start again:
>
> ```bash
> docker compose run --rm --user root --entrypoint chown app -R node:node /data
> docker compose up -d app
> ```

The container reports its health to Docker (`docker compose ps` shows `healthy`): every 30 seconds it calls `/api/health`, which also checks that the database answers.
