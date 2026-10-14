# Relationships

A relationship (`Ref`) connects a column of one table to a column of another. It is drawn as a line between the two columns, with the cardinality on it (for example `*:1`).

## Syntax

```dbml
Table customers {
  id integer [pk]
}

Table orders {
  id integer [pk]
  customer_id integer [not null]
}

Ref: orders.customer_id > customers.id
```

The operator tells the cardinality:

| Operator | Meaning |
|----------|---------|
| `>` | many-to-one (the left side is the "many") |
| `<` | one-to-many |
| `-` | one-to-one |
| `<>` | many-to-many |

## Named references and actions

Give a relationship a name and describe what happens on delete or update. The name is shown when you turn on **Highlight relationships**.

```dbml
Ref fk_lines_order: order_lines.order_id > orders.id [delete: cascade, update: restrict]
```

Actions are `cascade`, `restrict`, `set null`, `set default` and `no action`.

## Inline form

You can also declare the relationship in the column settings:

```dbml
Table orders {
  id integer [pk]
  customer_id integer [not null, ref: > customers.id]
}
```

## Composite keys

Several columns can be referenced together:

```dbml
Ref: compat_comgas.(id_os, cd_tss_wfm) > solicitacoes.(id_os, cd_tss_wfm)
```

## Working with relationship lines

| Action | Result |
|--------|--------|
| Click a line | The line turns orange and only its two tables stay in focus; the rest dims. Click the canvas to clear. |
| Drag the label of a line | The line bends through the new point. Double-click the label to reset. |
| **Highlight relationships** (dock button or **More → View**) | Every line turns blue and shows the name of its `Ref` instead of the cardinality. |
| **More → View → Relationship lines** | Curved, rounded, step or straight lines. |

Lines always attach to the sides of the tables that face each other, so they do not cross the tables they connect. This is recalculated while you drag a table.

> **Tip** Use the focus on a line (or on a table) to follow a relationship in a diagram with hundreds of tables.
