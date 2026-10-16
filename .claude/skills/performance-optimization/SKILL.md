---
name: performance-optimization
description: Measure, fix the one bottleneck the measurement shows, measure again, add a guard. Use when something is slow, when a change may have slowed the canvas, the import, the API or the Docs view, when diagrams of many tables feel heavy, or before adding a cache, memo or index "to be faster".
license: MIT
metadata:
  derived_from: https://github.com/addyosmani/agent-skills/tree/aeac41d4d005/skills/performance-optimization
  original_author: Addy Osmani
---

<!-- Third-party skill: the workflow (measure, find the bottleneck, fix only that, verify, guard) is from Addy Osmani's performance-optimization (MIT); the text and the repository specifics are ours. See ../THIRD_PARTY.md. -->

# Performance optimization

**Measure before optimizing.** Without a number, a performance change is a guess that adds code. If there is no evidence of a problem, do not optimize.

## Workflow

1. **Measure.** Write down the baseline (what, how, the number) before touching code. Same machine, same data, several runs; say how much they vary.
2. **Find the bottleneck.** Profile, do not assume. Name the one thing that costs most.
3. **Fix only that.** No unrelated refactor, no second optimization in the same change.
4. **Measure again.** Keep the change only if the number moved by more than the noise; otherwise revert it. Report before and after.
5. **Guard.** A budget, a bench in the repo, or a test that fails when it regresses; a comment with the measured number is the minimum.

## In this repo (OpenDiagram)

- **Server** (API, import, refresh, audit): `node server/bench.mjs` runs a throw-away container with CPU and memory limits (see its header). The numbers feed the *Hosting requirements* documentation page.
- **Browser** (canvas, Docs view, layout, many tables): `node web/benchclient.mjs` measures the cost of diagrams of several sizes. Layout algorithms are pure functions in `web/src/layout.js`: time them in a unit-style script before touching the canvas.
- **Database side**: the import runs catalog queries only, inside a read-only session; never add a query that reads user table data to "speed something up". `EXPLAIN` on the catalog queries is fine.
- Usual suspects: re-rendering every React Flow node on a state change that only concerns one (stable references, `memo`), work done per node that could be done once per diagram, a `useMemo` that recomputes on every keystroke of the editor, loading the whole history list when one version is needed.
- Motion stays on `opacity` / `transform`, never on canvas nodes (UI standard in `AGENTS.md`).
- If a measured number changes on purpose, update the *Hosting requirements* page and `.specs/` in the same change.
