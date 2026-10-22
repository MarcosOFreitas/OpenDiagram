---
name: test-driven-development
description: Use when implementing a feature, fixing a bug, refactoring or changing behavior, and when adding or changing tests, mocks or test helpers. Write the failing test first, watch it fail for the right reason, then write the minimal code.
---

# Test-driven development

A test you never watched fail has not proven it can catch anything. Write the test first, see it fail, then make it pass with the least code.

## When

Features, bug fixes, behavior changes, refactors. Skip only for throwaway prototypes, generated code and plain configuration, and say so instead of silently skipping.

## 1. Find the project's way first

Before writing anything: find the test command, the framework, where tests live, how they are named, and which helpers and fixtures exist. Reuse them; do not add a framework. Run the suite once to know the baseline (pre-existing failures are reported by name, never hidden).

## 2. The cycle

1. **Red.** One test, one behavior, a name that says the behavior, real code (no mock unless the dependency is slow or external). First name the production change that would make it fail. If you cannot, the test is not worth writing.
2. **Verify red.** Run it. It must *fail* (not error), with the message you expected, because the behavior is missing (not because of a typo). It passes at once? You are testing existing behavior: fix the test.
3. **Green.** The simplest code that passes. No extra options, no neighbouring cleanup.
4. **Verify green.** Run the whole suite, not only the new file; a green file is not a green suite. Output clean. Any other failure goes in your report by name, even one you did not cause.
5. **Refactor** only while green, then run again. Add no behavior here.

## 3. Bug fix (prove it)

Reproduce the bug as a failing test → watch it fail → fix at the root → watch it pass → **put the bug back once (revert the fix) and confirm the test fails again** → restore the fix. A regression test that passes on the old code proves nothing.

Code written before its test? Write the test now, revert your change, and confirm the test fails on the old code. That restores the proof without throwing the work away.

## 4. What makes a test good

- **Names the break it catches**, and the break is a bug, not a decision. A test that fails only when someone intentionally changes a constant or the exact wording of a message is a change detector: test the behavior that depends on the decision.
- **Expected values come from outside the code under test**: literals or hand-checked fixtures. If the test builds the expected value with the same function (a mirror assertion), it passes whatever the code does.
- **Behavior, not implementation**: assert outputs, state and what a user or caller sees, not private structure or call order, unless the order is the contract.
- **Real over mocked.** Mock only the slow or external level, after learning what the real method does (its side effects may be what other code reads). Never assert on the mock itself; if the test fails when the mock is removed, delete the assertion. A fake that accepts anything verifies nothing: assert arguments and counts where they are part of the contract. Mock the full real shape of the data, not only the fields the test reads.
- **Your boundary, not the framework's.** Test the route you register, the query you emit, the payload you produce; not that the framework calls a handler. Trivial getters, constants and forwarding need no test until they validate, default, derive or cause side effects.
- Test-only cleanup lives in test utilities, never as a method of a production class. Never grep source text to "test" a script or a config: run it on controlled input and assert the output, the side effect or the exit code.

## 5. Before you finish: mutation check

Mentally break the production code: wrong constant or argument, wrong branch, missing side effect, empty or default return, missing validation (zero, empty, null, unauthorized, malformed). Each realistic break should fail at least one test; one that nothing catches is unprotected behavior, or a tautological test.

## Excuses that mean stop

| Excuse | Reality |
|---|---|
| "Too simple to test" | Simple code breaks; the test takes seconds. |
| "I'll add the test after" | A test written after the code passes at once and shows nothing; it checks what you remembered, not what should happen. |
| "I tested it by hand" | Not repeatable, no record of the cases, forgotten under pressure. |
| "It is hard to test" | The design is too coupled: make the dependency injectable or the logic a plain function, then test it. |
| "I need to mock everything" | Same cause. If setup is bigger than the test, use real components. |
| "Just this once" | That is the sentence before every regression. |

## Checklist

- [ ] Every new behavior has a test that I watched fail first, for the right reason
- [ ] Bug fix: the test fails with the fix reverted
- [ ] Minimal code, no features beyond the tests
- [ ] The whole suite passes; unrelated failures named
- [ ] Mutation check done; no assertion on a mock; no mirror assertions

<!-- Composed for this project from: obra/superpowers test-driven-development and writing-good-tests (MIT, Jesse Vincent) and addyosmani/agent-skills test-driven-development (MIT, Addy Osmani). See THIRD_PARTY.md. -->
