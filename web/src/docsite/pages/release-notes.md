# Release notes

OpenDiagram does not use version numbers yet; changes are listed from newest to oldest, grouped by theme.

## Audit log filters and view DDL

- The **Audit log** can be filtered by who did it, by target (a shared database, a diagram, users, groups, settings) and by type of operation (added, changed, deleted, tested, listed tables, imported, refreshed); the CSV follows the filters.
- **Full DDL of views** in the table picker: off by default (views come in as their structure only), on adds the `CREATE VIEW` / `CREATE MATERIALIZED VIEW` statement to the note; refresh remembers it.

## Docs, Oracle and cleanup

- The Docs view has a **Changelog** (the saved versions, for people who can edit); the exports carry the named versions.
- Oracle: no wallets (a connection string over TLS only); `verify`, expected DN and `noverify` are tested against a TLS proxy.

## Shared connections and audit log

- Administrators register **shared database connections** (read-only credential) for people and groups; members use them without seeing the secret, and editors with access to the connection can refresh linked diagrams.
- An **audit log** (180 days, filters, CSV) of the use of shared connections and of every administrator action.

## Presence

- Avatars of the people who have the diagram open, with what they look at or edit, an outline on the table they selected, and a bar when someone saved a newer version.

## Sticky notes

- Top-level `Note` blocks are drawn as **sticky notes** on the diagram: add, edit by double-click, move, resize, delete and hide them; they live in the DBML text.

## Data lineage

- **Dashed arrows** from the source to the table built from it, from the database (views and materialized views; columns in PostgreSQL) or written by hand as `// lineage:` comments.
- **Column lineage of views**: the SQL of each view is read and every output column is mapped to the source columns it comes from; the arrows go from column to column.
- Lineage takes part in **Arrange** (derived tables to the right of their sources) and appears in the **Docs** view and the HTML/Markdown exports (*Built from* and *Feeds*); labels read *uses N cols*.
- Lineage switch (dock and View), focus on a table (upstream violet, downstream teal), focus on an arrow, trace and filter in the Tables panel; hidden tables take their arrows with them.

## Versions and history

- **Edit conflicts are detected**: a save over someone else's newer version is refused and you choose to load theirs or keep yours.
- **History** (More → History): every saved version with author and summary, named versions, compare and restore.

## Documentation and interface

- **Documentation site** at `/docs` (More → Documentation) replaces the Help drawer, with search, sidebar and *On this page* index.
- Lighter top bar: **Export** menu, and rarely used actions under **More**. Clicking a TableGroup puts it in focus.
- The sample model is in English ("Online store - sample").
- Interface polish: one control look, visible focus rings, keyboard and dialog handling, dark-theme fixes, larger touch targets, phone layout, aligned dock icons.
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
- Every metadata refresh gets its own history entry.
- Accounts, administration, groups and sharing with people, groups and links.

## First release

DBML editor with live diagram, live import from PostgreSQL and Oracle with read-only sessions, generated documentation with comments.
