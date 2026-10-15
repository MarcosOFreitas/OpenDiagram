# 11 — UI/UX review checklist

Review done with the `ui-ux-pro-max` skill (web/desktop rules: accessibility, targets, motion, forms, responsive). Re-run it when screens change: load the app, open each screen below and run the DOM audit (accessible name on every control, targets >= 24px, field labels, text contrast >= 4.5:1), then check 375px and keyboard focus.

## Rules applied

- One control look (`styles.css`, "UI foundation"): heights 34px (28px compact), radii 6/8/12, one focus ring (`:focus-visible`, 2px), press feedback, tokens `--r-*`, `--ctl*`, `--ease`.
- Motion: opacity/transform only, 120-220ms, never on canvas nodes; everything off under `prefers-reduced-motion`.
- Fields without a visible label get an `aria-label` from `a11y.js` (placeholder, column header + row name, or first option).
- Pointer targets >= 24px; secondary text >= 4.5:1 (`--muted` #5b6472).
- Phones (<= 720px): compact top bar, editor starts closed, panels never wider than the screen, dock keeps zoom/fit/Arrange.

## Checklist (status: ok = audited with no findings after the fixes)

| Screen / popup | Checked | Status |
|---|---|---|
| Sign in | layout, labels, contrast, logo | ok |
| Top bar (title, Diagram/Docs, Share, Export, More, account) | alignment, names, focus, 375px | ok |
| Canvas dock (zoom, fit, collapse/expand, highlight, note, lineage, Arrange + caret) | 32px squares on one centre line, names, 375px | ok |
| Arrange algorithm popover | motion, contrast, keyboard | ok |
| Export menu | names, motion | ok |
| More menu (Diagrams, Database, Import, History, View, Documentation) | names, motion | ok |
| Account menu (password, Administration, Sign out) | names | ok |
| Diagrams drawer | cards, delete target size/contrast | ok |
| Database drawer | field labels, guardrail banners | ok |
| Import drawer | field labels | ok |
| History drawer | contrast | ok |
| View drawer | contrast | ok |
| Share drawer (people, groups, links) | field labels | ok |
| Tables panel | close target, counts contrast, dock/minimap offset | ok |
| Docs view | contrast, narrow window, transition | ok |
| Administration: Users, Groups, Connections (+ register form), Audit log, Settings | labels, buttons, CSV link | ok |
| Documentation site `/docs` | 375px, brand | ok |
| Table picker, edit-conflict dialog, find/replace bar, shared-link view `/s/<token>` | same control look (CSS); not driven one by one in this round | not audited |

Not covered: Windows high-contrast mode, screen-reader pass, tablet landscape, the third-party "React Flow" attribution link (library).
