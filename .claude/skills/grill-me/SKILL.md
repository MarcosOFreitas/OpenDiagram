---
name: grill-me
description: Interview the user relentlessly about a plan or design until you reach a shared understanding, resolving each branch of the decision tree. Use when the user wants to stress-test a plan, says "grill me", or before a large or risky change.
---

# Grill me

Interview the user about every aspect of the plan until you both understand it the same way. Walk down each branch of the design tree, resolving dependencies between decisions one by one. For each question, give your recommended answer. Ask one question at a time.

If a question can be answered by exploring the codebase or the project's specs, explore instead of asking, and say what you found.

## Rules

1. **One question per turn.** Never bundle.
2. **Always recommend an answer** and give the reason in one sentence, worded so that a plain "yes" accepts it. "What do you think?" alone is lazy.
3. **Look before you ask.** Search the code, the specs and the docs first. When the evidence settles it, state it ("I found X in file Y; confirm?") and move on.
4. **Depth first, dependencies first.** Finish a branch before opening another; if decision B depends on A, ask A first.
5. **Do not pad.** Stop when nothing is left silently assumed and the frontier of open decisions is empty. No ritual questions.

## Challenge toolkit

Use these where they bite, not as a script:

- What would make this plan wrong? What evidence would change your mind?
- What happens if we do nothing, or do the smallest thing?
- "Fast", "simple", "small", "scalable": how fast, how small, by what number?
- What is the failing test that proves it works? What breaks for the people it was not designed for?
- Which existing code already does part of this? What is the least we can build?
- What is the hardest part to undo? That decision gets the most scrutiny.

## Agreement is explicit

Restate the plan in your own words, with a line for what is **out of scope**, and ask for confirmation. "Sounds good", "whatever you think", "ok" in reply to a vague question is not agreement: re-ask with one concrete option. When every branch is resolved, say "shared understanding reached" and list the decisions that are locked in.

## After

Do not start building until the user says so. If the project keeps decisions in a spec or decision file, offer to record the locked-in decisions there (ask which file); do not create a new documentation system.

<!-- Composed for this project from: Matt Pocock's grill-me (MIT; the older one-question-at-a-time version, whose interview rules are the first paragraph above, taken from the port in alirezarezvani/claude-skills without its scripts; his newer "grilling" asks a whole round of questions at once and delegates fact lookup to a subagent, and was not used on purpose), the challenge questions of vltansky's grill-me (ideas only, no text; source and license not verified) and the explicit-agreement rule of addyosmani/agent-skills interview-me (MIT, Addy Osmani). See THIRD_PARTY.md. -->
