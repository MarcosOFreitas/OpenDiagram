# Import & export

## Import from files

**More → Import** converts text you already have into a diagram. Pick the **format**, drop a `.sql`, `.txt` or `.dbml` file (or paste the text) and press **Convert to diagram**.

| Format | Notes |
|--------|-------|
| PostgreSQL SQL | `CREATE TABLE`, indexes and foreign keys |
| MySQL SQL | |
| SQL Server SQL | |
| Snowflake SQL | |
| Oracle SQL | tables, keys, indexes and comments (see the note below) |
| DBML | replaces the editor content |

Syntax problems are reported in a message. Importing replaces the whole diagram text, for every format; **More → History** can bring the previous text back.

> **Note** Oracle SQL files bring tables, keys, indexes and comments; views, sequences and triggers are skipped, and SQL*Plus lines such as `connect` must be removed first. For the whole schema, views included, use [Import from a database](database-import) (live import), which reads the catalog directly.

## Export

The **Export** menu in the top bar downloads the current diagram. The file name is the diagram title (spaces and special characters become `_`); SQL files add the dialect, for example `shop.oracle.sql`, and documentation files end in `-docs`.

| Group | Formats |
|-------|---------|
| **Image** | **PNG** and **SVG** of the whole diagram (every table fits, regardless of the zoom you are using; the background follows the theme) |
| **SQL** | **PostgreSQL**, **MySQL**, **SQL Server**, **Oracle** `CREATE` scripts generated from the DBML |
| **Other** | **DBML**, **JSON**, and the [documentation](generated-documentation) as **HTML** (standalone) or **Markdown** |
| | **Copy DBML to clipboard** |

> **Warning** SQL is generated in the target dialect from the DBML, but types and defaults that come from another engine (for example `nextval(...)` from PostgreSQL, or Oracle `NUMBER`) may need manual edits in another dialect. Round trips PostgreSQL → PostgreSQL and Oracle → PostgreSQL/SQL Server come back identical; other combinations are best-effort.

## Hidden tables and exports

Tables hidden from the diagram with the [Tables panel](tables-panel-and-views) are still part of the DBML, so they appear in the DBML, SQL, JSON and documentation exports. The **PNG** and **SVG** exports draw what you see.

## Views from a database

A database view is exported to SQL as a plain table (DBML has no view type). Its definition is in the table note only if **Full DDL of views** was ticked at import.
