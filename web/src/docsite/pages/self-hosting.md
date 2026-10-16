# Self-hosting

OpenDiagram ships as **one Docker image** with built-in SQLite storage. No other service is needed.

## Quick start

Requires Docker with Compose v2.

```bash
cp .env.example .env            # set APP_SECRET (openssl rand -hex 32)
docker compose up -d --build    # the app on :3000 plus two demo PostgreSQL servers (demo-pg, demo-pg-tls)
```

Open `http://localhost:3000` and create the first account: it becomes the **administrator**.

Optional demo databases to try the import:

```bash
docker compose --profile oracle up -d    # demo Oracle Free (the first start is slow)
```

> **Warning** The `demo-*` services are only for trying the app (their passwords are public). Remove them for a real deployment, and also remove from the `app` service the `NODE_EXTRA_CA_CERTS` variable and the `./demo/oracle-tls/server.pem` volume line: they only exist to trust the demo Oracle TLS proxy.

> **Info** How much CPU, memory and disk it needs, measured: [Hosting requirements](hosting-requirements). A database behind a VPN or a firewall: see *Databases behind a VPN or a firewall* below.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `APP_SECRET` | `dev-secret-change-me` | Key that encrypts saved passwords and certificates. **Set it** outside local development. Changing it makes saved connections unreadable. |
| `PORT`, `DATA_DIR` | `3000`, `/data` | fixed inside the image (Dockerfile); they are not read from `.env`. To change the host port edit `ports:` in `docker-compose.yml` (for example `8080:3000`). `app.db` lives in `DATA_DIR` (Docker volume `appdata`). **Back it up.** |
| `ALLOW_SIGNUP` | empty | empty: the administrator decides (closed after the first account); `1` opens sign-up; `0` forces it closed |
| `DB_HOST_POLICY` | `open` | which database hosts users may reach: `open`, `public-only` (blocks hosts that resolve to private, loopback, link-local, CGNAT or multicast addresses) or `allowlist` |
| `DB_HOST_ALLOWLIST` | | comma-separated exact host names (no wildcards or ranges), only with `allowlist` |
| `COOKIE_SECURE` | `0` | `1` when served over HTTPS (it is also set automatically when the proxy sends `X-Forwarded-Proto: https`) |
| `TRUST_PROXY` | `0` | `1` behind a reverse proxy, so rate limits use the real client address |

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

## Publishing it

Before exposing the instance beyond your own network:

1. Serve it over **HTTPS** and set `COOKIE_SECURE=1` (and `TRUST_PROXY=1` behind a proxy).
2. Set a strong `APP_SECRET`.
3. Set `DB_HOST_POLICY=public-only` or `allowlist` so users cannot point the app at your internal network.
4. Keep sign-up closed and create accounts as the administrator. Sessions last 30 days; 8 wrong passwords in 15 minutes for the same e-mail and address lock sign-in for a few minutes (behind a proxy set `TRUST_PROXY=1` so the real address is seen).
5. Read the security notes of the project (`.specs/05-security.md`) first.

## Backup and moving to another machine

Everything is one SQLite file in the `appdata` volume. Restoring needs the **same** `APP_SECRET`.

```bash
docker compose stop app                     # the database runs in WAL mode: copy it while the app is stopped
docker compose cp app:/data ./backup        # backup
docker compose start app
# on the new machine: start once, then stop, restore and start
docker compose up -d --build
docker compose stop app
docker compose cp ./backup/. app:/data
docker compose start app
```

## Updating

Pull the new version of the repository and run `docker compose up -d --build app`. The data volume is kept.
