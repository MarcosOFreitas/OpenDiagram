# Generated documentation

The **Docs** switch in the top bar turns the same DBML into a browsable documentation page of your database, in the spirit of dbdocs. Nothing needs to be written twice: it is generated from the diagram.

## What it shows

- An **overview** with counts (tables, relationships, enums, groups) and the list of all relationships.
- One card per **table**: columns with type, constraints (primary key, not null, unique), default, references, notes, the indexes, and the tables that reference it.
- **Data lineage**, when the diagram has it: a table in the overview and, on each table, **Built from** (with the columns used) and **Feeds**, with links. See [Data lineage](data-lineage).
- A **Changelog** of the diagram for people who can edit it: every saved version with its name, author, date and what changed, as in [History](versions-and-history).
- **Enums** with their values.
- The sidebar lists the tables **by table group** (with the group color), then ungrouped tables and enums.

![The Docs view: overview with counts and relationships; the sidebar lists tables by group.](docs-view.jpg)

![The Docs view: the Changelog at the top and, on each table, Feeds and Referenced by.](docs-changelog.jpg)

## Reading it

- **Search** in the sidebar filters by table name, schema or any column name.
- Every table is a collapsible card: click its header to collapse or expand it, or use **Expand all / Collapse all**. The state is remembered.
- Links between tables jump to the target and open it if it was collapsed.
- The sidebar can be **hidden** with the ‹ button on its edge and **resized** by dragging its edge (double-click resets). The choice is remembered in your browser.

## Comments

Documentation is not only generated text. Under the overview, on each table and each column you can click **+ Add comment** to write your own note. Comments are stored by OpenDiagram (not in the database or the DBML), show who wrote them and when, and follow the [sharing permissions](accounts-and-sharing): people with *comment* access or more can add them, and you can delete your own (the owner and administrators can delete any). `Ctrl+Enter` posts the comment.

## Export

The exported files carry only the **named versions** in their changelog (the releases you marked on purpose), not every saved edit, because an exported file can be passed around.

**Export → Documentation (HTML)** downloads **one self-contained `.html` file** (inline styles and a small search script, no network requests) that you can host anywhere or attach to an email. It follows the dark mode of the reader's system, is print-friendly and includes the comments read-only. **Documentation (Markdown)** gives a `.md` version.

> **Tip** The exported file contains your schema and comments. Treat it like the diagram itself when sharing it outside your organization.
