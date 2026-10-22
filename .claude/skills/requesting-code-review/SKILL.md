---
name: requesting-code-review
description: Use after finishing a feature or a risky fix, before merging, or when stuck and a fresh pair of eyes helps. Dispatches a reviewer subagent with the diff, the requirements and the project's rules, and tells you how to act on what comes back.
---

# Requesting and handling a code review

A reviewer that starts with a clean context sees what you stopped seeing. Give it exactly what it needs and nothing of your session.

## Request

1. Get the range: `BASE=$(git merge-base origin/main HEAD)` (or the commit before your work), `HEAD=$(git rev-parse HEAD)`. Uncommitted work: review `git diff` and `git diff --cached`.
2. Make sure the checks of `verification-before-completion` are green first; reviewing red code wastes the review.
3. Dispatch a `general-purpose` subagent with the prompt in [reviewer-prompt.md](reviewer-prompt.md), filling: what was built, the requirements or spec (a file path is best), the range, and **the project's rules**: tell it to read `AGENTS.md` / `CLAUDE.md` / `CONVENTIONS.md` and to treat the invariants written there (security, data, UI standard, test rules) as review criteria. A change that weakens one is Critical.
4. The reviewer is read-only and does not spawn reviewers of its own.

## What a good review contains

The full criteria are in [reviewer-prompt.md](reviewer-prompt.md); the points that decide its quality:

- **Read the tests first**: they say what the author believes the change does. Judge only changed code, but read each changed file whole. Very large diffs are a finding by themselves: ask for a split, or review in passes and say so.
- **A bug needs the situation that triggers it**; when unsure the reviewer says so instead of flagging. **A security finding says who controls the input, which control is missing, and what it costs.**
- **Declined to judge:** what the reviewer set aside as out of scope, one line each, so nothing disappears silently.
- Severity is honest, not inflated: **Critical** (bug, security hole, data loss, broken contract), **Important** (design problem, missing behavior, weak error handling, test gap), **Minor** (style, polish; one line each: `path:line: problem. fix.`). Findings are ordered by leverage, with `path:line`, why it matters and how to fix. Tone: matter-of-fact, no flattery, no padding to reach a quota. A verdict is required: ready to merge — yes / no / with fixes.

## Handle the feedback

1. **Read all of it before acting.** Clarify anything unclear first; items can depend on each other.
2. **Verify each finding against the code** before changing anything. A reviewer can be wrong or lack context.
3. Fix Critical now, Important before moving on, note Minor. Test each fix.
4. **Push back with evidence** (code, a test, a spec line) when a finding is wrong. Do not argue valid feedback; do not agree performatively ("You're absolutely right!"): act or answer.
5. "Implement it properly" suggestions get a YAGNI check: is the feature used? If nothing needs it, say so instead of building it.
6. Re-run the checks after the fixes, then report what was changed and what was declined and why.

## Never

Skip review because "it's simple". Ignore Critical items. Proceed with unfixed Important ones. Review code you did not read.

<!-- Composed for this project from: obra/superpowers requesting-code-review, code-reviewer template and receiving-code-review (MIT, Jesse Vincent: SHA range, read-only reviewer, "Declined to judge", handling feedback); addyosmani/agent-skills code-review-and-quality (MIT, Addy Osmani: invert-a-condition check, change size); the ideas of the code-review skill of vercel-labs (certainty before flagging, exploit-path wording, no flattery: license not verified, reworded, no text kept); the one-line Minor format is the author's own. See THIRD_PARTY.md. -->
