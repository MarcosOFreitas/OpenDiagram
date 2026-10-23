# 00 — Product

## Vision

Free, self-hostable database diagramming where the diagram can be **generated from a live database** (PostgreSQL, Oracle, MySQL) instead of only drawn by hand, and kept up to date. Anyone can run it with one `docker compose up`.

## Status

**1.0, feature-complete.** It is one open-source release (Apache-2.0) with no promised support: issues and pull requests are welcome and read on a best-effort basis, and forks are encouraged. What a fork may build next is in [06-roadmap](06-roadmap.md) (*Ideas for forks*), next to the known limitations.

## Users

- **Developers / DBAs** documenting an existing database: connect, pick schemas, get a diagram + DBML in seconds.
- **Architects / analysts** designing a schema in DBML and exporting SQL.
- **Teams**: an administrator creates the accounts and groups, can see and manage every diagram of the organisation, and people share diagrams and generated docs with colleagues or whole groups.
- **AI clients** (Claude Code and other MCP clients), through agent accounts that see only what people shared with them.

## In scope

*Features* in the README: the DBML editor and diagram; read-only live import from PostgreSQL, Oracle and MySQL (MariaDB best effort), refreshed by hand or on a schedule on the server; generated documentation; versions with a structural compare and "changed since you last opened it"; accounts, groups, sharing and share links; shared connections with an audit log; administration; backups; the MCP connector.

## Decisions (and why)

| Decision | Why |
|---|---|
| License **Apache-2.0** | OSI open source; permissive, which suits a project with no maintainer; it carries a patent grant. Comparable tools are AGPL-3.0 (ChartDB, drawDB) or MIT (Azimutt). |
| **No e-mail** of any kind (no SMTP) | E-mail needs new configuration, a secret and an outbound connection, and is the likeliest source of unanswered issues. A forgotten password is reset with the recovery key the person made, or by an administrator. |
| **No SSO / OIDC, no MFA** | Accounts, the recovery key and administrator resets are enough for self-hosting; SSO is an idea for forks ([06](06-roadmap.md)). |
| **No general API rate limit** in the app | Left to the reverse proxy (an example is in the *Self-hosting* docs page). Sign-ins, link passwords, recovery keys, agent tokens and the structural summary of refreshes have their own budgets. |
| **No language model inside the app** | It would be an outbound call and a stored key (security invariant 6). AI help comes from outside, through the MCP connector. |
| **Backups by CLI and `BACKUP_DIR`** only | No download route in the UI: a route that hands out the whole database is more exposure than it is worth. |
| **No public hosted instance** | It needs someone to operate it. The pre-deployment checklist of [05](05-security.md) is what a fork would start from. |

## Non-goals

- Executing arbitrary SQL, browsing or exporting **table data**, or modifying the connected database: metadata only, always read-only. Also no migration that the app runs (a generated script would be a file the person runs).
- Real-time co-editing. Presence is shown and conflicting saves are detected, but edits are not merged live. No notifications, in the app or by e-mail.
- Reproducing a commercial product pixel-for-pixel or copying its code or assets.

## Principles

1. DBML text is the source of truth.
2. Read-only and least privilege by default; warn loudly otherwise.
3. Minimal moving parts: one container, SQLite storage.
4. Honest status: what was not tested is said (the README's *Known limitations*, the *Not tested* list of the release notes).
