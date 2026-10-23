# Import from a database

OpenDiagram can read the structure of a **PostgreSQL**, **Oracle** or **MySQL** database and turn it into DBML. The DBML is regenerated from the live catalog, and you can keep editing it afterwards.

> **Important** Every session is opened **read-only** and only queries catalog views. Table data is never read. See [Security & TLS](database-security).

## Connect

1. Open **More → Database**.
2. Choose **PostgreSQL**, **Oracle** or **MySQL** and fill the host, port, database (for Oracle: the **service name**; for MySQL it is optional, because each MySQL database is a schema you pick after the test), user and password.
3. Choose the TLS mode if needed (see [Security & TLS](database-security#tls)).
4. Press **Test connection**. You get the list of schemas and any warnings about the privileges of the user. When it fails, the message says what went wrong in plain words (host not found, nothing answers on the port, no answer at all, wrong user or password, unknown database or service name, certificate not accepted, TLS not offered), with the database's own message in brackets.
5. **Save** keeps the connection for later. The password is stored encrypted and is never shown again.

![The connection form. A successful test lists the schemas of the database.](connection-form.jpg)

### MySQL

- **MySQL 8.0 and later** are supported and tested. **MariaDB 10.6 and later** work too (tried with MariaDB 11.4) but are not tested regularly; with MariaDB a view lists the columns it reads from each table, not a separate table-level line.
- The **schemas** you can tick are the databases the user can see (system databases are left out).
- An `enum('new','paid')` column becomes a DBML **enum** named after its table and column (`shop.orders_status`), and `AUTO_INCREMENT` becomes `increment`.
- **Triggers** are listed only when the user has the MySQL `TRIGGER` privilege, which a read-only user does not have: with a read-only user, triggers are not imported.

## Choose what to import

Tick the **schemas** to read. Below them, the **All tables — choose specific ones…** button opens a dialog:

- **Search** by text, with wildcards (`VW_*`, `LOG_??`) or as a regular expression (`/^vision_/`).
- Filter by **schema** and by **tables / views**, or show **selected only**.
- **Full DDL of views** (bottom of the dialog, only when the list has views): off by default, so a view comes in as its structure only; on, its `CREATE` statement is added to the note.
- **Select shown** and **Clear shown** act on the filtered list, so `VW_*` plus *Select shown* picks every view of a family.
- Nothing selected means **all tables** of the chosen schemas.

![The table picker: a wildcard search (`*order*`) finds tables and views.](table-picker.jpg)

The **Groups** tab of the same dialog lets you build [Table groups](table-groups) before importing. Each group has its own list of tables, independent from the import selection. Tables you put in a group are imported too.

Press **Import N schema(s) → diagram**. The DBML appears in the editor and the diagram is drawn. The connection stays linked to the diagram.

## What is imported

- **Tables**, columns (type, nullability, default), comments, primary keys, foreign keys (with `ON DELETE`; `ON UPDATE` for PostgreSQL) and indexes.
- **Auto-numbered columns** as `increment`: PostgreSQL `serial` and identity columns, Oracle identity columns, MySQL `AUTO_INCREMENT` (the sequence behind them is not written as a default).
- **Generated (computed) columns** with their expression in the column note, `GENERATED ALWAYS AS (net + vat) STORED` (or `VIRTUAL`), not as a default.
- **Partial indexes** (PostgreSQL) with their condition as the index note, `WHERE NOT paid`.
- **Views and materialized views**: drawn as tables with a **· View** / **· Mat. view** mark, with their resulting structure (columns, types, indexes). By default the SQL is **not** kept; tick **Full DDL of views** in the table picker to add the `CREATE VIEW` / `CREATE MATERIALIZED VIEW … AS …` statement to the table note. The choice is remembered for the refresh. In Oracle a materialized view also exists as a same-name table: it is shown once, as a view.
- **Data lineage** of views and materialized views (which tables they are built from, and which source column each output column comes from) as `// lineage(auto):` comment lines. See [Data lineage](data-lineage).
- **Enums** (PostgreSQL) as `Enum` blocks.
- **Sequences** (those that are not owned by a column, as a serial or identity column owns its own). A sequence that a table **uses** goes into the **note of that table**, in a `SEQUENCES` section (PostgreSQL: a column whose `DEFAULT` calls `nextval`, with the column named; Oracle: a trigger on the table, or a default, that reads `seq.NEXTVAL`). A sequence that none of the imported tables uses stays a standalone `Note`. Sequences used only inside functions or procedures cannot be linked: the catalog does not say which table they belong to.
- **Triggers** as text in the note of their table.
- **Check constraints** in a `checks { }` block of their table, each with its name (`` `price >= 0` [name: 'products_price_check'] ``), and listed under **Checks** in the [documentation](generated-documentation). Only checks the database enforces are read: Oracle's disabled checks and MySQL's `NOT ENFORCED` ones are left out, and so are Oracle's `NOT NULL` checks (the column already says `not null`) and the checks of PostgreSQL domains. PostgreSQL rewrites the expression in its own form (`kind in ('a', 'b')` comes back as `kind = ANY (ARRAY['a'::text, 'b'::text])`).
- **Partitioning** as one line in the note of the partitioned table: `PARTITIONED BY RANGE (created_at)`, the method and the key only, not the list of partitions. The partitions themselves are not imported and not listed in the table picker (in PostgreSQL each one is a table in the catalog, but it only repeats its parent).
- Multi-line comments are kept (they are written as multi-line notes).

Not imported: functions and procedures, the bounds of each partition.

## Keep it fresh

After an import the top bar shows a **↻** button with the connection name and when it was read. Press it to re-read the metadata. In the connection you can set an **automatic refresh** (every 5, 15, 30 minutes or hourly). It runs **on the server**, even when nobody has the diagram open: as the diagram's owner, only for a diagram linked to that connection, and it waits while someone is editing. Each change is saved as a history entry by *Scheduled refresh* that says what changed in the structure (*Refresh from database: 1 table added, 2 tables changed*), and the diagram's card in **More → Diagrams** tells the other people who use it at their next visit. After 5 failures in a row it pauses and the Database drawer shows the last error; **Refresh now** turns it back on.

A refresh keeps your **table groups**, **table positions** and the **data lineage lines you wrote by hand**. Tables that are new to the diagram (a refresh that finds new ones, or a second import into the same diagram) are placed below the ones you already have; **Arrange** lays out everything again. Other manual edits to imported tables are replaced by what the database says, by design.

> **Note** Importing again into a diagram also re-applies its current table groups, so you do not lose them.

## Tips for big databases

- Import by **group of tables** first (search + select shown), then add more later.
- Use [Detail levels](tables-panel-and-views#detail-levels) and [Saved views](tables-panel-and-views#saved-views) to look at part of it.
- Use the [Tables panel](tables-panel-and-views) to hide what you do not need.
