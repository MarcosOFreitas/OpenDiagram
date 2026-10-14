# 07 — Testing

There is no unit-test framework. Verification is three end-to-end scripts against the Docker stack plus manual UI checks. All accept `BASE=http://host:port` (default `http://localhost:3000`) and need an administrator of that stack (`TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`).

## Setup

```bash
docker compose up -d --build
docker compose --profile oracle up -d     # for Oracle checks / roundtrip.mjs
docker compose exec app node src/cli.js create-admin admin@example.com 'a-long-test-password'
export TEST_ADMIN_EMAIL=admin@example.com TEST_ADMIN_PASSWORD='a-long-test-password'
```

## Automated

| Script | Needs | Checks |
|--------|-------|-------------|
| `TEST_ADMIN_EMAIL=… TEST_ADMIN_PASSWORD=… node server/test-auth.mjs` | app + an administrator (`docker compose exec app node src/cli.js create-admin <email> <password>`) | 91: closed sign-up, admin creates users/temporary passwords/forced change, roles and 403s, last-admin guard (isolated DB), disable/enable/reset/delete, flat groups with multi-membership, directory, per-account isolation, administrator access to every diagram (no connection link, no borrowed connections), sharing with people and groups (highest level, leave/delete group, revoke), link levels, settings, CSRF, logout, headers, SSRF policy functions. Creates and removes throw-away users/groups |
| `node server/test-guardrails.mjs` (also needs `TEST_ADMIN_*`) | app, `demo-pg`, `demo-pg-tls`, (optional `demo-oracle`) | privilege warnings (superuser/writer/reader); strict mode blocks writer, allows reader; read-only txn rejects DDL (via `psql`); PG TLS: off, verify w/o CA (fails), verify + CA PEM, noverify, verify vs non-TLS (fails); Oracle descriptor injection rejected; Oracle TCPS vs plain listener fails cleanly |
| `TEST_ADMIN_EMAIL=… TEST_ADMIN_PASSWORD=… node server/test-oracle-tls.mjs` | app + `--profile oracle` (`demo-oracle`, `demo-oracle-tls`) | Oracle TLS modes: verify, host-name mismatch, `serverDn` accepted/refused, `noverify`, TLS off against TCPS, DN injection |
| `node server/test-lineage.mjs` | nothing (pure) | view column lineage: SQL parsing into output column -> source column (joins, aliases, expressions, aggregates, `*`, sub-selects, CTE, UNION, view on view, Oracle upper case, unreadable SQL gives null) |
| `node web/lineage-check.mjs` | nothing (pure) | the `// lineage:` comment parser (table and column level, `(auto)` marker, merging, unknown names) and the upstream/downstream closure |
| `cd web && node roundtrip.mjs` (also needs `TEST_ADMIN_*`) | app, `demo-pg`, `demo-oracle` | import → export (pg/mysql/mssql/oracle/json) → re-import comparison; prints diffs. Expected: PG→PG, Oracle→PG, Oracle→MSSQL identical; others fail as documented in [04](04-formats.md) |

`test-auth` and `test-guardrails` exit non-zero on failure (`roundtrip.mjs` only prints; read its output). Demo data drifts if you alter `shop.*` manually — the scripts assume ≥ 4 PG tables.

## Manual UI checklist (browser)

- Fresh volume: first screen offers to create the administrator; afterwards public sign-up is closed. Admin → create user (temporary password shown once) → sign in as that user: forced password change → workspace. Admin → groups → add member → share a diagram with the group → the member sees it under *Shared with me* with the right permission.
- First sign-in of a new account → the sample "Online store - sample" diagram exists (8 tables, 10 refs, 3 groups); *Start from a template* creates another; switching between two diagrams with identical DBML still draws the canvas → edit → `Saved`; reload keeps content and table positions.
- Share: give a person and a group each a level; and create view/comment/edit links; open each in a private window: read-only editor for view/comment, comments visible, Log in prompt; after signing up the permission chip changes and comment/edit work; owner downgrade/revoke takes effect.
- Import from demo-pg via the drawer → 4+ tables, edges visible, toast shown.
- Test with `writer` → amber warning banner; with `reader` → none.
- Edit DBML with a syntax error → underline + status; fix → clears.
- Toggle dark theme and grid. Open **More → Documentation**: every page opens, no broken internal link, search finds a page, anchors scroll.
- Alter the demo DB, press `↻` → toast with diff, TableGroup kept; press again → "Already up to date".
- Set refresh 1 min, alter DB, wait → editor updates without interaction.
- Switch to Docs: sidebar, search, relationship links; collapse/expand a table (chevron), Collapse all / Expand all, reload keeps collapsed state; add a table and a column comment, reload keeps them; export Docs `.html`/`.md` includes the comments and the `.html` opens standalone with working search.
- Export each format; open PNG/SVG and confirm all tables are present (**not yet automated**).

## Known gaps

- Oracle TLS: `verify`, `serverDn` and `noverify` are checked by `server/test-oracle-tls.mjs` against `demo-oracle-tls` (a TLS proxy with a throw-away certificate); `verify` was also checked by hand against OCI. Wallets are not supported. A real Oracle with a private CA was not tried.
- `DB_HOST_POLICY=public-only` / `allowlist` verified only through the policy functions, not through `/api/schemas`.
- A comment-level / edit-level member exercising the UI (the API is covered); opening a downloaded docs `.html` from disk.
- Read-only enforcement proven with `psql`, not through the app's own pool.
- No CI. Suggested: GitHub Actions running `docker compose up -d --build` then the guardrail script; add `npm audit`.
- No browser automation for UI flows; tests above were driven by hand/JS in a browser pane.
- When asserting on edges in a headless/hidden pane, nodes may stay `visibility:hidden` (unmeasured) — focus/screenshot first.
