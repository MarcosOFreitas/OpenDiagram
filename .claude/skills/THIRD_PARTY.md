# Third-party skills

Skills in this folder that were not written for this project. All are MIT licensed; the copyright notices are kept below. Only `SKILL.md` files and the reference files they link were taken, read in full before being added. No scripts, hooks, commands or plugin manifests of those repositories are installed, and nothing here talks to the network. Each skill has a section "In this repo" at the end, written for OpenDiagram.

| Skill | Source (commit) | What was changed |
|-------|-----------------|------------------|
| `test-driven-development` (+ `writing-good-tests.md`) | [obra/superpowers](https://github.com/obra/superpowers) `bb92a7774141`, © 2025 Jesse Vincent | text as published; one reference to another skill of that repository removed; section "In this repo" added |
| `verification-before-completion` | obra/superpowers `bb92a7774141` | text as published; section "In this repo" added |
| `requesting-code-review` (+ `code-reviewer.md`) | obra/superpowers `bb92a7774141` | example path changed to `.specs/`; section "In this repo" added; the reviewer template is unchanged |
| `grill-me` | [mattpocock/skills](https://github.com/mattpocock/skills) `49dd158d1076`, © 2026 Matt Pocock (text taken from its port in [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) `19392f7a0826`, © 2025 Alireza Rezvani, without that port's scripts and wrapper) | interview rules kept; section "In this repo" added |
| `performance-optimization` | workflow after [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) `aeac41d4d005`, © 2025 Addy Osmani | rewritten and shortened for this project |

## Considered and not installed

Reviewed in the same pass and left out on purpose (duplicate of one above, tied to a stack this project does not use, or heavier than the value): `tdd-guide`, `senior-qa`, `senior-frontend`, `senior-architect`, `adversarial-reviewer`, `pr-review-expert`, `grill-with-docs` (writes its own docs folders next to `.specs/`) of claude-skills; `test-driven-development`, `interview-me`, `code-review-and-quality`, `ci-cd-and-automation`, `frontend-ui-engineering`, `constraint-driven-development` (asks to install about ten tools), `doubt-driven-development` (can send code to external CLIs) and the plugin hooks (`simplify-ignore` rewrites files in place, `sdd-cache` replays cached web pages) of agent-skills; `systematic-debugging`, `brainstorming` (ships a local server), `using-superpowers` and the `SessionStart` hook (forces skill use on every turn, against `AGENTS.md`) of superpowers. Front-end design guidance stays with `ui-ux-pro-max` and the UI standard in `AGENTS.md`; architecture and decisions stay in `.specs/`.

## Licence text (MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: the above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
