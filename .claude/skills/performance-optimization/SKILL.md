---
name: performance-optimization
description: Use when something is slow, when a change may have caused a regression, when load or response times must improve, or before adding a cache, memoization or index to "make it faster". Measure, fix the one bottleneck the measurement shows, measure again, guard. Gatilhos (pt): está lento, otimizar, desempenho, gargalo, medir antes de otimizar, regressão de velocidade, cache para acelerar.
---

# Performance optimization

Without a number a performance change is a guess that adds code. If there is no evidence of a problem, do not optimize.

## Workflow

1. **Measure.** Find the project's own benchmarks, profilers and budgets first and use them. Record the baseline: what, how, the number, and how much it varies across runs (same machine, same data, several runs).
2. **Find the bottleneck.** Profile in the real runtime (browser, server, database); do not assume. Name the one thing that costs most.
3. **Fix only that.** One change at a time: no unrelated refactor, no second optimization in the same step.
4. **Measure again, same way.** Keep the change only if the number moved by more than the noise. **Neutral is a revert. Faster but a test went red is a revert.** Say before and after.
5. **Guard.** A budget, a benchmark in the repository or a test that fails on regression; at minimum a comment with the measured number.

## Keep a ledger

In the pull request text, one line per attempt, kept or reverted:

| Idea | Before → after | Kept? | Why |
|---|---|---|---|

Reverted attempts are results too; they stop the next person from repeating them.

## Rules

- Never trade correctness, security or data guarantees for speed. A query that reads data it should not read, a cache that serves another user's data, a dropped validation: not allowed, whatever it saves.
- Complexity is a cost. A cache, memo or index needs a measured win that pays for it; say what it must be invalidated by.
- For databases, read the query plan (`EXPLAIN`) instead of guessing "add an index"; check that the plan really changed.
- For UIs, look for work repeated per item that could happen once, re-renders triggered by unrelated state, and recomputation on every keystroke. Motion and layout cost count too.
- If a measured number changes on purpose, update whatever documents it (requirements, specs) in the same change.

## Checklist

- [ ] Baseline recorded with its variation
- [ ] The bottleneck was shown by a profile, not guessed
- [ ] One change per step; the ledger lists every attempt
- [ ] Improvement larger than the noise; tests still green
- [ ] A guard exists; documentation updated if a number changed

<!-- Composed for this project from: addyosmani/agent-skills performance-optimization (MIT, Addy Osmani: measure, keep-or-revert, regression guard, attempt ledger), shortened. See THIRD_PARTY.md. -->
