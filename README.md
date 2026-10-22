# OpenDiagram

Free, open-source ([Apache-2.0](#license)), self-hostable database diagramming tool in the spirit of dbdiagram.io: write [DBML](https://dbml.dbdiagram.io/docs) and get a live diagram, **or connect to a PostgreSQL / Oracle database and generate the diagram from its metadata** (read-only, never table data). It also generates browsable documentation, tracks versions, and lets a team share diagrams with accounts, groups and links.

**Documentation:** <http://localhost:3000/docs> once it runs (the same pages live in [`web/src/docsite/pages`](web/src/docsite/pages)). **For contributors and AI agents:** [`CONTRIBUTING.md`](CONTRIBUTING.md), [`AGENTS.md`](AGENTS.md), [`.specs/`](.specs/README.md). **Security:** [`SECURITY.md`](SECURITY.md).

## Features

- **Live import** from PostgreSQL, Oracle and MySQL 8.0+ (MariaDB 10.6+ best effort): tables, views and materialized views, columns, types, defaults, comments, PK, FK (with `ON DELETE` / `ON UPDATE`), indexes, check constraints, partitioning (method and key), enums, sequences and triggers. A table picker chooses schemas and individual tables (search, wildcards, TableGroups).
- **Read-only by design**: every session is opened read-only and only reads catalog metadata. Credentials with excess privileges are detected and can be refused. TLS for PostgreSQL and Oracle (TCPS) with certificate verification and a custom CA.
- **Keep metadata fresh**: manual refresh or an automatic interval (every 5 minutes at the least, run by the server even with no page open); your TableGroups and layout survive a refresh.
- **MCP connector for AI clients**: separate agent accounts created by administrators, bearer tokens, tools to list, read, comment on and edit only the diagrams shared with them; an agent never sees a connection or a credential; every call is audited.
- **DBML editor** (CodeMirror 6): highlighting, autocomplete, inline parser errors, color swatches with a picker, search and replace.
- **Diagram** (React Flow): five auto-arrange algorithms, a Tables panel (search, hide, saved views, detail levels), TableGroups with colors, draggable relationship labels, sticky notes, light and dark theme.
- **Data lineage**: dashed arrows from source tables to the views built from them, down to the column (read from the view's SQL), or written by hand in the DBML.
- **Generated documentation** (dbdocs-style): a browsable, searchable *Docs* view with your own comments (stored only in the app), a changelog from the named versions, and export as one standalone `.html` or Markdown.
- **Versions and history**: every change is kept, versions can be named, compared and restored; two people saving at once get an edit-conflict dialog instead of silent overwrites; avatars show who has the diagram open.
- **Accounts, groups and sharing**: e-mail + password; the **first account is the administrator** and creates the others; flat groups; private diagrams; share with people, groups or links (view / comment / edit, optional link password). Administrators can **register a shared database connection** that members use without seeing its credential; every use is written to an **audit log** that can be filtered by person, target and type of operation.
- **Import** SQL (PostgreSQL, MySQL, SQL Server, Oracle, Snowflake) and DBML; **export** DBML, SQL (PostgreSQL, MySQL, SQL Server, Oracle), JSON, PNG, SVG.
- Ships as **one Docker image with SQLite storage**; no external services.

> Status: working and tested, pre-1.0. Read [Security](#security) before exposing it beyond your own machine or network. What is planned and what is deliberately not done is in [`.specs/06-roadmap.md`](.specs/06-roadmap.md).

## Quick start

Requires Docker with Compose v2 (Docker Desktop on Windows and macOS). Node 24 is only needed for [development](#develop).

To run it, only the compose file and a secret are needed (the image `ghcr.io/marcosoliveira-intelicity/opendiagram` is published for amd64 and arm64):

```bash
mkdir opendiagram && cd opendiagram
curl -fsSLO https://raw.githubusercontent.com/MarcosOliveira-Intelicity/OpenDiagram/main/docker-compose.yml
echo "APP_SECRET=$(openssl rand -hex 32)" > .env
docker compose up -d            # app on :3000
```

To try the live import against the demo databases, or to develop, clone the repository instead:

```bash
git clone https://github.com/MarcosOliveira-Intelicity/OpenDiagram.git && cd OpenDiagram
cp .env.example .env            # set APP_SECRET (openssl rand -hex 32)
docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d --build                    # app (built from source) + demo Postgres
docker compose -f docker-compose.yml -f docker-compose.demo.yml --profile oracle up -d           # optional: demo Oracle Free (the first start is slow)
```

Uncommenting `COMPOSE_PATH_SEPARATOR` and `COMPOSE_FILE` in `.env` makes plain `docker compose ...` include the demo file; the commands below assume it.

Open <http://localhost:3000> and **create the first account: it becomes the administrator**. From the avatar menu → **Administration** it creates the other users (each gets a temporary password and must choose their own at first sign-in) and groups. Public sign-up stays closed unless you open it. New accounts start with a sample diagram, "Online store - sample". Alternatively create the administrator from the command line: `docker compose exec app node src/cli.js create-admin <email> <password>`.

The demo databases are reachable **from the app container** with these hosts:

| DB | Host | Port | Database / service | User / password |
|----|------|------|--------------------|-----------------|
| Postgres | `demo-pg` | 5432 | `demo` | `postgres`/`demo` (superuser: triggers guardrail warnings), `writer`/`writer` (can write: warning), `reader`/`reader` (select only: clean) |
| Postgres + TLS (self-signed) | `demo-pg-tls` | 5432 | `demo` | `postgres`/`demo` |
| MySQL 8.4 | `demo-mysql` | 3306 | (database `shop`) | `root`/`demo` (everything: warnings), `writer`/`writer` (can write: warning), `reader`/`reader` (read only: clean) |
| Oracle | `demo-oracle` | 1521 | `FREEPDB1` | `shop`/`shop` |
| Oracle over TLS | `demo-oracle-tls` (alias `oracle.demo.test`) | 2484 | `FREEPDB1` | `shop`/`shop`; the certificate (CN `oracle.demo.test`, in `demo/oracle-tls`) is throw-away and trusted by the app |

Schema to import: `shop` (Postgres and MySQL) or `SHOP` (Oracle). The Oracle demo creates its user and tables on the first start (allow a minute or two). If the tables are ever missing, load them once: `docker compose exec -T demo-oracle sqlplus -S "/ as sysdba" < demo/oracle.sql`. To re-run the Postgres demo init after editing `demo/pg.sql`: `docker compose rm -sfv demo-pg && docker compose up -d demo-pg`.

The demo databases are for trying and testing only and live in `docker-compose.demo.yml`, which a real deployment does not use (their passwords are public; their ports are published on `127.0.0.1` only).

### Backup and moving to another machine

Everything the app stores (accounts, diagrams, comments, saved connections, audit log) is one SQLite file in the `appdata` volume. Saved connection passwords are encrypted with `APP_SECRET`, so a restore needs the **same** `APP_SECRET`.

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

## Using it

1. **More → Database**: host, port, database (Oracle: service name), user and password → **Test connection**. You get the schema list and any privilege warnings. Tick schemas (optionally **All tables - choose specific ones** to pick tables) → **Import**. The connection is saved and linked to the diagram; the top bar then shows a refresh button, and the connection can refresh on an interval.
2. Edit the DBML on the left; the diagram updates live. Drag the editor's edge to resize it; Ctrl+F searches and replaces; Ctrl+K opens the Tables panel.
3. **Docs** (top bar) shows generated documentation for the DBML: click a table header to collapse it, click a comment area to add a note. **Export** offers DBML, SQL per dialect, JSON, PNG, SVG and the documentation (HTML / Markdown). The **sun/moon** button in the top bar switches light and dark; the side panel on the right of the diagram has the **Tables** tab and a **Display** tab (line style, detail level, grid and the other display options); the button at the right of the editor's status bar wraps long lines.
4. **More → Diagrams**: your diagrams and the ones shared with you (start from a template or a blank diagram); everything autosaves. **More → History**: versions, compare, restore. **Share**: give a person or a group view / comment / edit access, or create a link. **Administration** (administrators, avatar menu): users, groups, shared connections, audit log, settings. Administrators can open and manage every diagram of the instance, but never other people's personal connections.
5. **More → Documentation** opens the full guide (also at `/docs`), with DBML examples and one page per feature.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `APP_SECRET` | empty | Key for AES-256-GCM encryption of saved passwords and CA PEMs. Empty = a public development key and a warning at startup (local trial only); the server **refuses to start** without it when `COOKIE_SECURE=1`, `DB_HOST_POLICY` is not `open`, or `REQUIRE_APP_SECRET=1`. Changing it invalidates saved connections. |
| `PORT` | `3000` | HTTP port. |
| `DATA_DIR` | `/data` (container) | Where `app.db` (SQLite) lives (Docker volume `appdata`). **Back it up.** |
| `ALLOW_SIGNUP` | empty | Empty: the administrator decides (closed after the first account). `1` opens self-registration, `0` forces it closed. |
| `DB_HOST_POLICY` | `open` | Which database hosts users may connect to: `open`, `public-only` (blocks private, loopback and link-local addresses) or `allowlist` (+ `DB_HOST_ALLOWLIST`, comma-separated host names). |
| `COOKIE_SECURE` / `TRUST_PROXY` | `0` | Set `1` when served over HTTPS / behind a reverse proxy (which must keep the `Host` header or send `X-Forwarded-Host`). |
| `BACKUP_DIR` / `BACKUP_KEEP_DAYS` | empty / `7` | Daily automatic backup of the database into a folder of the data volume (`backups`), kept that many days; copy them off the machine yourself. |

## Develop

```bash
# API (Node 24: uses the built-in node:sqlite); data goes to ./server/data (git-ignored)
cd server && npm install && npm start          # http://localhost:3000; the first account you create is the administrator
# UI with hot reload, proxying /api to :3000
cd web && npm install && npm run dev           # http://localhost:5173
# production build into server/public
cd web && npm run build
```

Unit tests run in seconds without Docker (`cd server && npm test`, `cd web && npm test`) and in CI; the rest of the verification is end-to-end (no linter): the scripts and what each needs are listed in [`.specs/07-testing.md`](.specs/07-testing.md). They need an administrator of the instance under test: create a throw-away one with `docker compose exec app node src/cli.js create-admin admin@example.com 'a-long-test-password'` and export `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`; `BASE=http://host:port` points them at another address (default `http://localhost:3000`).

Layout: `server/` (Fastify API, introspection, DBML generation) · `web/` (Vite + React UI and the documentation site) · `demo/` (sample databases) · `.specs/` (product, architecture and security specs) · [`AGENTS.md`](AGENTS.md) (guide for AI coding agents). See [`CONTRIBUTING.md`](CONTRIBUTING.md) to contribute.

## Security

Fine for your machine or a trusted network as is. **Before hosting it for other people**: set `APP_SECRET`, serve it over HTTPS (`COOKIE_SECURE=1`), set `DB_HOST_POLICY=public-only` (or `allowlist`), consider `ALLOW_SIGNUP=0`, remove the demo services, and read the checklist in [`.specs/05-security.md`](.specs/05-security.md). To report a vulnerability, follow [`SECURITY.md`](SECURITY.md).

In short: accounts (scrypt, HttpOnly cookies, login throttling), personal connections private to their owner, shared connections audited, and every database session read-only (metadata only). Details and the threat model: [`.specs/05-security.md`](.specs/05-security.md).

## Known limitations

- PostgreSQL, Oracle and MySQL for live import (MariaDB best effort); functions and procedures are not imported. SQL Server works as an SQL file import and export target. MySQL triggers are imported only with a user that has the `TRIGGER` privilege.
- Oracle SQL **files** import tables, keys, indexes and comments only (views, sequences and triggers come with the live import). JSON is export-only.
- Exporting SQL for a different engine than the source needs manual edits (for example `nextval(...)` defaults, `character varying`).
- The scheduled refresh runs in the server process (one instance); it skips a diagram that someone is editing and pauses after 5 failures in a row.
- Changes are detected and merged by version (conflict dialog), not edited live together: there is no real-time co-editing.
- No e-mail verification, self-service password reset, SSO or account self-deletion yet; accounts are created by administrators (no e-mail invitations); share links are bearer secrets.
- Oracle TLS (TCPS): `verify` was checked against an OCI Autonomous DB; `verify`, `serverDn` and `noverify` are tested against the `demo-oracle-tls` proxy. Wallets are not supported; a private CA is trusted by the server through `NODE_EXTRA_CA_CERTS` (mount the PEM and set it on the `app` service in `docker-compose.yml`).

## Credits and disclaimer

Built on [`@dbml/core`](https://github.com/holistics/dbml) (Apache-2.0), [React Flow](https://reactflow.dev) (MIT), [CodeMirror 6](https://codemirror.net) (MIT), [dagre](https://github.com/dagrejs/dagre) (MIT), [html-to-image](https://github.com/bubkoo/html-to-image) (MIT), [pgsql-ast-parser](https://github.com/oguimbal/pgsql-ast-parser) (MIT), [node-postgres](https://node-postgres.com) (MIT), [node-oracledb](https://node-oracledb.readthedocs.io) (Apache-2.0 / UPL), [Fastify](https://fastify.dev) (MIT). The UI/UX review rules were checked with the [ui-ux-pro-max skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT, vendored under `.claude/skills` with its notice).

Developed by Marcos Oliveira together with AI tools: [Claude](https://www.anthropic.com/claude) (Anthropic) through Claude Code, with the plugins [Ponytail](https://github.com/DietrichGebert/ponytail), [Caveman](https://github.com/JuliusBrussee/caveman), [Context7](https://github.com/upstash/context7) and [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) (code graph search).

OpenDiagram is an independent project, **not affiliated with or endorsed by dbdiagram.io or Holistics**. It is a clean-room implementation of comparable behaviour; no code or assets from their service are used. DBML is an open language by Holistics.

## License

[Apache License 2.0](LICENSE), with the copyright line in [`NOTICE`](NOTICE). In plain words: use it for anything (personal, company, commercial, hosted), change it and share it, as long as you keep the license and the notice and say what you changed. It comes with no warranty.

- The libraries OpenDiagram uses keep their own licenses (listed above); the skills vendored under `.claude/skills` keep theirs.
- This is a summary, not legal advice: the `LICENSE` file is what counts.
