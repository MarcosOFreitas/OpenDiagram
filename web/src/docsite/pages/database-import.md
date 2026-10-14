# Import from a database

OpenDiagram can read the structure of a **PostgreSQL** or **Oracle** database and turn it into DBML. The DBML is regenerated from the live catalog, and you can keep editing it afterwards.

> **Important** Every session is opened **read-only** and only queries catalog views. Table data is never read. See [Security & TLS](database-security).

## Connect

1. Open **More → Database**.
2. Choose **PostgreSQL** or **Oracle** and fill the host, port, database (for Oracle: the **service name**), user and password.
3. Choose the TLS mode if needed (see [Security & TLS](database-security#tls)).
4. Press **Test connection**. You get the list of schemas and any warnings about the privileges of the user.
5. **Save** keeps the connection for later. The password is stored encrypted and is never shown again.

## Choose what to import

Tick the **schemas** to read. Below them, the **All tables — choose specific ones…** button opens a dialog:

- **Search** by text, with wildcards (`VW_*`, `LOG_??`) or as a regular expression (`/^vision_/`).
- Filter by **schema** and by **tables / views**, or show **selected only**.
- **Select shown** and **Clear shown** act on the filtered list, so `VW_*` plus *Select shown* picks every view of a family.
- Nothing selected means **all tables** of the chosen schemas.

The **Groups** tab of the same dialog lets you build [Table groups](table-groups) before importing. Each group has its own list of tables, independent from the import selection. Tables you put in a group are imported too.

Press **Import**. The DBML appears in the editor and the diagram is drawn. The connection stays linked to the diagram.

## What is imported

- **Tables**, columns (type, nullability, default), comments, primary keys, foreign keys (with `ON DELETE` / `ON UPDATE`) and indexes.
- **Views and materialized views**: drawn as tables with a **· View** / **· Mat. view** mark; the SQL definition is kept in the table note. In Oracle a materialized view also exists as a same-name table: it is shown once, as a view.
- **Enums** (PostgreSQL) as `Enum` blocks.
- **Sequences** (those that are not owned by a column) as standalone `Note` blocks.
- **Triggers** as text in the note of their table.
- Multi-line comments are kept (they are written as multi-line notes).

Not imported yet: check constraints, partitions, functions and procedures.

## Keep it fresh

After an import the top bar shows a **↻** button with the connection name and when it was read. Press it to re-read the metadata. In the connection you can set an **automatic refresh** (every 1, 5, 15, 30 minutes or hourly); it runs while the page is open.

A refresh keeps your **table groups** and **table positions**. Other manual edits to imported tables are replaced by what the database says, by design.

> **Note** Importing again into a diagram also re-applies its current table groups, so you do not lose them.

## Tips for big databases

- Import by **group of tables** first (search + select shown), then add more later.
- Use [Detail levels](tables-panel-and-views#detail-levels) and [Saved views](tables-panel-and-views#saved-views) to look at part of it.
- Use the [Tables panel](tables-panel-and-views) to hide what you do not need.
