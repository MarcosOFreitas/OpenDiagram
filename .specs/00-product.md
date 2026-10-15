# 00 — Product

## Vision

Free, self-hostable database diagramming where the diagram can be **generated from a live database** (PostgreSQL, Oracle) instead of only drawn by hand, and kept up to date. Anyone can run it with one `docker compose up`. A hosted instance for other people is a possible future option.

## Users

- **Developers / DBAs** documenting an existing database: connect, pick schemas, get a diagram + DBML in seconds.
- **Architects / analysts** designing a schema in DBML and exporting SQL.
- **Teams**: an administrator creates the accounts and groups, can see and manage every diagram of the organisation, and people share diagrams and generated docs with colleagues or whole groups.

## In scope (today)

Everything under *Done* in [06-roadmap](06-roadmap.md) and *Features* in the README: the DBML editor and diagram, read-only live import from PostgreSQL and Oracle, generated documentation, versions, accounts, groups, sharing, shared connections with an audit log, and administration.

## In scope (next)

server-side scheduled refresh · API tokens, CLI and an MCP connector · SSO · more engines (MySQL, SQL Server) · see [06-roadmap](06-roadmap.md).

## Non-goals

- Executing arbitrary SQL, browsing or exporting **table data**, or modifying the connected database — metadata only, always read-only.
- Real-time co-editing. Presence is shown and conflicting saves are detected, but edits are not merged live.
- Reproducing a commercial product pixel-for-pixel or copying its code/assets.

## Principles

1. DBML text is the source of truth.
2. Read-only and least privilege by default; warn loudly otherwise.
3. Minimal moving parts: one container, SQLite storage.
4. Honest status: unverified features are labelled as such.
