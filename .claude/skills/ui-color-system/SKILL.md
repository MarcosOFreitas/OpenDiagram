---
name: ui-color-system
description: Use when choosing, reviewing or fixing colors in a UI: palette, theme tokens, dark mode, status colors, contrast, charts, user-chosen colors. Teaches color by role, not by hue. Gatilhos (pt): paleta de cores, cores do tema, modo escuro, contraste, cor de status, cor de destaque, escolher cores.
---

# Color system

Color is a **signal**, not decoration. Decide the job of each color before its value.

## Roles, not hues

Name tokens by what they do and use only the tokens in components, never raw hex:

- **Surfaces** (3 to 4 steps): page, panel, raised (menu, dialog), sunken (input, code). Depth comes from lightness steps and a border, not from many hues.
- **Text** (3 steps): primary, secondary (labels, help), disabled. Plus **on-accent** text for filled buttons.
- **Border**: subtle (dividers) and strong (inputs, focus-adjacent).
- **Accent**: exactly one brand/action color, used for the primary action, links, selection and focus. If everything is accent, nothing is.
- **Semantic**: danger, warning, success, info. Used **only** for their meaning; never reuse danger red for a decorative or brand element, and never make the accent look like a status.
- Each semantic and accent color needs a **soft** tint (backgrounds of alerts, chips) and a **strong** value (text and icons on that tint).

## 60-30-10

About 60% neutral surface, 30% secondary neutrals (panels, text), 10% accent. A screen with large saturated areas is usually wrong; saturation is for the small thing that must be seen.

## Contrast (measure, do not eyeball)

- Normal text 4.5:1; large text (24 px, or 19 px bold) 3:1; icons, input borders, focus rings and chart marks that carry meaning 3:1 against what is next to them.
- Check the real pair, including text on tinted backgrounds, disabled-but-readable text, placeholders (placeholders are still text), links inside paragraphs, and text over images (add a scrim).
- **Never color alone**: pair status colors with an icon, label or shape; test with a grayscale or color-blind simulation. Avoid red/green as the only distinction.
- Colors that come from user data (tags, groups, avatars): pick the text color by computed contrast against that background, never fixed white or black.

## Dark theme is a second palette, not an inversion

- Do not use pure black and pure white: very dark gray surface, slightly off-white text.
- Raised surfaces get **lighter** (shadows barely show); keep the same elevation order as light.
- Desaturate and lighten accent and semantic colors, otherwise they vibrate; re-check contrast for every pair.
- Reduce large bright areas; images and charts may need a dimmer treatment.
- Check hardcoded colors, white-only components (menus, dialogs), SVG fills and third-party widgets: they are where dark mode breaks. Respect `prefers-color-scheme` and any explicit user toggle.

## State colors without new hues

Hover, active, selected, disabled and focus come from the same tokens by lightness or opacity steps (hover one step lighter or darker, selected = soft accent tint plus a non-color marker, disabled = lower contrast **and** `not-allowed`/aria state). Focus ring: a 2 px outline with offset, 3:1 against both the element and the page, never removed.

## Data visualization

Categorical series: at most ~6 distinguishable hues, plus direct labels or patterns; sequential data: one hue, lightness ramp; diverging: two hues around a neutral midpoint. Keep status colors out of categorical palettes so a series never looks like an error.

## Quick review

1. List the tokens; delete near-duplicates. 2. Count accent uses on one screen. 3. Measure the 5 riskiest pairs in both themes. 4. Turn off color (grayscale): is every state still readable? 5. Search the code for raw hex, `#fff`, `#000`, `color:` outside the token layer.

<!-- Original text written for this harness from general color-system practice (WCAG contrast thresholds, role-based tokens, dark-theme guidance); no third-party text copied. -->
