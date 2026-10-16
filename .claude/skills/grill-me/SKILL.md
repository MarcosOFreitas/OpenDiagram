---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when the user wants to stress-test a plan, get grilled on a design, or says "grill me". Also before a large feature or a change to the table selection, sharing, connections or security.
license: MIT
metadata:
  derived_from: https://github.com/mattpocock/skills/tree/49dd158d1076/skills/productivity/grill-me
  original_author: Matt Pocock
---

<!-- Third-party skill: grill-me by Matt Pocock (MIT). The interview rules are his; the section "In this repo" is ours. See ../THIRD_PARTY.md. -->

# Grill Me

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.

## Rules

1. **One question per turn.** Never bundle.
2. **Provide a recommended answer with each question.** "What do you think?" alone is lazy.
3. **Explore the codebase before asking.** If a search or a read resolves it, do that first.
4. **Walk the tree depth-first.** Finish a branch before opening another.
5. **Track dependencies.** If decision B depends on decision A, ask A first.

Per question: `Q[i]: [question]` then `Recommended answer: [your call + one sentence of why]`, or "I explored the codebase and found [evidence]. Confirm?". When every branch is resolved, say "shared understanding reached" and list the decisions that are locked in.

## In this repo (OpenDiagram)

- Anchor the questions in `AGENTS.md` (security invariants, conventions, UI standard) and the relevant `.specs/NN-*.md`. A plan that would weaken an invariant, add outbound access, widen the MCP connector, or read user table data is a branch to challenge first, not a detail.
- Always ask: what is the smallest version that solves it? what is the failing test that proves it? what existing code already does part of it? what breaks for a member, a share-link visitor, an agent account? how does it look at 375 px and in the dark theme?
- When a decision is settled, record it in the matching spec (or ask which one) in the same change, as the repository rule says. Do not start implementing until the user says so.
