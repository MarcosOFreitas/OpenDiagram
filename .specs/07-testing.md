# 07 — Testing

There is no unit-test framework. Verification is two end-to-end scripts against the Docker stack plus manual UI checks.

## Setup

```bash
docker compose up -d --build
docker compose --profile oracle up -d     # for Oracle checks / roundtrip.mjs
```

## Automated

| Script | Needs | Checks (13) |
|--------|-------|-------------|
| `node server/test-guardrails.mjs` | app, `demo-pg`, `demo-pg-tls`, (optional `demo-oracle`) | privilege warnings (superuser/writer/reader); strict mode blocks writer, allows reader; read-only txn rejects DDL (via `psql`); PG TLS: off, verify w/o CA (fails), verify + CA PEM, noverify, verify vs non-TLS (fails); Oracle descriptor injection rejected; Oracle TCPS vs plain listener fails cleanly |
| `cd web && node roundtrip.mjs` | app, `demo-pg`, `demo-oracle` | import → export (pg/mysql/mssql/oracle/json) → re-import comparison; prints diffs. Expected: PG→PG, Oracle→PG, Oracle→MSSQL identical; others fail as documented in [04](04-formats.md) |

Both exit non-zero on failure (`roundtrip.mjs` only prints; read its output). Demo data drifts if you alter `shop.*` manually — the scripts assume ≥ 4 PG tables.

## Manual UI checklist (browser)

- Import from demo-pg via the drawer → 4+ tables, edges visible, toast shown.
- Test with `writer` → amber warning banner; with `reader` → none.
- Edit DBML with a syntax error → underline + status; fix → clears.
- Insert all Docs examples → no error. Toggle dark theme and grid.
- Alter the demo DB, press `↻` → toast with diff, TableGroup kept; press again → "Already up to date".
- Set refresh 1 min, alter DB, wait → editor updates without interaction.
- Export each format; open PNG/SVG and confirm all tables are present (**not yet automated**).

## Known gaps

- Oracle TLS success path (needs an Oracle with TCPS).
- Read-only enforcement proven with `psql`, not through the app's own pool.
- No CI. Suggested: GitHub Actions running `docker compose up -d --build` then the guardrail script; add `npm audit`.
- No browser automation for UI flows; tests above were driven by hand/JS in a browser pane.
- When asserting on edges in a headless/hidden pane, nodes may stay `visibility:hidden` (unmeasured) — focus/screenshot first.
