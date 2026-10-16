# Oracle vs PostgreSQL: lookup

Oracle 19c/23ai, PostgreSQL 15+. "verify" = depends on version or setting; check before asserting.

## Identifiers
| Topic | Oracle | PostgreSQL |
|---|---|---|
| Unquoted name folds to | UPPER | lower |
| Quoted name | exact case, quoted forever | same |
| Max length | 128 bytes (12.2+, needs COMPATIBLE >= 12.2; limit is bytes) | 63 bytes |
| String literal | `'x'` only | `'x'`, `E'..'`, dollar quoting |

Mixed-case names created with quotes (common in tools) need quotes in every query.

## NULL, empty string, booleans, division
| Topic | Oracle | PostgreSQL |
|---|---|---|
| `''` | is NULL (VARCHAR2/CHAR) | empty string, not NULL |
| NULL concatenated with 'a' | `'a'` | NULL |
| BOOLEAN column | 23ai yes; 19c no (NUMBER(1) or CHAR(1)) | yes |
| `1/2` | 0.5 (NUMBER) | 0 (integer division) |
| First non-null | `NVL(a,b)`, `NVL2`, `COALESCE` | `COALESCE` |
| NULL-safe compare | `DECODE(a,b,1,0)` or `a=b OR (a IS NULL AND b IS NULL)` | `a IS NOT DISTINCT FROM b` |

## Dates and time
| Topic | Oracle | PostgreSQL |
|---|---|---|
| `DATE` type | date + time to the second, no zone | date only |
| Date + time | `DATE` / `TIMESTAMP` | `timestamp` / `timestamptz` |
| Now | `SYSDATE`, `SYSTIMESTAMP`, `CURRENT_TIMESTAMP` | `now()`, `CURRENT_TIMESTAMP` |
| Truncate | `TRUNC(d)`, `TRUNC(d,'MM')` | `date_trunc('month', ts)` |
| Add days / months | `d + 1`, `ADD_MONTHS(d,1)` | `d + 1` (date), `ts + interval '1 month'` |
| Difference | `d1 - d2` = days (number) | date - date = integer days; ts - ts = interval |
| Parse / format | `TO_DATE`, `TO_TIMESTAMP`, `TO_CHAR(d,'YYYY-MM-DD')` | `to_date`, `to_timestamp`, `to_char` (masks mostly alike; verify edge ones) |
| Literal | `DATE '2025-01-31'`, `TIMESTAMP '...'` | `DATE '...'`, `'...'::timestamptz` |

## Limiting rows and paging
| Topic | Oracle | PostgreSQL |
|---|---|---|
| Top N | `FETCH FIRST n ROWS ONLY` (12c+) | `LIMIT n` or `FETCH FIRST n ROWS ONLY` |
| Skip | `OFFSET m ROWS FETCH NEXT n ROWS ONLY` | `LIMIT n OFFSET m` |
| `ROWNUM` | assigned before `ORDER BY`: `WHERE ROWNUM<=n` on an unsorted query is not "top n"; sort in a subquery first | n/a |
| Ties | `FETCH FIRST n ROWS WITH TIES` (12c+; needs `ORDER BY`) | same (13+; needs `ORDER BY`) |
| No FROM | `SELECT 1 FROM DUAL`; FROM-less SELECT in 23ai | `SELECT 1` |

Always add a deterministic `ORDER BY` when paging.

## Sequences and identity
| Topic | Oracle | PostgreSQL |
|---|---|---|
| Identity column | `GENERATED [ALWAYS / BY DEFAULT [ON NULL]] AS IDENTITY` (12c+) | `GENERATED ALWAYS / BY DEFAULT AS IDENTITY` (10+); `serial` is legacy |
| Next value | `seq.NEXTVAL`, `seq.CURRVAL` | `nextval('seq')`, `currval('seq')` |
| Returned id | `RETURNING id INTO :out` (out bind) | `RETURNING id` |
| Gaps | possible; rollback does not return values | same |

## Strings and aggregation
| Topic | Oracle | PostgreSQL |
|---|---|---|
| Substring | `SUBSTR(s,start,len)` | `substr`, `substring(s from 2 for 3)` |
| Position | `INSTR(s,sub)` | `strpos(s,sub)`, `position(sub in s)` |
| Join values | `LISTAGG(x, ',') WITHIN GROUP (ORDER BY x)`; over 4000 bytes raises ORA-01489 (`ON OVERFLOW TRUNCATE` from 12.2) | `string_agg(x, ',' ORDER BY x)` |
| Regex | `REGEXP_LIKE`, `REGEXP_SUBSTR` | `~`, `regexp_match`, `substring(s from re)` |
| Case-insensitive match | `UPPER(a)=UPPER(b)`, `REGEXP_LIKE(..,'i')` | `ILIKE`, `lower()` |
| Set difference | `MINUS` (19c: MINUS only; `EXCEPT` from 21c) | `EXCEPT` |

## Upsert, CTE, joins
| Topic | Oracle | PostgreSQL |
|---|---|---|
| Upsert | `MERGE INTO t USING s ON (..) WHEN MATCHED THEN UPDATE .. WHEN NOT MATCHED THEN INSERT ..` | `INSERT .. ON CONFLICT (cols) DO UPDATE SET c = EXCLUDED.c` (needs unique index) |
| MERGE | all supported versions | 15+; `RETURNING` on MERGE only in 17+ (verify) |
| Recursive CTE | `WITH cte (cols) AS (..)`, no `RECURSIVE` keyword | `WITH RECURSIVE` |
| CTE materialization | optimizer decides (`MATERIALIZE` / `INLINE` are undocumented hints: verify on your version) | 12+ inlines a non-recursive CTE only if side-effect free and referenced once; otherwise materialized unless `NOT MATERIALIZED` |
| Hierarchies | `CONNECT BY` / `START WITH` | recursive CTE |
| Anti-join NULL trap | `NOT IN` with a NULL in the subquery returns no rows; prefer `NOT EXISTS` | same |
| Outer join | ANSI `LEFT JOIN`; do not write new `(+)` | ANSI |

## Types
| Concept | Oracle | PostgreSQL |
|---|---|---|
| Text | `VARCHAR2(n [BYTE/CHAR])`, `CLOB` | `text`, `varchar(n)` |
| Number | `NUMBER(p,s)` | `numeric(p,s)`, `integer`, `bigint` |
| Binary | `RAW`, `BLOB` | `bytea` |
| JSON | `JSON` type (21c+), or VARCHAR2/CLOB + `IS JSON` | `jsonb` |
| UUID | `RAW(16)` + `SYS_GUID()` (not a random RFC 4122 UUID) | `uuid`, `gen_random_uuid()` |

## Catalog quick map
| Need | Oracle | PostgreSQL |
|---|---|---|
| Tables | `ALL_TABLES` | `pg_class` (`relkind='r'`), `information_schema.tables` |
| Columns | `ALL_TAB_COLS` (also system-generated hidden columns; user virtual columns are in both), `ALL_TAB_COLUMNS` | `pg_attribute`, `information_schema.columns` |
| Constraints | `ALL_CONSTRAINTS`, `ALL_CONS_COLUMNS` | `pg_constraint` |
| Indexes | `ALL_INDEXES`, `ALL_IND_COLUMNS` | `pg_index`, `pg_indexes` |
| Comments | `ALL_TAB_COMMENTS`, `ALL_COL_COMMENTS` | `pg_description`, `obj_description()`, `col_description()` |
| View SQL | `ALL_VIEWS.TEXT` (LONG) | `pg_get_viewdef(oid)` |
| Approx rows | `ALL_TABLES.NUM_ROWS` | `pg_class.reltuples` (-1 before the first VACUUM/ANALYZE on 14+) |
| Identity cols | `ALL_TAB_IDENTITY_COLS` | `pg_attribute.attidentity` |

## Driver bind syntax and transactions
| Driver | Placeholder | Notes |
|---|---|---|
| python-oracledb | `:name`, `:1` | `executemany`; autocommit off by default |
| node-oracledb | `:name`, `:1` | `executeMany`; `autoCommit` off by default |
| psycopg 3 | `%s`, `%(name)s` | `cursor.copy()` for COPY; transaction opens implicitly |
| node-pg | `$1`, `$2` | one statement per query with params; no transaction unless you `BEGIN`, each query commits |
