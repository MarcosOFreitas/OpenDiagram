# Specs

Living specifications for OpenDiagram. Rules:

- One topic per file, numbered by reading order. Each spec has **Status** and **Acceptance criteria** that are testable.
- Change behaviour → update the spec in the same commit. Planned work lives in [`06-roadmap.md`](06-roadmap.md) until it gets its own spec.
- Mark criteria as `[x]` only when verified (say how in [`07-testing.md`](07-testing.md)); otherwise leave `[ ]`.

| # | Spec | Status |
|---|------|--------|
| 00 | [Product](00-product.md) — vision, users, scope, non-goals | stable |
| 01 | [Architecture](01-architecture.md) — components, data flow, decisions | stable |
| 02 | [Editor & diagram](02-editor-diagram.md) | implemented |
| 03 | [Connections & live import](03-connections-import.md) — read-only, guardrails, TLS, refresh, API | implemented (Oracle TLS e2e pending) |
| 04 | [Import/export formats](04-formats.md) | implemented, known gaps |
| 05 | [Security](05-security.md) — threat model, pre-deploy checklist | **blocking for public hosting** |
| 06 | [Roadmap](06-roadmap.md) | living |
| 07 | [Testing](07-testing.md) — what is verified and how | living |

Origin: behaviour of comparable tools was studied from their public web UI with [REA](https://github.com/morluto/rea) (static bundle analysis + screenshots) to pick features; the implementation is independent and uses no third-party code or assets other than the open-source libraries listed in the README.
