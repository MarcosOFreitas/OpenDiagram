# Release notes

OpenDiagram does not use version numbers yet; changes are listed from newest to oldest, grouped by theme.

## Faster first load

- The server sends the app's files compressed (brotli or gzip, about 1.6 MB instead of 16 MB) and the browser keeps them until the next update, so opening OpenDiagram again downloads almost nothing.

## Hide relationship lines

- **More → View → Hide relationship lines** hides every relationship line and keeps the tables; off by default, remembered in the browser and saved with each view. Data lineage arrows are separate.

## License

- OpenDiagram is now released under the **PolyForm Noncommercial License 1.0.0**: free to use for noncommercial purposes, and not to be sold, offered as a paid service or used in a commercial product or business. Earlier versions stay under the MIT License. See [License](license).

## Table selection, one rule

- The table selection is handled in one place now, and the table picker follows it everywhere: a first import opens with nothing ticked (= all tables); a diagram imported with all tables opens with **every table ticked** and says that tables the database gets later are imported too; applying it untouched keeps *all*. A diagram opens with **its own** selection even when other diagrams use the same connection.
- A table you chose that is no longer in the database is shown in the picker and in a message when you refresh, instead of silently importing fewer.
- A shared connection opened from the diagram that imported it keeps the schemas of that diagram (the Import button no longer says 0 schemas).

## Sequences next to their tables

- A sequence that a table uses is now written in that table's note (a `SEQUENCES` section, with the column on PostgreSQL), instead of a loose note. Sequences used by no imported table stay standalone notes. A refresh updates existing diagrams.
- Editing the connection of a diagram imported with all tables opens the table picker with every table ticked (it used to look empty), and starts from the diagram's own selection.

## Documentation

- New pages and sections: *Connect Claude (MCP)*, *Hosting requirements*, *Databases behind a VPN or a firewall* (Self-hosting), and FAQ entries on VPN, sequences, forgotten passwords and AI assistants. New pictures: Account, Groups, Agents and Settings.

## MCP connector for AI clients

- **Agents**: accounts for an AI client, created by an administrator (**Administration → Agents**), with tokens that are shown once, can expire and can be revoked. Off until **Settings → Agents** is switched on.
- An agent opens only the diagrams that were shared with it (view, comment or edit) and **never** sees a database connection or a credential. Tools: list, read, read comments, comment, and replace the DBML (with the version it read; every save is its own history entry).
- Every call is in **Sign-ins & connections → Agent calls**. See *Connect Claude (MCP)*.

## Hosting requirements and a clean stop

- New page **Hosting requirements**: memory, CPU, disk, network and browser costs, measured, with the scripts to repeat them (`server/bench.mjs`, `web/benchclient.mjs`).
- The server now stops cleanly on `docker stop` (about 1 second, exit code 0) instead of being killed after ten seconds.

## Sessions, sign-in log and closing an account

- **Account → Sessions**: see where you are signed in and end any session. Administrators can sign a person out everywhere, and set the session length and an inactivity limit.
- The **Audit log** is now two tabs: *Audit log* (administrator changes) and **Sign-ins & connections** (sign-ins, failed sign-ins, password changes, ended sessions, closed accounts and shared-connection use).
- **Delete my account**: the diagrams wait 7 days for an administrator, who can hand them to a person and a group, or delete them.
- **Recovery key** (Account → Recovery key): a key you keep that lets you choose a new password from the sign-in screen when you forget it, without an administrator and without e-mail.
- **Share links can expire**.
- Administration keeps the same size on every tab and shows a loading mark (two tables joined by a line) while a tab loads; its Settings and the Account panel use the same card layout.
- Sessions made before devices were recorded show their browser and address after their next use.
- The limit on failed sign-in attempts now survives a restart.

## Scheduled refresh on the server

- The automatic refresh no longer needs an open page: the server re-reads linked diagrams (every 5 minutes at the least), skips one that someone is editing, and saves each change as a **Refresh from database** entry by *Scheduled refresh*. Five failures in a row pause it and the Database drawer shows the error.
- The shortest interval is now 5 minutes (1 minute settings are raised to 5).

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
