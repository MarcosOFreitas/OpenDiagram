# 06 — Roadmap

Ordered by recommended sequence. Move an item to its own numbered spec when work starts.

## Next

1. **Group-owned database connections** — an administrator/group owner registers a connection once (read-only credential); members use it to import/refresh without ever seeing the secret; audit log of who used what. ([09](09-accounts-sharing.md))
2. **Server-side scheduled refresh** — diagrams now live on the server ([09](09-accounts-sharing.md)); run refresh without an open page, keep the last snapshot and diff history.
3. **Account hardening** — SSO (OIDC/LDAP), e-mail verification and self-service reset (optional SMTP), account deletion, session list, link expiry, audit log.
4. **Public deployment** — HTTPS reverse proxy, `DB_HOST_POLICY=public-only` with pinned IPs, general rate limits, CI audit, free hosted instance ([05](05-security.md)).

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

Shared documentation (a share link opens the Docs view; standalone HTML/Markdown export) · Accounts with roles, administration (users, flat groups, settings), operator CLI, private diagrams (autosave), sharing with people/groups/links with owner-chosen permissions, multi-author comments, SSRF host policy · DBML editor + diagram · live import PG/Oracle · TableGroups/colors/themes · multi-format import/export · Help tab · generated documentation (view + HTML/Markdown export) · read-only guardrails, privilege checks, TLS, manual/auto refresh.
