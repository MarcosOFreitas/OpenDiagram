---
name: verification-before-completion
description: Use before saying work is done, fixed, passing or ready, and before a commit, a pull request or a hand-off. Run the command that proves the claim, read its output, then state the result with that evidence.
---

# Verification before completion

A claim about the state of the work needs evidence from the current state of the code. "Should work" is not evidence.

## Gate

Before claiming done, fixed, passing, clean or ready:

1. **Identify** the command that proves the claim.
2. **Run** it in full, fresh (not a result from before your last edit).
3. **Read** the output and the exit code; count failures.
4. **Compare** with the claim. If they disagree, report the real status with the evidence.
5. **State** the claim with the evidence (command and result).

Use one of four outcomes, nothing vaguer: **pass**, **fail**, **unavailable** (the check cannot run here: say why), **blocked** (something outside your control stops it).

## Which evidence proves which claim

| Claim | Needs | Does not prove it |
|---|---|---|
| Tests pass | the project's test command, 0 failures, the whole suite (slow end-to-end suites only when the change needs them) | an earlier run, one file, "should pass" |
| The build works | the build command, exit 0 | the linter or the tests passing |
| The linter is clean | the linter output, 0 errors | a partial run |
| A bug is fixed | the original symptom now passes | "the code changed" |
| A regression test is real | red then green: it fails with the fix reverted and passes with it | it passed once |
| A UI change works | the page loaded and exercised in a real browser, or the project's UI check | the code compiling |
| Requirements met | a line-by-line check against the requirements | the tests passing |
| A delegated agent finished | the diff shows the change and the checks pass | the agent's report |

## Rules

- In a validation-only task, do not edit the product to make a check pass: report the result.
- Reuse a result only if it is from this task and nothing it covers has changed since. Stop when the proof is complete; do not widen the scope to look thorough.
- Hedging words ("should", "probably", "seems to") and celebration before the evidence ("Done!", "Fixed!") are the signal that a check is missing. Run it first.
- Say what you did **not** verify (an environment you do not have, a path you did not exercise). An honest "not tested" beats a confident guess.
- A failure you did not cause still goes in the report, by name.
- If a check fails, fix the code. If the check itself is wrong, say so and fix it in the open (or ask); never weaken a test, a threshold or a security rule quietly to turn it green.
- Applies to claims about the work: before saying it, before committing, before opening a pull request, before handing over. It does not govern ordinary conversation.

<!-- Composed for this project from: obra/superpowers verification-before-completion (MIT, Jesse Vincent) and the author's own verification notes (outcome vocabulary, reuse of current results). See THIRD_PARTY.md. -->
