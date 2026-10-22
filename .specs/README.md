# Specs

Living specifications for OpenDiagram. Rules:

- One topic per file, numbered by reading order. Each spec has **Status** and **Acceptance criteria** that are testable.
- Change behaviour → update the spec, the documentation page and the README in the same commit. Planned work lives in [`06-roadmap.md`](06-roadmap.md) until it gets its own spec.
- Mark criteria as `[x]` only when verified (say how in [`07-testing.md`](07-testing.md)); otherwise leave `[ ]`.

| # | Spec | Status |
|---|------|--------|
| 00 | [Product](00-product.md) — vision, users, scope, non-goals | stable |
| 01 | [Architecture](01-architecture.md) — components, data flow, decisions | stable |
| 02 | [Editor & diagram](02-editor-diagram.md) | implemented |
| 03 | [Connections & live import](03-connections-import.md) — read-only, guardrails, TLS, refresh, API | implemented (Oracle TLS: `verify`, `serverDn`, `noverify` tested; no wallets) |
| 04 | [Import/export formats](04-formats.md) | implemented, known gaps |
| 05 | [Security](05-security.md) — threat model, pre-deploy checklist | open items before public hosting |
| 06 | [Roadmap](06-roadmap.md) | living |
| 07 | [Testing](07-testing.md) — what is verified and how | living |
| 08 | [Generated documentation](08-documentation.md) — dbdocs-style view + HTML/Markdown export, comments | implemented |
| 09 | [Accounts, administration, groups & sharing](09-accounts-sharing.md) — admin + users, flat groups, sharing with people/groups/links | implemented (self-hosted) |
| 10 | [Documentation site](10-documentation-site.md) — the public `/docs` pages | implemented |
| 11 | [UI/UX review checklist](11-ui-review.md) — rules, per-screen audit, what is not covered | implemented |
| 12 | [Table selection](12-table-selection.md) — the four bugs so far, their common root cause, the rules and the missing tests | living |
| 13 | [Feature plan](13-feature-plan.md) — proposed new features and improvements, in waves, with how each would be built and proved | proposal |
| 14 | [Release v1.0](14-release-v1.md) — open-source single release: decisions, ordered plan, cut line, release checklist | agreed |
| 15 | [Audit 2026-10-22](15-audit-2026-10-22.md) — full audit (security, import, performance, interface, tests, operations), its second review and the plan for its findings | done 2026-10-22 |

Origin: features were chosen by studying the public behaviour of comparable tools; the implementation is independent and uses no third-party code or assets other than the open-source libraries listed in the README.
