# Tables panel, views and detail levels

Large databases are hard to read all at once. These tools help you show only what matters.

## Tables panel

Open it with the **‹** button on the right edge of the diagram, or with `Ctrl+K` (`⌘+K` on macOS). A badge on the button shows how many tables are hidden.

- **Search** by table name, schema, column name or group name. Plain text, wildcards (`VW_*`) and `/regex/` work. The diagram dims the tables that do not match.
- **Group by** schema or by table group. Each group shows `visible/total`.
- **Eye** icons hide or show a table, a whole group, or everything listed.
- **Click a row** to select the table and center it on the screen (a hidden table is shown first).
- The **target** button on a row shows **only that table and the ones related to it**.
- **Filters** (funnel): all / visible only / hidden only, and only tables that have relationships.
- The chip at the bottom shows everything again.

Hidden tables leave their relationship lines and group boxes. They are still in the DBML and in the [Docs view](generated-documentation). **Arrange** only lays out the visible tables, and hidden ones keep their place.

## Detail levels

**More → View → Detail level** shrinks every table:

| Level | Shows |
|-------|-------|
| **Full** | all columns, types and indexes |
| **Names** | all columns, without types and indexes |
| **Keys** | only primary keys and the columns that take part in a relationship |
| **Tables** | only the table names |

Relationship lines stay attached even when the column they use is not drawn.

## Saved views

A **view** is a named way of looking at the same diagram. It stores:

- which tables are visible,
- where they are and their sizes,
- the offsets of the relationship labels,
- the detail level and the relationship highlight.

At the top of the Tables panel:

- the **list** switches views ("Main view" is the state before the first view was saved);
- **＋** saves what you see now as a new view;
- **✎** renames and **🗑** deletes the current view (the tables are not touched).

Switching never loses changes: what you were looking at is stored back into the view you leave. Views are saved with the diagram, so everybody who opens it sees the same.

> **Tip** Typical set: *Overview* (detail **Tables**, only the main entities), *Billing* (only the billing group, detail **Full**) and *Keys* (detail **Keys**, every table).
