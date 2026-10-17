# 06 — Roadmap

Status of what exists and what is planned. Move an item to its own numbered spec when work starts. Anyone is welcome to pick an item: open an issue first (see [`CONTRIBUTING.md`](../CONTRIBUTING.md)).

## Planned (in this order)

1. ~~**API tokens, CLI and an MCP connector.**~~ The MCP connector is done (see [09](09-accounts-sharing.md)); a CLI and general API tokens are not planned for now. The original plan: an agent user whose permissions per diagram and group are the existing grants; every use goes into the audit log; diagram text is untrusted input for the agent. Re-read [05](05-security.md) first: this widens the exposure of the API.
2. ~~**Server-side scheduled refresh.**~~ Done (see [03](03-connections-import.md)); the original plan: Diagrams live on the server, so a refresh can run without an open page. Plan: one job in the server process, every minute, over the connections that are due; minimum interval 5 min with jitter; skip a diagram while someone is editing it (presence); the result is saved as a "Refresh from database" history entry; port `keepGroups` (groups, positions, hand-written lineage) to the server; show last run and last error on the connection; the browser timer goes away; a lock row in SQLite only if the app ever runs on more than one instance. It needs the audit log (done) and an explicit connection owner.
3. ~~**Account hardening.**~~ Done without e-mail (see [09](09-accounts-sharing.md)): sessions, session policy, link expiry, account self-closing with a 7-day grace, sign-in events in their own audit tab. Self-service "forgot password" without SMTP is a recovery key the person keeps.
4. **Public deployment of a free hosted instance.** HTTPS reverse proxy, `DB_HOST_POLICY=public-only` with pinned resolved IPs, general rate limits, dependency audit (Dependabot alerts and security updates are on; add `npm audit` to CI if wanted), container as non-root ([05](05-security.md)).
5. **Simplicity audit with Ponytail.** A later validation round over the whole codebase with [Ponytail](https://github.com/DietrichGebert/ponytail) (`/ponytail-audit`, MIT): a ranked list of what to delete, simplify or replace with stdlib/native features. Pending: not started; run it, review each finding against the security invariants and the e2e scripts, and apply only what keeps them green.
6. **SSO** (not scheduled): OIDC login for organisations; the target integration is AWS Cognito, LDAP only if someone asks. The same OAuth work lets the **custom connectors of claude.ai on the web** reach the MCP server (they need OAuth and a public HTTPS address); today only clients that send a bearer token header (Claude Code, Claude Desktop through a bridge, the MCP Inspector) can.

## Pending checks

- **Oracle with a real private CA.** `verify`, `serverDn` and `noverify` are tested against a TLS proxy (`server/test-oracle-tls.mjs`) and `verify` against OCI; a real server whose certificate comes from a private CA (trusted through `NODE_EXTRA_CA_CERTS`) was never tried.
- **Picture of a member's view of a shared connection** (name/type/host/database, read-only form) for the documentation pages `shared-connections` and `database-security` ([10](10-documentation-site.md)); add it to `docshots.mjs` with the same change.

A proposal for what comes next, in waves and with how each item would be built, is in [13-feature-plan.md](13-feature-plan.md); agreed items move here.

## Follow-ups (recorded 2026-10-17, after the harness / audit round)

Nothing here blocks a release; take them in this order of value for the effort.

1. **Do the version bumps allow new optimizations, DBML first.** `@dbml/core` went 3.14.1 -> 10.3.1 (web in #14, server in #11), `oracledb` 6.10 -> 26, Vite 7, Vitest 5, `actions/*` 7. Read the changelogs and measure, do not assume:
   - **`@dbml/core` 10.x**: re-test the two Gotchas in `AGENTS.md` (`importer.import(sql, 'oracle')` returns empty; `json` import does not round-trip its own export) and the `roundtrip.mjs` FAILs (MySQL, MSSQL, JSON): if the library now handles them, import options and exports can grow (and the Gotcha lines go). Look for a faster or incremental parse (the diagram re-parses the whole editor text on every change; time it with `web/benchclient.mjs` before and after), a smaller bundle (Vite warns about a chunk over 500 kB: check what the DBML parser adds, and whether it can load lazily or tree-shake), new DBML syntax (custom properties, check constraints, partitions, which the "Later" list wants), better parse errors with positions for the editor, and a shared parse result so `server/src/merge.js` and the web agree on what is valid.
   - **`oracledb` 26**: thin-mode pooling and pipelining for the scheduled refresh (`refresh.js` opens one connection per run today); check TLS options that could replace `NODE_EXTRA_CA_CERTS` (a per-connection CA would close the "Oracle with a real private CA" check below).
   - **Vite 7 / Vitest 5 / React**: build time and the pre-commit hook (the web suite is ~6 s), `manualChunks` for the large chunk, whether React 19 (PR #13, closed) is now worth a try.
   - Record the numbers in `.specs/07-testing.md` or the hosting page, and add the change as its own commit with a test.
2. **Finish the UI/UX review round.** `ui-ux-review` of the Library fixed findings 1, 2 and 4. Open: search or sort once there are many diagrams, secondary text at 10.8 px (use the secondary-text token), a 2-line clamp for very long titles, `window.confirm` for delete (undo or the project's dialog). Then review the other screens one by one (Database drawer, History, Docs view, Tables panel, Administration). Rerun `node web/docshots.mjs` and `node web/visualsnap.mjs` for the screens that changed (Library, Tables panel, saved connections); add a very long title to the `uiaudit.mjs` fixtures so overflow in a card is caught.
3. **MCP connector** (audit 04): enforce the tool `inputSchema` (M3), keep `e.message` out of the audit row (M4), tool annotations (M5), pagination of `list_diagrams` (M6), a default expiry for agent tokens (M7; today "never expires" is the default in `agents.js` and `AdminAgents.jsx`).
4. **API** (audit 03, optional ones left): validate `POST /api/connections` (type, name, host, port) and `schemas` as an array in `/api/tables` and `/api/import`; a stale `baseVersion` with identical content should not be a 409 (lost response); mask share tokens in request logs.
5. **Docker** (audit 06): `npm ci` from lockfiles, `USER node`, demo ports bound to 127.0.0.1, `HEALTHCHECK` and a restart policy; regenerate the demo certificate with `CA:FALSE`.
6. **CI** (audit 05): alert when `main` is red, pin actions by SHA, `npm audit` step, and the required-check trap when the repository goes public (the ruleset is not enforced while it is private; enable Private vulnerability reporting then). Doc drift: `07-testing.md` says "two jobs" (there are three), `AGENTS.md` says "~20 min" for e2e (it is ~11 min in 4 shards).
7. **Observability** (audit 11): scheduled-refresh failures in the log, `/api/health` doing `select 1`, a request id per request.
8. **Audits not run yet** (one at a time, no sub-agents): security (01), SQL (02), performance (07), simplicity (08), tests (09), review of the last commits (10), UI/UX of every screen (12). The skills are in `.claude/skills`; `AGENTS.md` says how each applies here.

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
