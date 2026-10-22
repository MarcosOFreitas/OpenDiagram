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
| Oracle SQL | ✅ tables, keys, indexes, comments (`@dbml/core` 10; views, sequences and triggers skipped; SQL*Plus lines fail) | ✅ | the live import also reads views, sequences and triggers |
| JSON | ❌ does not round-trip | ✅ | `@dbml/core` json/jsonv2 import is unusable for its own export |
| PNG / SVG | — | ✅ | background follows theme; file name = diagram title |
| Documentation | — | ✅ `.html` standalone, `.md` | see [08](08-documentation.md) |
| Live DB | PostgreSQL, Oracle | — | see [03](03-connections-import.md) |

## Round-trip results (demo DBs, `web/roundtrip.mjs`)

DB → DBML → export → re-import → compare columns/types/PK/NOT NULL/index count/refs.

| Source ↓ / format → | PG | MySQL | MSSQL | Oracle | JSON |
|---------------------|----|-------|-------|--------|------|
| Postgres demo (+ views, enum, sequence, trigger) | identical¹ | fails | fails | export only | fails |
| Oracle demo | identical¹ | fails | identical¹ | export only | fails |

¹ after normalizing type aliases (`timestamp without time zone`≡`timestamp`, `character varying`≡`varchar`) and ref direction (the exporter flips endpoint order).

Failures are cross-dialect issues, not parser bugs: PG defaults (`nextval(...::regclass)`), `character varying`, Oracle `NUMBER`, etc. are not valid in the target dialect.

## Objects without a DBML type

DBML has `Table`, `Enum` and `Note` only; `toDbml` stays the single generator and maps live-import objects like this:

| Object | DBML |
|--------|------|
| View / materialized view | `Table` (default header colour) with `note` = comment + `VIEW` / `MATERIALIZED VIEW` + SQL definition; columns as usual, no PK/refs. Shows in the diagram and docs; the diagram header adds "· View" / "· Mat. view" after the name (detected from the note; the grey `headercolor: #94a3b8` that older imports wrote is ignored for views). |
| Enum | native `Enum schema.name { … }`; columns typed with it link to it |
| Trigger | text in the note of its table/view: `TRIGGERS` + `name: definition` |
| Sequence | a `SEQUENCES` section in the note of each table that uses it (column default, trigger); a sequence no imported table uses is a standalone `Note "schema.name" { ''' SEQUENCE … ''' }` (not drawn as a sticky) |

Multi-line notes (including multi-line column/table comments from the database) use `'''…'''`; newlines inside a default expression are collapsed to a space. Consequence: SQL/JSON **export** emits views as plain tables.

## Acceptance criteria

- [x] All export buttons produce a file without error for the sample and demo diagrams.
- [x] Importing valid PG SQL via paste creates tables and refs; invalid SQL shows `line N: …` in a toast.
- [x] PG→PG and Oracle→{PG, MSSQL} round-trips are identical (per criteria above).
- [ ] Cross-dialect export (PG→MySQL/MSSQL, Oracle→MySQL) produces SQL the target engine accepts — needs a type/default translation layer (roadmap).
- [ ] PNG/SVG visual check automated — currently only "no error" is asserted; files were not inspected.
