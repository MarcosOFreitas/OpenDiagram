# 00 — Product

## Vision

Free, self-hostable database diagramming where the diagram can be **generated from a live database** (PostgreSQL, Oracle) instead of only drawn by hand, and kept up to date. Anyone can run it with one `docker compose up`; later, a hosted instance is offered free to other users.

## Users

- **Developers / DBAs** documenting an existing database: connect, pick schemas, get a diagram + DBML in seconds.
- **Architects / analysts** designing a schema in DBML and exporting SQL.
- **Teams** (future) sharing diagrams and generated docs.

## In scope (today)

DBML editor, diagram canvas, live metadata import (PG/Oracle, read-only), refresh, SQL/DBML import, multi-format export, TLS, light/dark theme.

## In scope (next)

dbdocs-style documentation pages from DBML · accounts, saved diagrams, share links · server-side scheduled refresh · more engines (MySQL, SQL Server) · see [06-roadmap](06-roadmap.md).

## Non-goals

- Executing arbitrary SQL, browsing or exporting **table data**, or modifying the connected database — metadata only, always read-only.
- Real-time multi-user editing (not planned for v1).
- Reproducing a commercial product pixel-for-pixel or copying its code/assets.

## Principles

1. DBML text is the source of truth.
2. Read-only and least privilege by default; warn loudly otherwise.
3. Minimal moving parts: one container, JSON file storage until multi-user needs a DB.
4. Honest status: unverified features are labelled as such.
