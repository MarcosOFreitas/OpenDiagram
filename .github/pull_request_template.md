## What and why

<!-- One logical change. What does it do, and why is it needed? Link the issue. -->

## How it was checked

<!-- Say honestly what you ran and what you did not (no Oracle server, no real screen reader, ...). -->

- [ ] `cd web && npx vite build` and `node --check server/src/*.js` pass
- [ ] the e2e scripts that cover this change pass (`server/test-*.mjs`, `web/roundtrip.mjs`)
- [ ] UI change: loaded in a browser; `node web/uiaudit.mjs <screens>` reports zero findings; new screens added to the script
- [ ] docs updated in the same change (`.specs/`, `web/src/docsite/pages/`, README); pictures retaken with `web/docshots.mjs` if a documented screen changed
- [ ] no secrets, no real data, no new outbound access or SQL beyond catalog queries (see `AGENTS.md`, security invariants)
