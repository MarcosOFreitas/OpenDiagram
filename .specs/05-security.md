# 05 — Security

**Status:** fine for your machine or a trusted network. For **public hosting** complete the open items of the checklist first (HTTPS, `DB_HOST_POLICY=public-only` + pinned DNS, e-mail verification/password reset, CI audit).

## Assets and threats

| Asset | Threat | Mitigation today | Gap |
|-------|--------|------------------|-----|
| Connected databases | Accidental/malicious writes through the app | Read-only sessions; catalog-only queries; privilege warnings; strict block option. MySQL/MariaDB (planned, item 7 of [14](14-release-v1.md)): `SET SESSION TRANSACTION READ ONLY` + `START TRANSACTION READ ONLY` ... `ROLLBACK`, `max_execution_time` 30 s, `connectTimeout` 8 s, only `information_schema` and `SHOW`; privilege check by an **allowlist** (`USAGE`, `SELECT`, `SHOW VIEW`, `SHOW DATABASES`; anything else, `EXECUTE` included, on the global scope, a selected database or its tables, through active roles too, is a warning) | None for writes via the app; credential itself is still powerful if leaked. MySQL `TEMPORARY` tables stay writable in a read-only transaction (the app never sends user SQL) |
| Saved secrets (password, CA PEM) | Disclosure from disk/API | AES-256-GCM at rest keyed by `APP_SECRET`; never returned by API; `hasCa` flag only | Key is one env var (no rotation); default dev key if unset |
| Network position of the server | **SSRF**: any user can make the server connect to any host/port (internal services, metadata endpoints) | `DB_HOST_POLICY` = `open` (default) / `public-only` / `allowlist`; 8 s connect timeout | `open` is the default (local use); DNS is resolved separately by the driver (rebinding window); no per-user egress limits |
| API | Unauthorised access to connections/diagrams | e-mail+password accounts (scrypt), roles + administrator-only admin API, sign-up closed by default, forced password change for temporary passwords, server-side sessions in HttpOnly SameSite cookies, 404 for other accounts' resources, CSRF Origin guard (the `Origin` host must equal the request host; with `TRUST_PROXY=1` that host comes from `X-Forwarded-Host`, so a proxy that rewrites `Host` still works; `server/test/proxy.test.js`), login/sign-up throttling, per-person/group/link access levels, last-administrator guard | No e-mail verification, self-service reset, MFA, SSO or session list; throttling is in memory and per process; administrators can reset any password and open/edit/delete any diagram (by design); the audit log records administrator API actions and the use of shared connections, not diagram access or sign-ins |
| Share links | A leaked link grants its level to whoever has it | random 144-bit tokens, per-link level, instant downgrade/revoke, anonymous = read-only, `no-referrer`, payload excludes source/credentials | Links are bearer secrets stored in clear in SQLite; no expiry yet; password-protected links are throttled (10 attempts per 15 min per IP and link) |
| Oracle connect descriptor | Injection via host/service/DN | whitelist validation (`SAFE`, DN quote/paren rejection) | — |
| Transport | Sniffing / MITM to the DB | TLS modes with certificate verification, custom CA | `noverify` allowed (UI warns); Oracle TCPS: `verify`, `serverDn` and `noverify` tested against a TLS proxy and `verify` against OCI; no wallets. MySQL: `off`, `noverify` and a failing `verify` (name mismatch) tested against the server's auto-generated certificate; a `verify` that succeeds with a private CA is not tested |
| Browser | XSS | CSP (`default-src 'self'`, no framing), `nosniff`; React escaping; no `dangerouslySetInnerHTML`; standalone docs HTML is built with `renderToStaticMarkup` (escaped) and makes no network requests | CSP still allows inline styles; no HSTS (set it at the reverse proxy) |
| Rogue database server | A user points the app at a server they control (any host the policy allows) and answers with crafted protocol data | Catalog queries only, results never executed. MySQL (`mysql2`): `disableEval: true` (rows are parsed by its static parser, not by JavaScript generated from the column metadata the server sends, the path of earlier code-injection CVEs); `LOAD DATA LOCAL INFILE` impossible (no `infileStreamFactory`, and the `LOCAL_FILES` capability is not announced: `flags: ['-LOCAL_FILES']`); `multipleStatements` stays off | A server may still ask for a weaker authentication method (for example cleartext) and receive the password the user typed for that very server; with TLS `off` it crosses the network in clear |
| Supply chain | Vulnerable deps | lockfiles committed; `npm audit --audit-level=high` in CI; actions pinned by SHA. MySQL adds `mysql2` (MIT, 7 dependencies, reviewed 2026-10-22) | automated audit of advisories only, no review of new releases |

## Pre-deployment checklist (public / multi-user)

- [x] Authentication (accounts) and per-user ownership of connections and diagrams ([09](09-accounts-sharing.md)).
- [x] Outbound policy for DB hosts (`DB_HOST_POLICY`) — set `public-only` or `allowlist` when hosting; [ ] pin the resolved IP to close the DNS-rebinding window.
- [ ] `APP_SECRET` set from a secret manager; document rotation; consider per-record keys. (Done in part: an empty key warns, and the server refuses to start without one with `COOKIE_SECURE=1`, `DB_HOST_POLICY` other than `open` or `REQUIRE_APP_SECRET=1`.)
- [x] The default compose file does not make the app trust the public demo certificate (`docker-compose.demo-tls.yml`, opt-in, tests only).
- [x] Security headers + CSP, login/sign-up throttling; [ ] HTTPS termination (reverse proxy + `COOKIE_SECURE=1` / `TRUST_PROXY=1`), [ ] general rate limiting on `/api/*`.
- [ ] Decide whether the hosted service stores database credentials at all (alternative: credentials used once, never persisted).
- [x] Audit log for the use of shared connections and administrator actions ([09](09-accounts-sharing.md)); [ ] size/time limits on imports; [x] sign-in events in the log.
- [x] Sessions list and revocation, session length and inactivity limit, link expiry, account self-closing (7-day grace), persistent failed-attempt limiter, sign-in events in the audit log.
- [x] Self-service password recovery without e-mail: a recovery key the person keeps (hash only, single use, rate-limited, audited).
- [x] MCP connector for AI clients ([09](09-accounts-sharing.md)): separate agent accounts created by administrators, bearer tokens (hash only, shown once, expiry, revocation) valid only on `/mcp`, access only through the usual grants, no connection or credential ever returned, text marked as untrusted, every call audited, per-token rate limit, Origin check.
- [x] Password hashing cost: scrypt with Node's default (N = 16384, r = 8, p = 1), below the OWASP minimum (N = 2^17). **Accepted** (audit [15](15-audit-2026-10-22.md), S4): N = 2^17 needs 128 MiB per hash, so four sign-ins at once would fill the 512 MB container measured in item 3b of [14](14-release-v1.md), and the stored `scrypt$salt$key` has no cost field (a change needs a versioned format and rehash on sign-in). Sign-in budgets (per address, per account) limit guessing instead.
- [ ] MFA/SSO. Not planned: e-mail verification and e-mail password reset (no SMTP).
- [x] Dependency scan in CI (`npm audit --audit-level=high` for server and web in `ci.yml`, item 6 of [14](14-release-v1.md)); [x] container runs as non-root (user `node`, 2026-10-21); [x] read-only filesystem except `/data` and a small `/tmp` (`docker-compose.yml`).
- [ ] Privacy notice: only schema metadata is read; no table data leaves the database.

## Reporting

See [`SECURITY.md`](../SECURITY.md): private reporting, scope and how to run it safely.
