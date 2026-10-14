# Release notes

OpenDiagram does not use version numbers yet; changes are listed from newest to oldest, grouped by theme.

## Data lineage

- **Dashed arrows** from the source to the table built from it, from the database (views and materialized views; columns in PostgreSQL) or written by hand as `// lineage:` comments.
- Lineage switch (dock and View), focus on a table (upstream violet, downstream teal), focus on an arrow, trace and filter in the Tables panel; hidden tables take their arrows with them.

## Versions and history

- **Edit conflicts are detected**: a save over someone else's newer version is refused and you choose to load theirs or keep yours.
- **History** (More → History): every saved version with author and summary, named versions, compare and restore.

## Documentation and interface

- **Documentation site** at `/docs` (More → Documentation) replaces the Help drawer, with search, sidebar and *On this page* index.
- Lighter top bar: **Export** menu, and rarely used actions under **More**. Clicking a TableGroup puts it in focus.
- The sample model is in English ("Online store - sample").
- Screenshots in the pages and DBML syntax colours; the algorithm menu of Arrange now closes when you click elsewhere.

## Diagram

- **Saved views** and **detail levels** (Keys / Tables / full).
- Draggable relationship labels and TableGroup boxes; views keep the table colour and show a **· View** suffix.
- **Tables panel** (`Ctrl+K`): search, group by, hide tables, jump to a table.
- Choose the **Arrange** algorithm (Auto, Left to right, Pipeline, Snowflake, Compact); every algorithm treats TableGroups as blocks.
- Highlight the relationships of the selected table; lines use the nearest sides.
- Resize and collapse tables; column names take priority over types.

## Import

- Table picker dialog with TableGroups, wildcard and regex selection.
- Import of **views, materialized views, enums, sequences and triggers** (Oracle materialized views included).
- Multi-line comments and defaults no longer break the generated DBML.
- Oracle TLS with certificate verification checked against an Oracle Autonomous Database.

## Sharing

- Optional **password on share links**.
- Accounts, administration, groups and sharing with people, groups and links.

## First release

DBML editor with live diagram, live import from PostgreSQL and Oracle with read-only sessions, generated documentation with comments.
