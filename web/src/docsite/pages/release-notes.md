# Release notes

## 1.0.0

The first release, and the last planned one: OpenDiagram is **feature-complete**. The repository stays open (issues and pull requests are welcome and read on a best-effort basis), there is no promised support, and forks are encouraged. The image is `ghcr.io/marcosoliveira-intelicity/opendiagram:1.0.0` (amd64 and arm64). Below it, the changes that led to it, newest first, grouped by theme.

**Not tested**, so try it before you rely on it:

- Oracle TLS with a certificate from a real private CA (tested: the demo TLS proxy, and an OCI Autonomous Database with a public CA); Oracle wallets are not supported.
- MySQL TLS against a real cloud endpoint, and `verify` with a private CA (tested: `off`, `noverify` and a failing `verify` against the demo server's own certificate).
- MariaDB outside one manual try with 11.4 (it is not in the automated tests).
- The Oracle import in the automated end-to-end run (it is tried by hand and in `roundtrip.mjs`).
- Importing a very large schema (hundreds of tables) from a real PostgreSQL or Oracle server, the scheduled refresh with many linked diagrams, refreshes during a 150-person peak, and a server shared by several organizations.
- Browsers other than Chrome: the automated interface audit runs in Chrome only. No screen reader, Windows high-contrast or tablet pass either.
- A penetration test against a running instance, and PostgreSQL TLS against a cloud endpoint.

## Hardening before 1.0

Four independent reviews read the whole project before the release (the code and its security, the documentation against the behaviour, a newcomer setting it up, every open item). Fixed:

- A request to the API with a percent-encoded path (`/%61pi/...`) skipped the sign-in, Origin and password-change checks. Every check now uses the route that matched.
- A database server that accepted the sign-in and then hung up could stop the whole app. Now only that request fails.
- With `DB_HOST_POLICY=public-only`, a private IPv6 address written another way (`0::1`, or `127.0.0.1` in hex inside IPv6) was accepted. Every spelling is refused now.
- A saved CA certificate is at most 64 KB. MySQL connections get the CA certificate field (with TLS *verify certificate*), as PostgreSQL had.
- The daily backups show in **Administration → Audit log**.
- The documentation was checked against the code page by page, with a test for every link. There is a **For developers** section for whoever carries the project on.

## Changed since you last opened it

- A refresh from the database now says what changed in the structure, in its history entry and in its message: *Refresh from database: 1 table added, 2 tables changed*. The scheduled refresh writes the same words in the audit log.
- **More → Diagrams** marks a diagram that someone else (a person, an agent or the scheduled refresh) changed since you last opened it. People who can edit also see the latest change, who made it, when, and how many there were; people who can only view or comment see the mark alone. Opening the diagram clears it.
- Fixed: editing right after a manual refresh merged your edits into the refresh's own history entry, so its summary was lost; your edits now start a new entry.

## Less memory for refreshes and agents

- The server reads DBML with a lighter parser: it no longer loads the SQL parsers of every database (about 300 MB of memory) for a scheduled refresh or an agent's save. See [Hosting requirements](hosting-requirements).

## What changed between two versions

- **History → Compare** now starts with the structure: a one-line summary and the changes table by table (columns and their type, nullability, default, keys, indexes, relationships, checks, enums, notes), above the text diff. See [Versions & history](versions-and-history).

## Faster first visit

- The first visit downloads about 0.4 MB instead of 1.6 MB: the SQL import and export tools, most of the old download, now load only when someone imports or exports SQL.

## Richer import

- Auto-numbered columns (PostgreSQL serial and identity, Oracle identity) come as `increment`, generated columns with their expression in the column note, PostgreSQL partial indexes with their `WHERE`. PostgreSQL partitions are no longer listed or imported: their parent says how it is partitioned.

## Automatic backups

- Set `BACKUP_DIR=backups` and the app keeps a copy of its database per day (7 days by default, `BACKUP_KEEP_DAYS`), restorable with the same `restore` command. See [Self-hosting](self-hosting#backup-and-moving-to-another-machine).

## Fixes

- MySQL with TLS *verify certificate* now also checks that the certificate names the host, as the documentation says; before, only the chain was checked.
- The editor's find bar (`Ctrl+F`) is one row in the app's style: a match count ("2 of 12"), `Enter` / `Shift+Enter` for the next and previous match, and Replace on demand.
- An account without diagrams (a new one, or after deleting the last) shows **No diagrams yet** with a blank diagram and the templates; the sample is no longer created on its own.
- A second import into a diagram (or new tables found by a refresh) no longer puts the new tables on top of the ones already placed: they go below them. A view's mark (**· Mat. view**) no longer cuts off the table name.
- A relationship line whose label was dragged keeps the chosen line style (Rounded, Step, Straight) instead of turning into a curve.

## Check constraints and partitioning

- The live import (PostgreSQL, Oracle and MySQL) now reads **check constraints**, written in a `checks { }` block of the table with their names, and says how a table is **partitioned** in its note (`PARTITIONED BY RANGE (created_at)`). The generated documentation lists the checks of each table. See [Import from a database](database-import#what-is-imported).

## Import from MySQL

- **More → Database → MySQL** reads a MySQL 8.0+ database live, with the same guarantees as PostgreSQL and Oracle: a read-only session, warnings for a user that can do more than read, TLS. Enum columns become DBML enums. MariaDB 10.6+ should work too (not tested regularly). See [Import from a database](database-import#mysql).

## Smoother large diagrams

- A diagram with table groups no longer keeps the browser busy while nothing happens, and moving around the canvas no longer redraws the whole page: with 100 tables zooming went from about 13 to about 80 frames per second, an idle page from 20 to the screen's full rate, and the diagram follows a keystroke in about a quarter of a second instead of half a second.

## Finding diagrams

- **More → Diagrams** gets a search box (name or owner), a sort by name or by last change and a filter for the diagrams linked to a database, once you have more than eight. Deleting asks in the card itself; very long titles take two lines.

## Safer agent tokens

- A new agent token expires after **90 days** unless you choose another length or *Never expires* on purpose. Tokens made before keep their expiry.

## Import Oracle SQL files

- **Import** now reads Oracle SQL: tables, keys, indexes and comments. Views, sequences and triggers are skipped (the live import reads them).

## Display options next to the diagram

- The display options moved from **More → View** to a **Display** tab in the side panel of the diagram, next to **Tables**: you see the effect while you change them, and the saved view above the tabs covers both.
- Light and dark is now one click: the **sun/moon** button in the top bar (on a phone, in the **More** menu). Wrapping long lines is a button in the editor's status bar.

## Backup and restore from the command line

- `node src/cli.js backup` makes a consistent copy of all the data while the app keeps running, and `restore` brings one back (it refuses while the app is running). See [Self-hosting](self-hosting).

## Safer container

- The container runs as the unprivileged user `node` and reports its health to Docker. **Updating an existing installation:** hand the data volume over once, see [Self-hosting](self-hosting) (*Updating*).
- Every tag `v*` publishes the image for amd64 and arm64 (ARM servers and Apple Silicon included).

## Faster first load

- The server sends the app's files compressed (brotli or gzip, about 1.6 MB instead of 16 MB) and the browser keeps them until the next update, so opening OpenDiagram again downloads almost nothing.

## Hide relationship lines

- **Hide relationship lines** (now in the **Display** tab of the side panel) hides every relationship line and keeps the tables; off by default, remembered in the browser and saved with each view. Data lineage arrows are separate.

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

- New page **Hosting requirements**: memory, CPU, disk, network and browser costs, measured, with the scripts to repeat them (`tools/bench.mjs`, `tools/benchclient.mjs`).
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
