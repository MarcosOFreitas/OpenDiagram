# History

How OpenDiagram went from its first commit to its single release, 1.0. It explains why the repository looks the way it does; the decisions themselves, with their reasons, are in `.specs/00-product.md` and `.specs/01-architecture.md`, and `git log` has every step.

## In short

Built by Marcos Oliveira with Claude Code over ten days in October 2026 (about 250 commits): a DBML editor with a live import of database structure, grown into a multi-user, self-hosted tool, then hardened, measured, audited and released once as open source, feature-complete, with no promise of support.

## Timeline

**2026-10-13: the first version.** A DBML editor with a live diagram, and a read-only import of the structure of PostgreSQL and Oracle databases into DBML. The generated documentation (the Docs view) came the same day.

**2026-10-14: a tool for teams.**
- Accounts, roles and groups, sharing with people, groups and links (with optional passwords), and an outbound host policy against SSRF.
- The table picker, and the import of views, enums, sequences and triggers.
- Arrange algorithms, the Tables panel and named views; versions with edit-conflict detection and history.
- Data lineage of views, read from their SQL; sticky notes; presence.
- Shared database connections with an audit log.
- The documentation site at `/docs`, and a shared foundation of controls and motion.

**2026-10-15: the interface audit.** `tools/uiaudit.mjs` was written and every screen was brought to zero findings (contrast, names, focus, targets, both themes, phone width). The documentation was proofread against the interface and the server.

**2026-10-16: running without a page open.**
- The scheduled refresh moved to the server.
- Accounts got sessions, a sign-in log, link expiry, account closing and a recovery key instead of e-mail.
- The MCP connector let AI clients read, comment on and edit shared diagrams through agent accounts.
- The *Hosting requirements* page was written from measurements.

**2026-10-17 to 2026-10-21: deciding the end.** A feature plan in waves was written, and then a release plan: **one** release, v1.0, that a team could install and understand without the author. The license, MIT at first and PolyForm Noncommercial since 2026-10-16, became **Apache-2.0** for the release. That week also brought:
- a hardened image (non-root, health check, amd64 and arm64 published on tags) and a production compose file with the demo databases apart;
- backup and restore commands, compressed and cached assets, and the Library's search.

**2026-10-22: the release candidate.**
- **New:** MySQL live import, check constraints and partitioning, a structural diff in *History → Compare*, and drift (a refresh says what changed, and the Library marks what changed since you last opened a diagram).
- **Audits:**
  - a full audit of security, import quality, performance, interface, tests and operations was done and acted on;
  - performance work fixed a render loop, cut the first download from 1.6 MB to 0.4 MB, and stopped the server from loading a 300 MB parser;
  - before the tag, four independent read-only reviews ran: code and security, documentation against behaviour, a newcomer setting it up, and open items. They found and fixed a way around the login checks through a percent-encoded `/api` path, a database host that could stop the server by hanging up, IPv6 spellings that slipped past the host policy, and a long tail of stale documentation.
- **Handover:**
  - every open item was either done and proved, or written down as a known limitation;
  - the development scripts moved to `tools/`, and these developer pages were written;
  - the planning and audit documents were condensed into the specs and removed.

## How it was built

- **Decide, then test first.** Larger items started with a structured interview of the plan (its decisions recorded in the specs), then failing tests, then the code. Every bug fix has a test that failed on the old code.
- **Prove, do not claim.** Unit tests on every commit; the end-to-end scripts, the interface audit and the behaviour fingerprint once a day; independent review after each feature. What could not be tested was written down (*Not tested* in the release notes).
- **Measure before optimizing.** Every performance change was measured before and after, and a change without a measured gain was not kept (the measurements are in `.specs/01-architecture.md` and on the *Hosting requirements* page).
- **Small and boring.** No new layer, library or configuration for a need that did not exist yet; one container and one SQLite file.

## What was cut, and why

SSO, e-mail of any kind, a public hosted instance, real-time co-editing, notifications, SQL Server live import and a language model inside the app were all left out on purpose. Each needs ongoing operation, a new outbound connection or a stored secret, and nobody will maintain it. Three planned extras did not fit the time: a drift webhook, a migration script generated from the structural diff, and PII tags on columns. They are described, with their constraints, under *Ideas for forks* in `.specs/06-roadmap.md`.
