# 05 — Security

**Status:** safe for **local/single-user** use. **Not safe to host publicly yet** — see checklist.

## Assets and threats

| Asset | Threat | Mitigation today | Gap |
|-------|--------|------------------|-----|
| Connected databases | Accidental/malicious writes through the app | Read-only sessions; catalog-only queries; privilege warnings; strict block option | None for writes via the app; credential itself is still powerful if leaked |
| Saved secrets (password, CA PEM, wallet password) | Disclosure from disk/API | AES-256-GCM at rest keyed by `APP_SECRET`; never returned by API; `hasCa` flag only | Key is one env var (no rotation); default dev key if unset |
| Network position of the server | **SSRF**: any user can make the server connect to any host/port (internal services, metadata endpoints) | none | **No host allowlist / egress control** |
| API | Anyone reaching the port can list/edit/delete connections and use their saved credentials | none | **No authentication/authorization** |
| Oracle connect descriptor | Injection via host/service/DN | whitelist validation (`SAFE`, DN quote/paren rejection) | — |
| Transport | Sniffing / MITM to the DB | TLS modes with certificate verification, custom CA | `noverify` allowed (UI warns); Oracle TCPS success path unverified |
| Browser | XSS stealing localStorage (DBML, source link) | React escaping; no `dangerouslySetInnerHTML`; standalone docs HTML is built with `renderToStaticMarkup` (escaped) and makes no network requests | No CSP, no auth cookies yet |
| Supply chain | Vulnerable deps | lockfiles committed | no automated audit in CI |

## Pre-deployment checklist (public / multi-user)

- [ ] Authentication (accounts) and per-user ownership of connections and diagrams.
- [ ] Outbound allowlist or denylist for DB hosts (block RFC1918/link-local/loopback unless explicitly enabled per deployment); connect timeouts already 8 s.
- [ ] `APP_SECRET` set from a secret manager; document rotation; consider per-record keys.
- [ ] HTTPS termination, security headers, CSP, rate limiting on `/api/*`.
- [ ] Decide whether the hosted service stores database credentials at all (alternative: credentials used once, never persisted).
- [ ] Audit log for connection use; size/time limits on imports.
- [ ] Dependency scan in CI; container runs as non-root; read-only filesystem except `/data`.
- [ ] Privacy notice: only schema metadata is read; no table data leaves the database.

## Reporting

Open a private security advisory on the repository (set a contact in `SECURITY.md` when publishing).
