# OpenDiagram

Open-source database diagramming tool in the spirit of dbdiagram.io: write [DBML](https://dbml.dbdiagram.io/docs), get a live diagram — **or connect to a PostgreSQL / Oracle database and generate the diagram from its metadata.**

- **Live import** from PostgreSQL and Oracle: tables, columns, types, defaults, comments, PK, FK (with `ON DELETE`/`ON UPDATE`), indexes.
- **Read-only by design**: every session is opened read-only and only reads catalog metadata, never table data. Credentials with excess privileges are detected and can be refused.
- **Keep metadata fresh**: manual refresh or an automatic interval; your TableGroups and layout survive a refresh.
- **DBML editor** (CodeMirror): syntax highlighting, autocomplete (keywords, types, tables, `table.column`), inline parser errors. Color settings (`headercolor`, `color`) get a clickable swatch that opens a color picker, plus a preset palette on `color: `.
- **Diagram** (React Flow): auto layout, drag, search, relationship highlight, TableGroups with colors, light/dark theme.
- **Import** SQL (PostgreSQL, MySQL, SQL Server, Snowflake) and DBML files; **export** DBML, SQL (PostgreSQL, MySQL, SQL Server, Oracle), JSON, PNG, SVG.
- **TLS** for PostgreSQL and Oracle (TCPS), with optional custom CA.
- Ships as a single Docker image; no external services needed.

> Status: working MVP, **single-user, no authentication yet**. Read [Security](#security) before exposing it beyond localhost. Progress and plans live in [`.specs/`](.specs/README.md).

## Quick start

Requires Docker (with Compose v2).

```bash
cp .env.example .env            # set APP_SECRET (openssl rand -hex 32)
docker compose up -d --build    # app on :3000 + demo Postgres
docker compose --profile oracle up -d   # optional: demo Oracle Free (first start is slow)
```

Open <http://localhost:3000>. The demo databases are reachable **from the app container** with these hosts:

| DB | Host | Port | Database / service | User / password |
|----|------|------|--------------------|-----------------|
| Postgres | `demo-pg` | 5432 | `demo` | `postgres`/`demo` (superuser → triggers guardrail warnings), `writer`/`writer` (can write → warning), `reader`/`reader` (select only → clean) |
| Postgres + TLS (self-signed) | `demo-pg-tls` | 5432 | `demo` | `postgres`/`demo` |
| Oracle | `demo-oracle` | 1521 | `FREEPDB1` | `shop`/`shop` |

Schema to import: `shop` (Postgres) / `SHOP` (Oracle).

If the Oracle demo has no tables (init scripts can race the app-user creation), load them once:

```bash
docker compose exec -T demo-oracle sqlplus -S "/ as sysdba" < demo/oracle.sql
```

To re-run the Postgres demo init (e.g. after editing `demo/pg.sql`) recreate its anonymous volume: `docker compose rm -sfv demo-pg && docker compose up -d demo-pg`.

## Using it

1. **Database** tab → fill host/port/database (Oracle: service name), user and password → **Test connection**. You get the schema list plus any privilege warnings.
2. Tick schemas (optionally restrict to table names) → **Import**. The connection is saved and linked to the diagram.
3. Edit the DBML on the left; the diagram updates live. **Docs** tab has copy-paste examples for `Ref`, `TableGroup` colors, `headercolor`, indexes, enums.
4. **↻** in the top bar re-reads the metadata; set an interval in the connection for automatic refresh (runs while the page is open).
5. **Export** tab: DBML, SQL per dialect, JSON, PNG, SVG. **View** tab: theme, grid, edge style, hide types/indexes.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `APP_SECRET` | `dev-secret-change-me` | Key for AES-256-GCM encryption of saved passwords / CA PEMs. **Set it** outside local dev; changing it invalidates saved connections. |
| `PORT` | `3000` | HTTP port. |
| `DATA_DIR` | `/data` (container) | Where `connections.json` lives (Docker volume `appdata`). |

## Develop

```bash
# API (needs Node 22+)
cd server && npm install && npm start          # http://localhost:3000
# UI with hot reload, proxying /api to :3000
cd web && npm install && npm run dev           # http://localhost:5173
# production build into server/public
cd web && npm run build
```

Tests (stack must be running; see [`.specs/07-testing.md`](.specs/07-testing.md)):

```bash
node server/test-guardrails.mjs        # read-only/privilege guardrails + PostgreSQL TLS modes
cd web && node roundtrip.mjs           # DB import → export → re-import per format (needs the oracle profile)
```

Layout: `server/` (Fastify API, introspection, DBML generation) · `web/` (Vite + React UI) · `demo/` (sample databases) · `.specs/` (product/architecture specs) · `CLAUDE.md` (guide for AI coding agents).

## Security

Short version: **do not expose this to the internet as-is.**

- No authentication; saved connections are shared by everyone who can reach the server.
- The server connects to any host a user types (SSRF risk) — needs auth and a host allowlist before public hosting.
- Mitigations that exist today: read-only sessions, privilege detection/blocking, secrets encrypted at rest, TLS with certificate verification, hardened Oracle connect descriptor.

Details, threat model and a pre-deployment checklist: [`.specs/05-security.md`](.specs/05-security.md).

## Known limitations

- PostgreSQL and Oracle only (live import). Views, enums, sequences, triggers and comments on non-table objects are not imported yet.
- Oracle SQL **files** cannot be imported (parser limitation) — use the live Oracle import. JSON is export-only.
- Exporting SQL for a different engine than the source needs manual edits (e.g. `nextval(...)` defaults, `character varying`).
- Auto-refresh runs in the browser; it stops when the page is closed.
- Oracle TLS (TCPS) is implemented but not yet verified end-to-end against a TLS listener (see spec).

## Credits and disclaimer

Built on [`@dbml/core`](https://github.com/holistics/dbml) (Apache-2.0), [React Flow](https://reactflow.dev) (MIT), [CodeMirror 6](https://codemirror.net) (MIT), [dagre](https://github.com/dagrejs/dagre) (MIT), [html-to-image](https://github.com/bubkoo/html-to-image) (MIT), [node-postgres](https://node-postgres.com) (MIT), [node-oracledb](https://node-oracledb.readthedocs.io) (Apache-2.0/UPL), [Fastify](https://fastify.dev) (MIT).

OpenDiagram is an independent project, **not affiliated with or endorsed by dbdiagram.io / Holistics**. It is a clean-room implementation of comparable behaviour; no code or assets from their service are used. DBML is an open language by Holistics.

## License

[MIT](LICENSE)
