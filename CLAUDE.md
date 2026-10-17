@AGENTS.md

# Claude Code notes

- [`AGENTS.md`](AGENTS.md) is the shared guide for every coding agent and is imported above; keep project rules there, not here.
- The optional UI/UX review skill lives in `.claude/skills/ui-ux-pro-max` (MIT, from <https://github.com/nextlevelbuilder/ui-ux-pro-max-skill>; see its `NOTICE.md`). Use it when changing or reviewing UI, together with the UI standard in `AGENTS.md`.
- The development skills in `.claude/skills` (`test-driven-development`, `verification-before-completion`, `requesting-code-review`, `grill-me`, `debugging-discipline`, `oracle-postgres-sql` and the others listed in the "Agent skills" section of `AGENTS.md`) are generic; this repository's own rules and how each skill applies here are in that section. Sources and licences: `.claude/skills/THIRD_PARTY.md`.
- The other skills in `.claude/skills` (`banner-design`, `brand`, `design`, `design-system`, `slides`, `ui-styling`) were created for this project and are project-owned; they are optional helpers, nothing in the application depends on them.
- Front-end work: `ui-ux-review` (audit a screen), `ui-color-system`, `ui-feedback-states` and `ui-layout-typography` (the concepts) sit in `.claude/skills`; how they combine with the UI standard is in `AGENTS.md` ("Agent skills"). They are original texts, listed in `.claude/skills/THIRD_PARTY.md`.
- Test flow: unit tests first (`server/test/http.test.js` for routes, Vitest for components), then `uiaudit.mjs` / `behaviorcheck.mjs` / e2e scripts on a throw-away instance; the audit now also catches keyboard-unreachable controls. Details: [`.specs/07-testing.md`](.specs/07-testing.md).
- Planned work and its order: [`.specs/06-roadmap.md`](.specs/06-roadmap.md). Machine- or session-specific state (local Docker volumes, test accounts, browser storage) is never shared through git.
