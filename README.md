# OpenDiagram

Open-source database diagramming tool in the spirit of dbdiagram.io: write [DBML](https://dbml.dbdiagram.io/docs), get a live diagram — **or connect to a PostgreSQL / Oracle database and generate the diagram from its metadata.**

- **Live import** from PostgreSQL and Oracle: tables, columns, types, defaults, comments, PK, FK (with `ON DELETE`/`ON UPDATE`), indexes.
- **Read-only by design**: every session is opened read-only and only reads catalog metadata, never table data. Credentials with excess privileges are detected and can be refused.
- **Keep metadata fresh**: manual refresh or an automatic interval; your TableGroups and layout survive a refresh.
- **DBML editor** (CodeMirror): syntax highlighting, autocomplete (keywords, types, tables, `table.column`), inline parser errors. Color settings (`headercolor`, `color`) get a clickable swatch that opens a color picker, plus a preset palette on `color: `.
- **Diagram** (React Flow): auto layout, drag, search, relationship highlight, TableGroups with colors, light/dark theme.
- **Generated documentation** (dbdocs-style): switch to *Docs* for a browsable, searchable page of tables, columns, constraints, notes and relationships. Tables collapse/expand, and you can add your own comments per table/column/project (stored only in the app, never in the database). Export as one standalone `.html` file or Markdown.
- **Sample model included**: every new account starts with a ready-made "Online store - sample" diagram (customers, catalogue, orders, payments, with groups, enums, indexes and relationships), and the Diagrams tab can create more from it.
- **Import** SQL (PostgreSQL, MySQL, SQL Server, Snowflake) and DBML files; **export** DBML, SQL (PostgreSQL, MySQL, SQL Server, Oracle), JSON, PNG, SVG.
- **TLS** for PostgreSQL and Oracle (TCPS), with optional custom CA.
- **Accounts, administration and sharing**: e-mail + password; the **first account is the administrator** and creates the others; flat **groups** (a person can be in several); private diagrams (autosaved) and database connections per account; share a diagram with **people, groups or optional links**, choosing view / comment / edit for each.
- Ships as a single Docker image with SQLite storage; no external services needed.

> Status: working MVP with **accounts (e-mail + password), private diagrams and optional share links**. Read [Security](#security) before exposing it beyond your own machine/network. Progress and plans live in [`.specs/`](.specs/README.md).

## Quick start

Requires Docker with Compose v2 (Docker Desktop on Windows/macOS). Nothing else is needed to run it; Node 24 is only needed for [development](#develop).

```bash
cp .env.example .env            # set APP_SECRET (openssl rand -hex 32)
docker compose up -d --build    # app on :3000 + demo Postgres
docker compose --profile oracle up -d   # optional: demo Oracle Free (first start is slow)
```

Open <http://localhost:3000> and **create the first account — it becomes the administrator** (it also adopts connections saved by older versions). From the avatar menu → **Administration** it creates the other users (each gets a temporary password and must choose their own at first sign-in) and groups; public sign-up stays closed unless you open it. The demo databases are reachable **from the app container** with these hosts:

| DB | Host | Port | Database / service | User / password |
|----|------|------|--------------------|-----------------|
| Postgres | `demo-pg` | 5432 | `demo` | `postgres`/`demo` (superuser → triggers guardrail warnings), `writer`/`writer` (can write → warning), `reader`/`reader` (select only → clean) |
| Postgres + TLS (self-signed) | `demo-pg-tls` | 5432 | `demo` | `postgres`/`demo` |
| Oracle | `demo-oracle` | 1521 | `FREEPDB1` | `shop`/`shop` |

Schema to import: `shop` (Postgres) / `SHOP` (Oracle).

The Oracle demo creates the `shop` user and its tables on first start (allow a minute or two for it to be ready). If the tables are ever missing, load them once:

```bash
docker compose exec -T demo-oracle sqlplus -S "/ as sysdba" < demo/oracle.sql
```

To re-run the Postgres demo init (e.g. after editing `demo/pg.sql`) recreate its anonymous volume: `docker compose rm -sfv demo-pg && docker compose up -d demo-pg`.

The demo databases are only for trying and testing the app; remove them (and the `demo-*` services) for a real deployment.

### Backup and moving to another machine

Everything the app stores (accounts, diagrams, comments, saved connections) is one SQLite file in the `appdata` volume. Saved connection passwords are encrypted with `APP_SECRET`, so a restore needs the **same** `APP_SECRET`.

```bash
docker compose cp app:/data ./backup                 # backup (the app can keep running)
# on the new machine: start once, then restore and restart
docker compose up -d --build
docker compose cp ./backup/. app:/data && docker compose restart app
```

## Using it

0. **Diagrams** tab: your diagrams (new accounts start with the sample shop model; *Start from a template* or *New blank diagram* for more) and the ones shared with you; everything autosaves. **Share** tab: give a person or a group view/comment/edit access, or create an optional link. **Administration** (administrators, avatar menu): users, groups, settings; administrators can also open and manage every diagram of the organisation (never other people's saved connections).
1. **More → Database** → fill host/port/database (Oracle: service name), user and password → **Test connection**. You get the schema list plus any privilege warnings.
2. Tick schemas (optionally restrict to table names) → **Import**. The connection is saved and linked to the diagram.
3. Edit the DBML on the left; the diagram updates live. **More → Documentation** opens the full documentation (also at `/docs`) with DBML examples for `Ref`, `TableGroup` colors, `headercolor`, indexes, enums.
4. **↻** in the top bar re-reads the metadata; set an interval in the connection for automatic refresh (runs while the page is open).
5. **Docs** (top bar) shows generated documentation for the DBML — click a table header to collapse it, click a comment area to add a note; **Export**: DBML, SQL per dialect, JSON, PNG, SVG, documentation (HTML / Markdown). **More → View**: theme, grid, edge style, hide types/indexes, editor line wrapping. Drag the edge of the editor to resize it; Ctrl+F searches and replaces.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `APP_SECRET` | `dev-secret-change-me` | Key for AES-256-GCM encryption of saved passwords / CA PEMs. **Set it** outside local dev; changing it invalidates saved connections. |
| `PORT` | `3000` | HTTP port. |
| `DATA_DIR` | `/data` (container) | Where `app.db` (SQLite: accounts, diagrams, connections, comments) lives (Docker volume `appdata`). **Back it up.** |
| `ALLOW_SIGNUP` | empty | Empty: the administrator decides (default closed after the first account). `1` opens self-registration, `0` forces it closed. |
| `DB_HOST_POLICY` | `open` | Which database hosts users may connect to: `open`, `public-only` (blocks private/loopback/link-local) or `allowlist` (+ `DB_HOST_ALLOWLIST`). |
| `COOKIE_SECURE` / `TRUST_PROXY` | `0` | Set `1` when served over HTTPS / behind a reverse proxy. |

## Develop

```bash
# API (needs Node 24: uses the built-in node:sqlite); data goes to ./server/data (gitignored)
cd server && npm install && npm start          # http://localhost:3000 — the first account you create is the administrator
# UI with hot reload, proxying /api to :3000
cd web && npm install && npm run dev           # http://localhost:5173
# production build into server/public
cd web && npm run build
```

Tests (the Docker stack must be running; see [`.specs/07-testing.md`](.specs/07-testing.md)). They need an administrator of the stack under test; create a throw-away one with the CLI. `BASE=http://host:port` points them at another address (default `http://localhost:3000`):

```bash
docker compose exec app node src/cli.js create-admin admin@example.com 'a-long-test-password'
export TEST_ADMIN_EMAIL=admin@example.com TEST_ADMIN_PASSWORD='a-long-test-password'
node server/test-auth.mjs              # accounts, roles, groups, sharing, link permissions, SSRF policy
node server/test-guardrails.mjs        # read-only/privilege guardrails + PostgreSQL TLS modes
cd web && npm install && node roundtrip.mjs   # DB import → export → re-import per format (needs the oracle profile; `npm install` once for @dbml/core)
```

Layout: `server/` (Fastify API, introspection, DBML generation) · `web/` (Vite + React UI) · `demo/` (sample databases) · `.specs/` (product/architecture specs) · `CLAUDE.md` (guide for AI coding agents).

## Security

Fine for your machine or a trusted network as is. **Before hosting it for other people** set `APP_SECRET`, serve it over HTTPS (`COOKIE_SECURE=1`), set `DB_HOST_POLICY=public-only` (or `allowlist`), consider `ALLOW_SIGNUP=0`, and read the checklist below.

- Accounts use e-mail + password (scrypt), HttpOnly SameSite cookies, login throttling and a cross-origin write guard. Administrators create accounts and reset passwords (there is no e-mail verification or self-service "forgot password" yet); if every administrator is locked out use `docker compose exec app node src/cli.js create-admin <email> <password>`.
- Saved database connections are private to their account (not even administrators can use them); secrets are encrypted at rest. Administrators can open, edit and delete any diagram of the organisation. Share links never expose connections or credentials.
- Every database session is read-only (metadata only); credentials with excess privileges are detected and can be refused; TLS with certificate verification is supported.

Details, threat model and a pre-deployment checklist: [`.specs/05-security.md`](.specs/05-security.md).

## Known limitations

- PostgreSQL and Oracle only (live import). Views, enums, sequences, triggers and comments on non-table objects are not imported yet.
- Oracle SQL **files** cannot be imported (parser limitation) — use the live Oracle import. JSON is export-only.
- Exporting SQL for a different engine than the source needs manual edits (e.g. `nextval(...)` defaults, `character varying`).
- Auto-refresh runs in the browser; it stops when the page is closed.
- Sharing works with people, groups and links, but accounts are only created by administrators (no e-mail invitations); share links are bearer secrets. No e-mail verification, self-service password reset, SSO or account self-deletion yet; saved database connections cannot be shared with a group yet.
- Oracle TLS (TCPS): `verify` without wallet checked against an OCI Autonomous DB; wallet/CA PEM, `noverify` and `serverDn` are not verified yet (see spec).

## Credits and disclaimer

Built on [`@dbml/core`](https://github.com/holistics/dbml) (Apache-2.0), [React Flow](https://reactflow.dev) (MIT), [CodeMirror 6](https://codemirror.net) (MIT), [dagre](https://github.com/dagrejs/dagre) (MIT), [html-to-image](https://github.com/bubkoo/html-to-image) (MIT), [node-postgres](https://node-postgres.com) (MIT), [node-oracledb](https://node-oracledb.readthedocs.io) (Apache-2.0/UPL), [Fastify](https://fastify.dev) (MIT).

OpenDiagram is an independent project, **not affiliated with or endorsed by dbdiagram.io / Holistics**. It is a clean-room implementation of comparable behaviour; no code or assets from their service are used. DBML is an open language by Holistics.

## License

[MIT](LICENSE)
