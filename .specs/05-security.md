# 05 — Security

**Status:** fine for your machine or a trusted network. For **public hosting** complete the open items of the checklist first (HTTPS, `DB_HOST_POLICY=public-only` + pinned DNS, e-mail verification/password reset, CI audit).

## Assets and threats

| Asset | Threat | Mitigation today | Gap |
|-------|--------|------------------|-----|
| Connected databases | Accidental/malicious writes through the app | Read-only sessions; catalog-only queries; privilege warnings; strict block option | None for writes via the app; credential itself is still powerful if leaked |
| Saved secrets (password, CA PEM, wallet password) | Disclosure from disk/API | AES-256-GCM at rest keyed by `APP_SECRET`; never returned by API; `hasCa` flag only | Key is one env var (no rotation); default dev key if unset |
| Network position of the server | **SSRF**: any user can make the server connect to any host/port (internal services, metadata endpoints) | `DB_HOST_POLICY` = `open` (default) / `public-only` / `allowlist`; 8 s connect timeout | `open` is the default (local use); DNS is resolved separately by the driver (rebinding window); no per-user egress limits |
| API | Unauthorised access to connections/diagrams | e-mail+password accounts (scrypt), roles + administrator-only admin API, sign-up closed by default, forced password change for temporary passwords, server-side sessions in HttpOnly SameSite cookies, 404 for other accounts' resources, CSRF Origin guard, login/sign-up throttling, per-person/group/link access levels, last-administrator guard | No e-mail verification, self-service reset, MFA, SSO or session list; throttling is in memory and per process; administrators can reset any password and open/edit/delete any diagram (by design; no audit log yet) |
| Share links | A leaked link grants its level to whoever has it | random 144-bit tokens, per-link level, instant downgrade/revoke, anonymous = read-only, `no-referrer`, payload excludes source/credentials | Links are bearer secrets stored in clear in SQLite; no expiry yet |
| Oracle connect descriptor | Injection via host/service/DN | whitelist validation (`SAFE`, DN quote/paren rejection) | — |
| Transport | Sniffing / MITM to the DB | TLS modes with certificate verification, custom CA | `noverify` allowed (UI warns); Oracle TCPS success path unverified |
| Browser | XSS | CSP (`default-src 'self'`, no framing), `nosniff`; React escaping; no `dangerouslySetInnerHTML`; standalone docs HTML is built with `renderToStaticMarkup` (escaped) and makes no network requests | No CSP, no auth cookies yet |
| Supply chain | Vulnerable deps | lockfiles committed | no automated audit in CI |

## Pre-deployment checklist (public / multi-user)

- [x] Authentication (accounts) and per-user ownership of connections and diagrams ([09](09-accounts-sharing.md)).
- [x] Outbound policy for DB hosts (`DB_HOST_POLICY`) — set `public-only` or `allowlist` when hosting; [ ] pin the resolved IP to close the DNS-rebinding window.
- [ ] `APP_SECRET` set from a secret manager; document rotation; consider per-record keys.
- [x] Security headers + CSP, login/sign-up throttling; [ ] HTTPS termination (reverse proxy + `COOKIE_SECURE=1` / `TRUST_PROXY=1`), [ ] general rate limiting on `/api/*`.
- [ ] Decide whether the hosted service stores database credentials at all (alternative: credentials used once, never persisted).
- [ ] Audit log for connection use; size/time limits on imports.
- [ ] E-mail verification, self-service password reset, account self-deletion, MFA/SSO, audit log (admin actions, connection use).
- [ ] Dependency scan in CI; container runs as non-root; read-only filesystem except `/data`.
- [ ] Privacy notice: only schema metadata is read; no table data leaves the database.

## Reporting

Open a private security advisory on the repository (set a contact in `SECURITY.md` when publishing).
