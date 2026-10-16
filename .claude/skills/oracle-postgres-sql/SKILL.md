---
name: oracle-postgres-sql
description: Use when writing, reading, porting or tuning SQL for Oracle (19c/23ai, including Autonomous Database) or PostgreSQL (15+), inspecting a schema through the catalog, reading an execution plan, writing driver code with bind variables, or loading data in batches. Gatilhos (pt): escrever query, otimizar query, plano de execução, Oracle vs Postgres, migrar SQL, carga em lote, consultar catálogo.
---

# Oracle and PostgreSQL SQL

Read the project's AGENTS.md / CLAUDE.md first; its rules about databases win. Equivalents and syntax lookup: [dialects.md](dialects.md). Anything marked "verify" depends on your version: check it, do not assert it.

## Read-only by default

- **Open a read-only session first, before any statement.** Oracle: `SET TRANSACTION READ ONLY` as the first statement of the transaction (not supported for SYS). PostgreSQL: `BEGIN READ ONLY` or `SET default_transaction_read_only = on`, plus `SET LOCAL statement_timeout`. If the driver or the account cannot do this, STOP and tell the user; do not continue without it.
- **Oracle: the read-only setting ends with every `COMMIT` or `ROLLBACK`.** Re-issue `SET TRANSACTION READ ONLY` as the first statement of each new transaction (drivers with autocommit off start a new one silently), and never commit inside a read-only task.
- **Best first layer: a database account that can only `SELECT` and read the catalog.** When the task is read-only, ask the user for such an account (or which one to use) instead of relying on session settings and on your own discipline.
- Read-only session is only a second layer: PostgreSQL read-only still allows temporary tables and does not stop every side effect (network, advisory locks, sequences). The third layer is what you choose to run.
- Run only `SELECT`, catalog queries and plain PostgreSQL `EXPLAIN`. Anything else (DDL, DML, `TRUNCATE`, `DROP`, `ALTER`, `GRANT`, stats gathering, `COMMIT`) is shown to the user as text and runs only after an explicit yes for that statement.
- **Needs a yes for that exact statement even when it starts with `SELECT` or `WITH`:**
  - `SELECT ... FOR UPDATE` and `LOCK TABLE`.
  - Functions with side effects inside a SELECT. Oracle: `UTL_HTTP`, `UTL_INADDR`, autonomous-transaction functions, `DBMS_*` packages. PostgreSQL: `pg_terminate_backend`, `dblink_exec`, `lo_import`, `nextval`, `set_config`, advisory locks.
  - Data-modifying CTEs (`WITH ... DELETE/INSERT/UPDATE ... RETURNING`), `SELECT INTO`, `CREATE TABLE AS`.
  - `EXPLAIN ANALYZE` of anything that calls a volatile function or writes.
  - PL/SQL blocks, `CALL`, `EXEC`, `COPY ... PROGRAM`.
- Prefer the catalog and plans over table data: structure from `ALL_*` / `pg_catalog`, row counts from statistics (`NUM_ROWS`, `reltuples`; approximate; `reltuples` is -1 before the first VACUUM/ANALYZE on PostgreSQL 14+), then plans. When you must read rows, use `FETCH FIRST n ROWS ONLY`, name the columns, and avoid personal or sensitive columns.
- Never put secrets in SQL text, logs, plans or your output: credentials, wallet passwords and connection strings come from the environment or the project's secret store. For Autonomous over TLS, use the wallet or TLS connect string the owner already has; do not print it.

## Bind variables, always

Values go in as binds, never concatenated or f-stringed: injection, and in Oracle also a hard parse per distinct text (shared pool churn).
- python-oracledb / node-oracledb: `:name` or `:1`. psycopg: `%s` / `%(name)s` (placeholders, not Python formatting). node-pg: `$1`.
- Identifiers (table, column, sort direction) cannot be bound: prefer an allowlist of known identifiers, or quote with the driver helper (`psycopg.sql.Identifier`). Oracle `DBMS_ASSERT.SIMPLE_SQL_NAME` checks syntax only: not length, not existence, and anything is accepted inside double quotes.
- IN-lists: PostgreSQL `= ANY(%s)` with an array; Oracle needs one placeholder per value (or a collection type).

## Reading a plan

- Oracle: `EXPLAIN PLAN FOR <stmt>` then `SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY)`. EXPLAIN PLAN is DML into `PLAN_TABLE` and fails in a read-only transaction: run it outside the read-only transaction and roll back (a write that needs a yes), or prefer `DBMS_XPLAN.DISPLAY_CURSOR` on a statement that already ran. Estimated vs actual rows need the statement to have run with the `gather_plan_statistics` hint (or `STATISTICS_LEVEL=ALL`); the hint does not execute anything by itself.
- PostgreSQL: `EXPLAIN` estimates only. **`EXPLAIN (ANALYZE, BUFFERS)` executes the statement**: never on `INSERT/UPDATE/DELETE/MERGE`, and not on a heavy `SELECT` without a yes.
- Read for: estimated vs actual rows off by 10x or more (stale or missing statistics), full scans on large tables, nested loops over big inputs, sorts spilling to disk.

## Index and statistics pitfalls

- A function on an indexed column (`TRUNC(d)`, `UPPER(c)`, `d::date`) blocks the index: rewrite as a range, or create a function-based / expression index (needs a yes).
- Implicit conversion: comparing a VARCHAR2/text column to a number makes the engine convert the column side and skip the index. Match types.
- Oracle B-tree indexes do not store rows where all indexed columns are NULL, so `IS NULL` may scan (a composite index stores the row if any column is non-null); PostgreSQL indexes NULLs.
- CTEs: PostgreSQL 12+ inlines a non-recursive CTE only if it is side-effect free and referenced once; referenced twice or more it is materialized unless `NOT MATERIALIZED`. Oracle `MATERIALIZE` / `INLINE` hints are undocumented: verify on your version.
- Stale statistics explain most "it got slow overnight" plans. Gathering them (`DBMS_STATS`, `ANALYZE`) changes the catalog: propose, do not run.
- `OFFSET` on deep pages rescans; use keyset pagination when it matters.

## Batch loads

- Never one round trip per row. Oracle: `executemany` / `executeMany` array binding (use `batcherrors` / `batchErrors` to collect bad rows). PostgreSQL: `COPY` (psycopg `cursor.copy`) for bulk, multi-row `INSERT` otherwise.
- Commit in batches sized to undo/WAL limits, not per row and not once for millions.
- Make reruns idempotent: `MERGE` (Oracle, PostgreSQL 15+) or `ON CONFLICT` (PostgreSQL, needs a unique index), or load into a staging table and replace by batch key. State the key you assumed.

## Catalog queries

Oracle: `ALL_TAB_COLS` also shows system-generated hidden columns (`HIDDEN_COLUMN`, `USER_GENERATED`) that `ALL_TAB_COLUMNS` omits; user virtual columns appear in both. Also `ALL_CONSTRAINTS` + `ALL_CONS_COLUMNS`, `ALL_INDEXES` + `ALL_IND_COLUMNS`, `ALL_TAB_COMMENTS` / `ALL_COL_COMMENTS`. `ALL_*` shows only what the user may see; `DBA_*` needs privileges. PostgreSQL: `pg_catalog` is complete (`pg_attribute` with `attnum > 0 AND NOT attisdropped`, `pg_constraint`, `pg_index`, `pg_description`); `information_schema` is portable but hides objects without privileges. Filter system schemas.

## Transactions

Oracle DDL commits implicitly (before and after) and cannot be rolled back; `TRUNCATE` is DDL. PostgreSQL DDL is transactional, `TRUNCATE` included; exceptions such as `CREATE INDEX CONCURRENTLY` and `VACUUM` cannot run inside a transaction block. python-oracledb, node-oracledb and psycopg 3 start transactions implicitly with autocommit off by default (verify in your version): an unfinished transaction holds locks. node-postgres opens no transaction unless you `BEGIN`: each query commits on its own, so send `BEGIN READ ONLY` on one client yourself.

When porting a query, check the table in dialects.md for each item it uses before declaring it equivalent, and say which engine and version you did not test.

<!-- Original skill. Ideas on scope (query optimization, schema exploration, dialect awareness) from alirezarezvani/claude-skills sql-database-assistant and database-designer (MIT licence found; no text copied). -->
