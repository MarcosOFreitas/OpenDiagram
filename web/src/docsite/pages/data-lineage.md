# Data lineage

**Data lineage** answers "where does this table come from, and what is built from it?". OpenDiagram draws it as **dashed arrows** that point in the direction the data flows: from the source to the table built from it.

Lineage lines are **not** relationships. A relationship (`Ref`) is a foreign key between two tables; a lineage arrow says that one table, usually a view, is derived from another.

## Where lineage comes from

- **From the database, automatically.** When you import or refresh, every **view** and **materialized view** gets arrows from the tables and views it reads.
  - **Table level**: the catalog says which tables and views each view is built from. In PostgreSQL it also says which columns of each source the view reads, shown as *uses N cols* (joins and filters included).
  - **Column level**: OpenDiagram reads the SQL text of the view and maps **each output column to the source columns it is computed from**: `c.name`, `upper(o.status) AS st`, `sum(total)`, `*`, sub-queries, `WITH`, `UNION` and views over views are followed. The arrows then go from column to column. Output columns that use no column (`count(*)`, constants) get no arrow.
  - Sources that are not part of the import are left out.
- **By hand**, for everything the database cannot know: loads, ETL jobs, copies between schemas. You write a comment line in the DBML.

> **Note** The column mapping is read from the SQL, not from the database catalog, so it only exists when the SQL can be read. A query the reader does not understand (for example Oracle `(+)` joins or `CONNECT BY`, a view over 20,000 characters, or a `*` over a table that is not imported) keeps its table-level arrow and gets no column arrows. You can always write the mapping by hand.

![Dashed arrows from the source to the table built from it, drawn from column to column (PostgreSQL view). A sticky note sits on the canvas and the avatar next to the title shows another person with the diagram open.](lineage-notes-presence.jpg)

## Writing lineage in the DBML

A lineage line is a comment, so other DBML tools simply ignore it:

```dbml
// lineage: sales.v_summary <- sales.orders, sales.order_items
// lineage: staging.customers <- crm.customers(id, name, email)
// lineage: sales.v_summary.total <- sales.orders.total, sales.order_items.price
```

- The table on the **left** of `<-` is built from the ones on the **right**, separated by commas.
- A name is `table`, `schema.table`, `table.column` or `schema.table.column`. Use double quotes for names with spaces.
- Columns in **parentheses** after a table are the columns that are used (a table-level arrow with a list).
- A column on **both** sides (`v.total <- orders.total`) draws the arrow from one column to the other.
- Names that match no table are ignored; two lines for the same pair are merged.

Lines that the import generates start with `// lineage(auto):`. A **refresh rewrites those** and **keeps your own lines** (the ones without `(auto)`). To keep a generated line, delete the `(auto)` mark.

## Reading and focusing

- The **lineage button** in the dock (next to the relationship highlight) shows or hides all the arrows. It also exists in **More → View → Show data lineage**. It is only there when the diagram has lineage.
- Click a **table**: the tables it is built from, directly or through other tables, get a **violet** outline and their arrows turn violet; the tables built from it get a **teal** outline and teal arrows. The other lineage arrows fade.
- Click an **arrow** to focus it and its two tables; its label shows the columns involved.
- Drag the label of an arrow to bend it, like a relationship line. Double-click puts it back.

## Hiding and filtering

- **Hidden tables** take their lineage arrows with them, as with relationships. See [Tables panel](tables-panel-and-views).
- In the **Tables panel**, the **lineage icon** on a row shows **only that table and everything it is built from or feeds**, at any depth. It also switches the arrows on.
- The panel filter **Only tables with data lineage** lists just the tables that appear in some lineage line.
- The state of the lineage switch is saved with each **saved view**, so a view can show lineage and another can hide it.

## Arrange and the documentation

- **Arrange** (Auto, Left to right, Pipeline, Snowflake) also follows the lineage while it is switched on: a table built from others is placed to the **right** of its sources, and tables joined only by lineage stay together instead of ending in the loose column. Compact ignores it. Switch the lineage off before arranging to lay out the relationships alone.
- The **Docs** view and the HTML and Markdown exports list **Built from** (with the columns used) and **Feeds** on each table card, a *Data lineage* table in the overview and a count in the summary. See [Generated documentation](generated-documentation).

## Limits

- Only views and materialized views get automatic lineage. Plain tables loaded by a job need a hand-written line.
- Column mapping covers views whose SQL can be read (see above); anything else stays at table level. Functions and procedures are not read.
- Triggers are not read.
