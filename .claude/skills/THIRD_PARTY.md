# Third-party sources of the skills in this folder

The skills here (a subset of the maintainer's personal collection) were composed for this project: each one takes the strongest parts of several public skills and rewrites them as one lean text, with sections for this repository's rules kept in `AGENTS.md`. They contain no scripts, no hooks and no network instructions. Every composed skill ends with a `<!-- Composed from ... -->` comment naming its sources. Where text was adapted from a source, the source's licence and copyright notice are below. Where a source has no licence file, only its ideas were used and every sentence is original.

| Skill | Sources (what was taken) | Licence found |
|---|---|---|
| `test-driven-development` | obra/superpowers `test-driven-development` and `writing-good-tests` (the gates of the cycle, naming the break, no mirror assertions, mutation check); addyosmani/agent-skills `test-driven-development` (discover the stack, prove-it for bug fixes) | MIT, both |
| `verification-before-completion` | obra/superpowers `verification-before-completion` (claim / evidence table, red-green check); the user's own `verify-and-stop` (outcome vocabulary) | MIT |
| `requesting-code-review` (+ `reviewer-prompt.md`) | obra/superpowers `requesting-code-review`, `code-reviewer`, `receiving-code-review` (SHA range, read-only reviewer, "declined to judge", handling feedback); addyosmani/agent-skills `code-review-and-quality` (invert-a-condition check); ideas of vercel-labs `code-review` (certainty before flagging, exploit-path wording; reworded, no text kept) | MIT; vercel-labs not verified |
| `code-simplification` | addyosmani/agent-skills `code-simplification`; the user's `safe-refactor`; ponytail-audit (rank by lines removed) | MIT |
| `security-and-hardening` | addyosmani/agent-skills `security-and-hardening` | MIT |
| `grill-me` | Matt Pocock `grill-me` (interview rules, via alirezarezvani/claude-skills without its scripts); ideas of vltansky `grill-me`; addyosmani/agent-skills `interview-me` (explicit agreement) | MIT; vltansky not verified |
| `performance-optimization` | addyosmani/agent-skills `performance-optimization` (measure, keep-or-revert, attempt ledger) | MIT |
| `debugging-discipline` | addyosmani/agent-skills `debugging-and-error-recovery`; obra/superpowers `systematic-debugging` (stop after three failed fixes); the user's `investigate-first` and `surgical-patch` | MIT |
| `browser-verification` | addyosmani/agent-skills `browser-testing-with-devtools`; Anthropic `webapp-testing` (ideas, reworded) | MIT; Apache-2.0 |
| `ui-ux-review`, `ui-color-system`, `ui-feedback-states`, `ui-layout-typography` | original, written for the maintainer's harness from general practice (WCAG 2.2 thresholds, usability heuristics, role-based color tokens); no third-party text copied | none needed (own text) |
| `ci-cd` | addyosmani/agent-skills `ci-cd-and-automation`; alirezarezvani/claude-skills `ci-cd-pipeline-builder` (as a counter-example only) | MIT |
| `docker` | alirezarezvani/claude-skills `docker-development` (text only) | MIT |
| `api-and-interface-design` | addyosmani/agent-skills `api-and-interface-design` and `documentation-and-adrs` (one line) | MIT |
| `mcp-builder` | Anthropic `mcp-builder` (reworded) | Apache-2.0 (folder `LICENSE.txt`) |
| `oracle-postgres-sql` | original; scope ideas from alirezarezvani/claude-skills `sql-database-assistant` and `database-designer` | MIT (ideas only) |

Also vendored from before (not part of this composition): `ui-ux-pro-max` (MIT, nextlevelbuilder/ui-ux-pro-max-skill, see its `NOTICE.md`); `banner-design`, `brand`, `design`, `design-system`, `slides`, `ui-styling` were written for this project.

## Copyright notices of the MIT sources
- obra/superpowers: Copyright (c) 2025 Jesse Vincent
- addyosmani/agent-skills: Copyright (c) 2025 Addy Osmani
- alirezarezvani/claude-skills: Copyright (c) 2025 Alireza Rezvani
- mattpocock/skills: Copyright (c) 2026 Matt Pocock

Apache-2.0 sources (Anthropic `frontend-design`, `webapp-testing`, `skill-creator`, `mcp-builder`): each skill folder of anthropics/skills ships its own `LICENSE.txt`; the repository root has none.

## MIT licence text
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: the above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## What was reviewed and left out on purpose
The full record of what was evaluated, scored and rejected (with the reason for each) is kept outside this repository, in the maintainer's personal harness catalog. Nothing in this folder depends on it.
