# 06 — Roadmap

Status of what exists and what is planned. Move an item to its own numbered spec when work starts. Anyone is welcome to pick an item: open an issue first (see [`CONTRIBUTING.md`](../CONTRIBUTING.md)).

## Planned (in this order)

1. **API tokens, CLI and an MCP connector.** An agent user whose permissions per diagram and group are the existing grants; every use goes into the audit log; diagram text is untrusted input for the agent. Re-read [05](05-security.md) first: this widens the exposure of the API.
2. **Server-side scheduled refresh.** Diagrams live on the server, so a refresh can run without an open page. Plan: one job in the server process, every minute, over the connections that are due; minimum interval 5 min with jitter; skip a diagram while someone is editing it (presence); the result is saved as a "Refresh from database" history entry; port `keepGroups` (groups, positions, hand-written lineage) to the server; show last run and last error on the connection; the browser timer goes away; a lock row in SQLite only if the app ever runs on more than one instance. It needs the audit log (done) and an explicit connection owner.
3. **Account hardening.** E-mail verification and self-service password reset (optional SMTP), account deletion, session list, link expiry, sign-in events in the audit log.
4. **Public deployment of a free hosted instance.** HTTPS reverse proxy, `DB_HOST_POLICY=public-only` with pinned resolved IPs, general rate limits, dependency audit in CI, container as non-root ([05](05-security.md)).
5. **Simplicity audit with Ponytail.** A later validation round over the whole codebase with [Ponytail](https://github.com/DietrichGebert/ponytail) (`/ponytail-audit`, MIT): a ranked list of what to delete, simplify or replace with stdlib/native features. Pending: not started; run it, review each finding against the security invariants and the e2e scripts, and apply only what keeps them green.
6. **SSO** (not scheduled): OIDC login for organisations; the target integration is AWS Cognito, LDAP only if someone asks.

## Later

- Cross-dialect SQL export (type and default translation) so PG→MySQL/MSSQL and Oracle→MySQL produce valid DDL.
- Check constraints and partition details in the import; functions and procedures.
- More engines: MySQL/MariaDB, SQL Server.
- DBML custom properties; per-table color picker; column-level layout controls.
- Schema diff between two imports (history) and "drift" notifications.
- Real-time co-editing (presence and conflict detection exist). Only if usage asks for it.
- Sticky notes: colours, Markdown, notes in the Docs view and exports.
- UI: tablet width, a pass with a real screen reader and Windows high-contrast mode ([11](11-ui-review.md)).
- Documentation: more pictures when screens change ([10](10-documentation-site.md)).

## Not planned

- Executing arbitrary SQL, browsing table data or sample data (against the catalog-only invariant).
- Embedding diagrams in an iframe.
- Drawing a lineage link by dragging (lineage is imported or written as `// lineage:` comments).

## Done

- **Diagrams and editor**: DBML editor (highlighting, autocomplete, diagnostics, color swatches, find/replace), diagram with five Arrange algorithms (group-aware), TableGroups and colors, Tables panel with hide and saved views, detail levels, draggable relationship labels and group boxes, resizable and collapsible tables, sticky notes, light/dark theme, English sample model.
- **Live import** from PostgreSQL and Oracle: tables, columns, PK/FK, indexes, comments, views and materialized views, enums, sequences, triggers; table picker; read-only sessions and privilege guardrails; TLS (PostgreSQL verified; Oracle `verify`, `serverDn`, `noverify` tested against a TLS proxy and `verify` against an OCI Autonomous DB, no wallets); manual and in-browser automatic refresh.
- **Data lineage**: `// lineage:` comments, import from `pg_depend` / `ALL_DEPENDENCIES`, column-level lineage of views read from their SQL, dashed arrows, focus and filters; it also feeds Arrange and the Docs view.
- **Formats**: multi-format SQL/DBML import, DBML/SQL/JSON/PNG/SVG export.
- **Generated documentation**: Docs view with comments and a changelog, standalone HTML/Markdown export, shareable through links; public documentation site at `/docs`.
- **Accounts and collaboration**: e-mail + password accounts with roles, administration (users, flat groups, settings), operator CLI, private diagrams with autosave, sharing with people/groups/links (optional link password), multi-author comments, versions with conflict detection and history (names, compare, restore), presence, administrators manage every diagram, SSRF host policy.
- **Shared database connections**: registered by an administrator, granted to people and groups, used without exposing the credential, with an audit log (180 days).
- **UI quality**: shared control look, motion, dark theme and phone layout, accessibility, audited screen by screen with `web/uiaudit.mjs` ([11](11-ui-review.md)).
