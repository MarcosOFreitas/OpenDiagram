---
name: ui-feedback-states
description: Use when designing or reviewing how a UI answers the user: hover, focus, pressed and disabled states, loading, empty, error and success states, form validation, toasts, optimistic updates, motion and transitions.
---

# Visual feedback and states

Rule: **every action gets an answer the user can see, in proportion to its cost.** Silence reads as broken.

## Response time sets the pattern

| Wait | Do |
|---|---|
| under ~100 ms | Show the result. No spinner. |
| 100 ms to ~1 s | Immediate pressed state; keep the layout still; no flash of a loader for fast results (delay it ~150 ms). |
| 1 to ~10 s | Visible progress: skeleton for content, spinner or inline "Saving…" for actions; disable repeat submit; keep what was there. |
| over ~10 s | Determinate progress or steps, the option to cancel or leave, and a notification when done. |

Prefer **optimistic updates** for cheap, reversible, usually-successful actions (toggle, reorder), with a visible rollback and message on failure. Never for payments, deletes without undo, or anything the server may reject often.

## Interactive element states (all of them, not just default)

Default, hover, **focus-visible**, pressed, selected/current, disabled, busy, error. Each must differ from the others by more than hue. Rules: hover is never the only way to reveal something (touch has no hover); focus is always visible; disabled explains itself when it is not obvious (tooltip or helper text) or is replaced by an enabled action that explains the missing step; a busy button keeps its width and label ("Saving…").

## Data views: the five states

1. **Loading**: skeleton that matches the final layout (no jump), or spinner for short actions.
2. **Empty**: what this is, why it is empty, the one action to fill it. First-use and no-results-after-filter are different texts; the latter offers "clear filters".
3. **Error**: what failed, in user terms, what to try, with a retry that works; keep the user's input; do not blame; inline near the cause, not only a vanishing toast.
4. **Partial or stale**: show what exists, mark what is missing or old, with a refresh.
5. **No permission / read-only**: say it and why; do not just hide controls.

## Messages

- **Toast**: low-stakes confirmation that needs no action ("Saved"), auto-dismiss 4 to 6 s, pausable, announced with `role="status"`. Anything that needs a decision or must not be missed is inline or a dialog, not a toast. Errors that need action stay until dismissed (`role="alert"`).
- **Undo beats confirm** for reversible deletes ("Deleted. Undo"). Confirm dialogs only for the irreversible, naming the object and the consequence; the confirm button repeats the verb ("Delete table"), not "OK".
- Success text uses the same verb as the button ("Publish" → "Published").

## Forms

Validate on blur and on submit, not on every keystroke (except live hints like strength or length); show the error beside the field with text, an icon and the field's border; move focus to the first error on failed submit and summarize if there are several; keep inputs on error; mark required vs optional once; labels above fields, never placeholder-only; disable nothing silently, explain instead. Preserve a draft on accidental navigation when the form is long.

## Motion

Purpose only: show cause and effect, keep orientation (where did it go), draw attention to one change. Durations about 100 to 200 ms for small state changes, 200 to 300 ms for panels and dialogs; ease-out for entering, ease-in for leaving; animate `opacity` and `transform`, not layout properties; never block input waiting for an animation; honor `prefers-reduced-motion` (replace movement with a fade or nothing). Use the project's duration and easing tokens, add no new ones. No decorative loops.

## Review questions

Press every control: does something change within 100 ms? Throttle the network: what does the user see at 3 s and at 30 s? Break the request: does the error say what to do? Submit twice quickly. Navigate away mid-save. Open it with no data and with 10,000 rows.

<!-- Original text written for this project from general interaction-design practice (response-time limits, state coverage, WCAG status messages); no third-party text copied. -->
