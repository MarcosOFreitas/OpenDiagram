# 11 — UI/UX review checklist

Review done with the `ui-ux-pro-max` skill (web/desktop rules: accessibility, targets, motion, forms, responsive). Re-run it when screens change: load the app, open each screen below and run the DOM audit (accessible name on every control, targets >= 24px, field labels, text contrast >= 4.5:1), then check 375px and keyboard focus.

## Rules applied

- One control look (`styles.css`, "UI foundation"): heights 34px (28px compact), radii 6/8/12, one focus ring (`:focus-visible`, 2px), press feedback, tokens `--r-*`, `--ctl*`, `--ease`.
- Motion: opacity/transform only, 120-220ms, never on canvas nodes; everything off under `prefers-reduced-motion`.
- Fields without a visible label get an `aria-label` from `a11y.js` (placeholder, column header + row name, or first option).
- Pointer targets >= 24px; secondary text >= 4.5:1 (`--muted` #5b6472).
- Phones (<= 720px): compact top bar, editor starts closed, panels never wider than the screen, dock keeps zoom/fit/Arrange.

## How it is verified

`node web/uiaudit.mjs` (headless Chrome with real focus, see the header of the file for the throw-away instance it needs) opens every screen below in **light and dark** theme at **desktop (1280)** and **phone (375)** and reports: control without an accessible name, pointer target < 24px, field without label, text contrast < 4.5:1, horizontal overflow, dialogs without `role`/`aria-modal`/name/focus handling/Tab trap, and a **keyboard walk** (Tab through the page: every stop must be visible and show a focus indicator). Tablet (768px) is deliberately not covered. The first-run screen needs an empty second instance: `BASE_EMPTY=http://localhost:3101 node web/uiaudit.mjs first-run`.

Status of the last full run (after the fixes): **no findings**.

## Screens covered (all in both themes; phone where noted in the script)

Sign in · first run (create the first account) · forced password change · main screen (top bar, dock, nodes) · Export / More / Account menus · account password form · drawers Diagrams, Import (empty and pasted), History (+ compare dialog), Database (empty, tested with schema list, TLS verify + CA field, Oracle tab, write-privilege warning, refresh timer) · error toast · table picker (Tables and Groups tabs) · Share (person, group, link with password) · shared link (signed out, signed in, password prompt) · Tables panel (+ filters) and its Display tab (the former View drawer) · Arrange popover · lineage canvas · highlight/collapse all · sticky note · selected table · "newer version" bar · Docs view (overview, changelog + comments, collapsed) · Administration: Users (+ create result, reset password), Groups, Connections (+ register form), Audit log, Settings · every page of the documentation site `/docs` (light) and its search · the downloaded documentation HTML opened from disk.

## Rules learnt from the audit

- Something that answers a click is a `<button>` (or gets `press()` from `a11y.js`: `role=button`, `tabIndex=0`, Enter/Space). A `div` or `a` with only `onClick` is invisible to the keyboard and to screen readers; `uiaudit.mjs` reports it as `mouseOnly`. A card that opens something uses the stretched `.card-open` button inside `.card.act` (see `Library.jsx`), never an `onClick` on the card.
- A control whose text is only a symbol (✕, ×, ▸) needs `aria-label`: the visible glyph wins over `title` as the name (`glyphName` finding).

- A panel that waits for the server shows `Loading.jsx` (two tables joined by a line, a dot running between them; opacity/transform only, still under `prefers-reduced-motion`), at the size the content will have. The Administration card has one fixed size (`.admin-card.adm`) on every tab, so nothing jumps when a tab loads. The Administration tabs and the Account drawer use the same sections: `.group-card` with an `h4` title.

- The dark theme sets `--muted`/`--line` for the canvas and drawers, but the Administration card, menus and pickers stay white: tokens are reset on `.admin` / `.menu-pop` (a new white surface must do the same).
- React Flow sets `outline: none` on nodes and edges with a higher specificity: the focus ring has its own rule.
- Header colours come from the DBML: the text colour is picked by contrast (`readable()` in `diagramModel.js`), never fixed white.
- Sizes measured inside the canvas depend on the zoom, so the audit skips them; the CSS sizes are what count.

## Not covered

A real screen reader (NVDA/VoiceOver), Windows high-contrast mode, tablet width, Oracle with a real TCPS server (UI fields only), the third-party "React Flow" attribution link (library).
