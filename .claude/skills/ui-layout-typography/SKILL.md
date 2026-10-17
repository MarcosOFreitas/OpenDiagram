---
name: ui-layout-typography
description: Use when structuring or reviewing a screen's layout, visual hierarchy, spacing, typography, responsive behavior or component consistency (grid, scale, density, breakpoints, tables, forms, navigation). Gatilhos (pt): layout, hierarquia visual, espaçamento, tipografia, responsivo, alinhamento, densidade, tabela, formulário, navegação, padronização de componentes.
---

# Layout, hierarchy and typography

## Hierarchy: one focal point

Squint at the screen: what do you see first, second, third? That must match the user's job. Build hierarchy with **size, weight, contrast, position and space** (not more colors). One primary action per view (filled), secondary actions outlined or quiet, tertiary as text. Group related things closer than unrelated ones (proximity beats borders; use a border or background only when spacing is not enough).

## Spacing and sizing from a scale

Pick one scale (for example 4 px base: 4, 8, 12, 16, 24, 32, 48) and one set of control heights, radii and icon sizes; never invent a value off the scale. Rule of thumb: space inside a group < space between groups < space between sections. Align to a few vertical edges; consistent left edges matter more than anything decorative. Density is a product decision: dense for expert tools (tables, editors), airy for onboarding; do not mix both on one screen.

## Typography

- One family (two at most, clearly different); weights and sizes carry hierarchy. A scale of about 5 to 7 sizes (12, 14, 16, 20, 24, 32), body 14 to 16 px, never below 12 px.
- Line height about 1.4 to 1.6 for text, tighter for headings; line length 45 to 80 characters; left-align running text.
- Numbers in tables and metrics: right-aligned, tabular figures. Code and identifiers: monospace, with a copy action when long.
- Truncate with an ellipsis and a full-text tooltip or expand, never silently clip; long unbroken strings (ids, emails, URLs) must wrap or truncate without breaking layout.
- Uppercase and letter-spacing only for tiny labels, rarely.

## Responsive, content first

Design the narrow layout first, then enlarge. Test 320 or 375, 768, 1024, 1440. No horizontal page scroll (a wide table scrolls inside its own container with a visible affordance). Stack columns, collapse navigation, keep the primary action reachable. Touch targets 44 px preferred, 24 px floor, with spacing; do not rely on hover or on drag as the only way. Use real content lengths (long names, 3-digit counts, translations 30% longer).

## Components that scale

- **Tables**: left-align text, right-align numbers, sticky header, sortable columns marked, row actions in a consistent last column, an empty state, pagination or virtualization beyond a few hundred rows, selected rows distinguishable without color alone.
- **Forms**: single column, label above, required marked once, help text under the field, group with headings, primary action aligned with the form edge, destructive actions separated.
- **Navigation**: current location visible and not by color alone; same place for the same thing on every screen; at most one level of tabs per view; breadcrumbs when depth is more than two.
- **Dialogs and drawers**: for a focused task, with a clear title, one primary action, Escape to close, focus moved in and returned; not for long content or flows that need the page behind.
- **Icons**: one set, one stroke weight and size grid, always with an accessible name, a text label when the meaning is not universal.

## Consistency check

Same job, same component, same wording, same place. Count variants: how many button styles, radii, heights, grays? Each count above the design system's number is a finding. Prefer reusing a component over restyling it; if a new variant is needed, add it to the shared layer once.

## Review questions

Squint test (hierarchy). Remove one border, one shadow, one color: does it improve? Resize from 1440 to 320 slowly: where does it break first? Paste a 200-character name and an empty value. Tab through: does the order follow the visual order?

<!-- Original text written for this harness from general layout and typography practice (spacing scales, type scale, responsive and component patterns); no third-party text copied. -->
