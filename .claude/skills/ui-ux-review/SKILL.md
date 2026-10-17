---
name: ui-ux-review
description: Use when asked to review, audit or improve an existing screen or flow for usability, visual quality and accessibility, or to check a UI change before merging. Produces a ranked list of concrete findings with fixes, anchored in the project's own UI standard. Gatilhos (pt): revisar interface, auditar UI, melhorar o front, revisar UX, a tela está confusa, feia, inconsistente, acessibilidade.
---

# UI/UX review

Review what exists. Building new UI is `frontend-design-pessoal`; the concepts used below live in `ui-color-system`, `ui-feedback-states` and `ui-layout-typography`.

## 1. Anchor first

Read AGENTS.md / CLAUDE.md and any UI standard, design tokens or UI spec of the project. **That standard is the rubric**: a finding is "breaks the standard" before it is "I would do it differently". If there is none, say so and use the checks below as the standard.

## 2. See it, do not guess

Load the screen in a real browser (`browser-verification`), with real or realistic data, at 375, 768 and 1280 px, light and dark if the product has both. Read the code only to find the cause of what you saw. Do not review a screenshot of one happy state: also see empty, loading, error, long text, many rows, read-only.

## 3. Walk the job, then the checks

First name the user and the one job the screen exists for; try to do that job with the keyboard only, then with the mouse. Every hesitation is a finding. Then check, in this order (a higher group beats a lower one):

1. **Can they finish the job?** Primary action obvious and reachable; no dead end; destructive actions confirmed or undoable; errors say what to do next; nothing important only on hover.
2. **Accessibility floor.** Visible focus; logical tab order; a name on every control; targets of 24 px or more; contrast 4.5:1 for text and 3:1 for UI edges and icons; color never the only signal; dialogs trap and return focus; `prefers-reduced-motion` respected; zoom to 200% still works.
3. **Feedback and states** (`ui-feedback-states`): every action answers; every data view has loading, empty, error, partial and permission states.
4. **Hierarchy and layout** (`ui-layout-typography`): one clear focal point per screen, spacing from a scale, aligned edges, readable line length, no horizontal scroll at 375 px.
5. **Color** (`ui-color-system`): roles not hues, one accent, semantic colors used only for their meaning, both themes checked.
6. **Consistency.** Same thing looks and is called the same everywhere; components come from the shared layer, no one-off radius, height, color or icon style.
7. **Copy.** User's words, sentence case, verb on buttons, no jargon or internal names.
8. **Polish.** Only after the above: alignment at the pixel, icon weight, motion timing.

## 4. Report

One line each, ranked by user impact, not by how easy it is to fix:

`[Blocker|Major|Minor|Nit] where — what the user sees — fix (token or component to use)`

Blocker = job cannot be done or an a11y floor is broken. Major = job done with confusion or error. Minor = inconsistency. Nit = taste. End with what was **not** checked (a theme, a width, a screen reader, real data volume). Group repeats ("12 icon buttons lack a name") instead of 12 lines. Praise nothing; list no more than ~15 findings, then say how many were left out.

## 5. Fix only when asked

If asked to fix: smallest change that satisfies the standard, reuse existing tokens and components, then reload the screen at the same widths and show the before and after of each Blocker and Major. In a project with an audit script, its bar (for example "zero findings") also applies.

<!-- Original text written for this harness from general UI practice (WCAG 2.2 thresholds, usability heuristics); no third-party text copied. -->
