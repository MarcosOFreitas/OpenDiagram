# 04 — Import / export formats

**Status:** implemented with known gaps. Conversion is done by `@dbml/core`; PNG/SVG by `html-to-image` (viewport transformed to fit all tables).

## Matrix

| Format | Import | Export | Notes |
|--------|:------:|:------:|-------|
| DBML | ✅ (file/paste) | ✅ | native |
| PostgreSQL SQL | ✅ | ✅ | |
| MySQL SQL | ✅ | ✅ | |
| SQL Server SQL | ✅ | ✅ | |
| Snowflake SQL | ✅ | — | |
| Oracle SQL | ❌ parser returns empty | ✅ | use live Oracle import |
| JSON | ❌ does not round-trip | ✅ | `@dbml/core` json/jsonv2 import is unusable for its own export |
| PNG / SVG | — | ✅ | background follows theme; file name = diagram title |
| Live DB | PostgreSQL, Oracle | — | see [03](03-connections-import.md) |

## Round-trip results (demo DBs, `web/roundtrip.mjs`)

DB → DBML → export → re-import → compare columns/types/PK/NOT NULL/index count/refs.

| Source ↓ / format → | PG | MySQL | MSSQL | Oracle | JSON |
|---------------------|----|-------|-------|--------|------|
| Postgres demo | identical¹ | fails | fails | export only | fails |
| Oracle demo | identical¹ | fails | identical¹ | export only | fails |

¹ after normalizing type aliases (`timestamp without time zone`≡`timestamp`, `character varying`≡`varchar`) and ref direction (the exporter flips endpoint order).

Failures are cross-dialect issues, not parser bugs: PG defaults (`nextval(...::regclass)`), `character varying`, Oracle `NUMBER`, etc. are not valid in the target dialect.

## Acceptance criteria

- [x] All export buttons produce a file without error for the sample and demo diagrams.
- [x] Importing valid PG SQL via paste creates tables and refs; invalid SQL shows `line N: …` in a toast.
- [x] PG→PG and Oracle→{PG, MSSQL} round-trips are identical (per criteria above).
- [ ] Cross-dialect export (PG→MySQL/MSSQL, Oracle→MySQL) produces SQL the target engine accepts — needs a type/default translation layer (roadmap).
- [ ] PNG/SVG visual check automated — currently only "no error" is asserted; files were not inspected.
