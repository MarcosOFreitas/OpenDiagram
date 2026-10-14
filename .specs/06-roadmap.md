# 06 — Roadmap

Ordered by recommended sequence. Move an item to its own numbered spec when work starts.

## Next

1. **dbdocs-style documentation** — read-only HTML docs generated from DBML: table/column pages, notes, relationships, search, shareable page. Pure client/server rendering from DBML; no auth needed for local use.
2. **Accounts + saved diagrams + share links** — replaces JSON store and `localStorage` source link; per-user connections; unlocks server-side refresh. Prerequisite for public hosting ([05](05-security.md)).
3. **Server-side scheduled refresh** — runs without an open page; stores last metadata snapshot and diff history.
4. **Public deployment** — HTTPS, allowlist for DB hosts, rate limits, free hosted instance.

## Later

- Cross-dialect SQL export (type/default translation) so PG→MySQL/MSSQL and Oracle→MySQL produce valid DDL.
- Oracle TLS end-to-end test (TCPS listener + wallet/CA) and SSL_SERVER_DN_MATCH variants.
- Import views, enums, sequences, check constraints; comments for more object types.
- More engines: MySQL/MariaDB, SQL Server.
- DBML `Records` (sample data) and custom properties; per-table color picker; column-level layout controls.
- Schema diff between two imports (history) and "drift" notifications.
- Realtime collaboration (not before accounts).
- Mobile/narrow layout.

## Done (see git history)

DBML editor + diagram · live import PG/Oracle · TableGroups/colors/themes · multi-format import/export · Docs tab · read-only guardrails, privilege checks, TLS, manual/auto refresh.
