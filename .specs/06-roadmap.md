# 06 — Roadmap

Ordered by recommended sequence. Move an item to its own numbered spec when work starts.

## Next (agreed order for the next session)

### A. Metadata collection ([03](03-connections-import.md))

Today only tables, columns, PK/FK and indexes are imported.

- **A1 (done). Import more objects**, per engine: **views** (with their columns, and the definition in a note), **enums**, **sequences**, **triggers**, and **comments on non-table objects** (views and their columns, sequences, functions…). Decide the DBML representation first — DBML has `Enum`, `Note` and `Table` but no native view/trigger/sequence — and keep `toDbml` the single generator. Update the privilege/limits notes in [03](03-connections-import.md) and the round-trip expectations in [04](04-formats.md).
- **A2 (done). Pick specific tables inside a schema**: replace the comma-separated text filter with a table list (checkboxes, search, select all/none) fed by a new read-only "list tables" endpoint (catalog query, same guardrails as the rest) and remembered in the connection (`tables`).
- **A3. Oracle TLS** — **decision: wallets are not supported.** Oracle is reached only through a connection string with TLS (`verify`, or `noverify`, optional server DN); `verify` without wallet works against an OCI Autonomous DB (checked by hand). The `ewallet.pem` path that reads the CA field as a wallet stays in `introspect.js` but is unsupported and unverified; remove it when convenient. `noverify` and `serverDn` are still untested against a real server.

### B. Collaboration (original plan, steps 4 and 5)

- **B1. Shared database connections** (**done**; see [09](09-accounts-sharing.md): administrator-only registration, grants to people and groups, members see name/type/host/database, editors with access can refresh, audit log of 180 days). The original idea: an administrator or group owner registers a connection once (read-only credential); members use it to import and refresh without seeing the secret; clear rules for who may use it; **audit log** of who used which connection and when. Sensitive: revisit [05](05-security.md) first.
- **B2. SSO** (*future feature, not scheduled*): OIDC login for organisations; the target integration is **AWS Cognito** (OIDC), LDAP only if someone asks.
- Already delivered from the original plan: step 3 — sharing with people, groups and links with view/comment/edit, flat groups, administration ([09](09-accounts-sharing.md)).

## After that

- **Server-side scheduled refresh** — diagrams live on the server now; run refresh without an open page, keep the last snapshot and diff history. **Decision: build it after B1** (it needs B1's audit log and an explicit connection owner). Plan: one job in the server process, every minute, over the connections that are due; minimum interval 5 min with jitter; skip a diagram while someone is editing it (presence); the result is saved as a "Refresh from database" history entry (version history exists); port `keepGroups` (groups, positions, hand-written lineage) to the server; show last run / last error on the connection; the browser timer goes away; a lock row in SQLite only if the app ever runs on more than one instance.
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

## Next session: documentation follow-ups

Details in [10](10-documentation-site.md): add screenshots/GIFs (pages were proofread against the UI labels and server limits; DBML colours, release notes and a 375 px layout check are done).

## Next: ideas taken from dbdiagram's paid plan (agreed order)

1. ~~**Versions + changelog**~~ **done**: version number + 409 on conflict, history with names, compare and restore (see [09](09-accounts-sharing.md)). A newer version is noticed through presence; open: a visible per-diagram changelog in the Docs view.
2. ~~**Data lineage**~~ **done** (see [02](02-editor-diagram.md) and [03](03-connections-import.md)): `// lineage:` comment syntax, import from `pg_depend` / `ALL_DEPENDENCIES`, dashed arrows, focus, filters. Lineage also feeds Arrange and the Docs view/exports. Column mapping of views is automatic (`pgsql-ast-parser`, spec 03). Decided not to build drawing a lineage link by dragging.
3. ~~**Sticky notes**~~ **done** (DBML `Note` blocks as movable, editable notes on the canvas; see [02](02-editor-diagram.md)). Open: colours, Docs view, presence.
4. Small ones: *named views* (done), *detail levels* (done), *password on share links* (done). Embed/iframe was dropped on purpose.
5. ~~Presence~~ **done** (who has the diagram open, selection, editing, newer-version bar; spec 09). Real-time co-editing (Yjs) only if the use asks for it.
6. API tokens, CLI and an **MCP connector** (an agent user whose permissions per diagram/group are the existing grants; audit log; diagram text is untrusted input for the agent) — last step before making the repository public; review `05-security.md` first.
Not planned: data samples (they would read table data, against the catalog-only invariant).

## Done (see git history)

Since the first release notes below: table picker with groups, views/enums/sequences/triggers import (Oracle materialized views handled), packed and group-aware Arrange with five algorithms, Tables panel (search, hide, saved views), detail levels, draggable relationship labels and group boxes, resizable/collapsible tables, nearest-side relationship lines, password on share links, lighter top bar with an Export menu, English sample model, and the `/docs` documentation site.


Accounts with roles, administration (users, flat groups, settings), operator CLI, private diagrams (autosave), sharing with people/groups/links with owner-chosen permissions, multi-author comments, administrators manage every diagram, SSRF host policy, sample shop model · DBML editor + diagram · live import PG/Oracle (tables, columns, PK/FK, indexes, table/column comments) · TableGroups/colors/themes · multi-format import/export · Help tab · generated documentation (view, comments, HTML/Markdown export; shareable through links) · read-only guardrails, privilege checks, TLS (PostgreSQL verified; Oracle partly), manual/auto refresh.
