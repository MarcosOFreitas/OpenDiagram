---
name: code-simplification
description: Use when code works but is harder to read, maintain or extend than it should be, when a review flags complexity, or when consolidating duplication. Simplify without changing behavior, one verified step at a time.
---

# Code simplification

Make code easier to understand while keeping its behavior exactly. The goal is not fewer lines but faster comprehension: would someone new understand the result faster than the original?

**Not now:** the code is already clear; you do not yet understand what it does; the "simpler" version would be measurably slower on a hot path; the module is about to be rewritten.

## Principles

1. **Preserve behavior exactly.** Same output for every input, same errors, same side effects, same order, same public interface, same compatibility. If you cannot show a change preserves it, do not make it. Establish the proof **before the first edit** (the tests, a golden output or a snapshot, run once to see it green) and run the same proof after every step. A test that must change to stay green is a warning that behavior changed; it is legitimate only when the test pinned a renamed internal, and then say so.
2. **Follow the project's conventions** (read `AGENTS.md` / `CLAUDE.md`, copy how neighbouring code solves the same thing). Matching the codebase is simplification; imposing your taste is churn.
3. **Clarity over cleverness.** Explicit beats compact when the compact form needs a pause to parse (nested ternaries, chained reduces, boolean flag parameters).
4. **Stay balanced.** Do not inline a helper that names a concept, merge unrelated logic, strip an abstraction that exists for testing or extension, or chase line count. Add no new dependency, layer or configuration.
5. **Scope to what changed.** Simplify code you are already touching; no drive-by refactors elsewhere unless asked.

## Process

1. **Understand first (Chesterton's fence).** What is it responsible for; what calls it and what does it call; which tests pin its behavior; why might it be written this way (git blame, a platform constraint, a past bug)? If you cannot answer, read more before touching it.
2. **Find concrete signals:** nesting of 3+ levels (guard clauses), functions doing several things, repeated conditionals (extract a named predicate), generic names (`data`, `tmp`), comments that restate the code (delete) versus comments that give the reason (keep), duplicated logic, dead code (confirm it is dead), wrappers that add nothing, patterns with a single use. Rank candidates by the lines removed or the clarity gained, and start with the largest.
3. **One change at a time.** Make it, run the same proof, keep it or revert it. Every intermediate state builds and passes. Do not batch untested changes: when something breaks you must know which one. Refactoring goes in its own commit, apart from feature or bug-fix work.
4. **Compare before and after.** Is the result easier to read? A cleaner diff? New patterns that clash with the codebase? If it is not clearly better, revert; not every attempt succeeds. Stop when the behavior matches and the code is clear, not when it is "perfect".

If the project has a way to compare the running UI or the outputs before and after (visual snapshots, golden files), use it for refactors that must not change anything visible.

## Red flags

Tests edited to pass without a reason you can state. A "simplified" version that is longer or harder to follow. Error handling removed "to make it cleaner". Code you do not fully understand. Renames to your preference. A large commit mixing many changes. Changes outside the task.

## Checklist

- [ ] Existing tests pass unmodified; build and checks pass
- [ ] Each step is small and reviewable; the diff has nothing unrelated
- [ ] Public interfaces, failure behavior and ordering unchanged
- [ ] No error handling or validation removed or weakened
- [ ] Follows the project's conventions; no new dependency or layer

<!-- Composed for this project from: addyosmani/agent-skills code-simplification (MIT, Addy Osmani; process and principles, language examples dropped), the author's own refactoring notes (preserve interfaces, failure behavior, ordering; no new dependency), and ponytail-audit (rank by lines removed). See THIRD_PARTY.md. -->
