# 06 — Roadmap

Ordered by recommended sequence. Move an item to its own numbered spec when work starts.

## Next (agreed order for the next session)

### A. Metadata collection ([03](03-connections-import.md))

Today only tables, columns, PK/FK and indexes are imported.

- **A1. Import more objects**, per engine: **views** (with their columns, and the definition in a note), **enums**, **sequences**, **triggers**, and **comments on non-table objects** (views and their columns, sequences, functions…). Decide the DBML representation first — DBML has `Enum`, `Note` and `Table` but no native view/trigger/sequence — and keep `toDbml` the single generator. Update the privilege/limits notes in [03](03-connections-import.md) and the round-trip expectations in [04](04-formats.md).
- **A2 (done). Pick specific tables inside a schema**: replace the comma-separated text filter with a table list (checkboxes, search, select all/none) fed by a new read-only "list tables" endpoint (catalog query, same guardrails as the rest) and remembered in the connection (`tables`).
- **A3. Verify Oracle TLS end to end** (TCPS listener + wallet/CA PEM, `verify` / `noverify`, `serverDn`). Needs an Oracle with TCPS configured (a TLS-enabled Oracle service in `docker-compose.yml`, or a real server). Until then it stays documented as unverified; only the descriptor, the clean failure and the injection rejection are tested.

### B. Collaboration (original plan, steps 4 and 5)

- **B1. Group-owned database connections** (*not done*): an administrator or group owner registers a connection once (read-only credential); members use it to import and refresh without seeing the secret; clear rules for who may use it; **audit log** of who used which connection and when. Sensitive: revisit [05](05-security.md) first.
- **B2. SSO** (*not done*): OIDC/LDAP login for organisations.
- Already delivered from the original plan: step 3 — sharing with people, groups and links with view/comment/edit, flat groups, administration ([09](09-accounts-sharing.md)).

## After that

- **Server-side scheduled refresh** — diagrams live on the server now; run refresh without an open page, keep the last snapshot and diff history.
- **Account hardening** — e-mail verification and self-service reset (optional SMTP), account deletion, session list, link expiry, audit log.
- **Public deployment** — HTTPS reverse proxy, `DB_HOST_POLICY=public-only` with pinned resolved IPs, general rate limits, CI audit, free hosted instance ([05](05-security.md)).

## Later

- Cross-dialect SQL export (type/default translation) so PG→MySQL/MSSQL and Oracle→MySQL produce valid DDL.
- Check constraints and partition details in the import.
- More engines: MySQL/MariaDB, SQL Server.
- DBML `Records` (sample data) and custom properties; per-table color picker; column-level layout controls.
- Schema diff between two imports (history) and "drift" notifications.
- Realtime collaboration.
- Mobile/narrow layout.

## Done (see git history)

Accounts with roles, administration (users, flat groups, settings), operator CLI, private diagrams (autosave), sharing with people/groups/links with owner-chosen permissions, multi-author comments, administrators manage every diagram, SSRF host policy, sample shop model · DBML editor + diagram · live import PG/Oracle (tables, columns, PK/FK, indexes, table/column comments) · TableGroups/colors/themes · multi-format import/export · Help tab · generated documentation (view, comments, HTML/Markdown export; shareable through links) · read-only guardrails, privilege checks, TLS (PostgreSQL verified; Oracle partly), manual/auto refresh.
