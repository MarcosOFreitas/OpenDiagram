# 06 — Roadmap

Status of what exists and what is planned. Move an item to its own numbered spec when work starts. Anyone is welcome to pick an item: open an issue first (see [`CONTRIBUTING.md`](../CONTRIBUTING.md)).

## Planned (in this order)

1. **API tokens, CLI and an MCP connector.** An agent user whose permissions per diagram and group are the existing grants; every use goes into the audit log; diagram text is untrusted input for the agent. Re-read [05](05-security.md) first: this widens the exposure of the API.
2. ~~**Server-side scheduled refresh.**~~ Done (see [03](03-connections-import.md)); the original plan: Diagrams live on the server, so a refresh can run without an open page. Plan: one job in the server process, every minute, over the connections that are due; minimum interval 5 min with jitter; skip a diagram while someone is editing it (presence); the result is saved as a "Refresh from database" history entry; port `keepGroups` (groups, positions, hand-written lineage) to the server; show last run and last error on the connection; the browser timer goes away; a lock row in SQLite only if the app ever runs on more than one instance. It needs the audit log (done) and an explicit connection owner.
3. **Account hardening.** E-mail verification and self-service password reset (optional SMTP), account deletion, session list, link expiry, sign-in events in the audit log.
4. **Public deployment of a free hosted instance.** HTTPS reverse proxy, `DB_HOST_POLICY=public-only` with pinned resolved IPs, general rate limits, dependency audit (Dependabot alerts and security updates are on; add `npm audit` to CI if wanted), container as non-root ([05](05-security.md)).
5. **Simplicity audit with Ponytail.** A later validation round over the whole codebase with [Ponytail](https://github.com/DietrichGebert/ponytail) (`/ponytail-audit`, MIT): a ranked list of what to delete, simplify or replace with stdlib/native features. Pending: not started; run it, review each finding against the security invariants and the e2e scripts, and apply only what keeps them green.
6. **SSO** (not scheduled): OIDC login for organisations; the target integration is AWS Cognito, LDAP only if someone asks.

## Pending checks

- **Oracle with a real private CA.** `verify`, `serverDn` and `noverify` are tested against a TLS proxy (`server/test-oracle-tls.mjs`) and `verify` against OCI; a real server whose certificate comes from a private CA (trusted through `NODE_EXTRA_CA_CERTS`) was never tried.
- **Picture of a member's view of a shared connection** (name/type/host/database, read-only form) for the documentation pages `shared-connections` and `database-security` ([10](10-documentation-site.md)); add it to `docshots.mjs` with the same change.

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

See *Features* in the [README](../README.md) and the [release notes](../web/src/docsite/pages/release-notes.md). Not repeated here so that it cannot drift.
