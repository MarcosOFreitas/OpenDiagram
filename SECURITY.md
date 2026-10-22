# Security policy

OpenDiagram connects to databases and stores credentials and diagrams, so security reports are taken seriously.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private reporting on this repository: **Security → Report a vulnerability** (a private security advisory). If that option is not available, open an issue that only says you have a security report and asks for a private channel; do not include details.

Please include what you found, the version or commit, how to reproduce it, and the impact you expect. Reports are read on a **best-effort basis**: since 1.0 the project is feature-complete and nobody is on call, so there is no promised response or fix time. Please give us a reasonable time to fix it before you disclose it, and we will credit you in the release notes unless you prefer not to be named.

## Supported versions

A fix, when someone makes one, lands on the default branch and in the next tagged release (`ghcr.io/marcosoliveira-intelicity/opendiagram:<version>`); older releases are not patched. If a fix does not come, the code is Apache-2.0: a fork may carry it.

## What is in scope

- Authentication, sessions, roles and the permission model of diagrams, shared links and shared connections (any way to read, change or delete something the caller may not).
- Anything that makes a database session writable, reads table data, runs SQL other than catalog queries, or reaches hosts the `DB_HOST_POLICY` forbids (SSRF).
- Disclosure of secrets: saved passwords, CA certificates, `APP_SECRET`, link tokens, session cookies.
- Injection (Oracle connect descriptor, XSS in the application, the documentation site or the exported HTML/Markdown), CSRF, header and CSP weaknesses.

Out of scope: findings that need a malicious administrator (administrators can by design open, edit and delete every diagram of their instance and reset any password), missing hardening on a default local install (see below), denial of service by an authenticated user with unlimited resources, and the known gaps listed in [`.specs/05-security.md`](.specs/05-security.md).

## Running it safely

The defaults are meant for your own machine or a trusted network. Before you host it for other people:

- set a strong `APP_SECRET` and keep it (changing it makes saved connections unreadable);
- serve it over **HTTPS** and set `COOKIE_SECURE=1` (and `TRUST_PROXY=1` behind a reverse proxy);
- set `DB_HOST_POLICY=public-only` or `allowlist`, so users cannot point the server at your internal network;
- keep public sign-up closed (`ALLOW_SIGNUP=0`) unless you want it open;
- use **read-only database users** for every connection (the app warns about and can refuse credentials with write privileges), and enable TLS with certificate verification;
- remove the `demo-*` services from `docker-compose.yml` (they have well-known passwords and a published demo key);
- back up the `/data` volume.

The full threat model and the pre-deployment checklist are in [`.specs/05-security.md`](.specs/05-security.md) and in the documentation page *Self-hosting* (`/docs`).
