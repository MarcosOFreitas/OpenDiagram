@AGENTS.md

# Claude Code notes

- [`AGENTS.md`](AGENTS.md) is the shared guide for every coding agent and is imported above; keep project rules there, not here.
- The optional UI/UX review skill lives in `.claude/skills/ui-ux-pro-max` (MIT, from <https://github.com/nextlevelbuilder/ui-ux-pro-max-skill>; see its `NOTICE.md`). Use it when changing or reviewing UI, together with the UI standard in `AGENTS.md`.
- The development harness skills (`grill-me`, `test-driven-development`, `performance-optimization`, `verification-before-completion`, `requesting-code-review`) and when to use each are in the "Agent skills" section of `AGENTS.md`; their sources are in `.claude/skills/THIRD_PARTY.md`.
- The other skills in `.claude/skills` (`banner-design`, `brand`, `design`, `design-system`, `slides`, `ui-styling`) were created for this project and are project-owned; they are optional helpers, nothing in the application depends on them.
- Planned work and its order: [`.specs/06-roadmap.md`](.specs/06-roadmap.md). Machine- or session-specific state (local Docker volumes, test accounts, browser storage) is never shared through git.
