# Enums, indexes and schemas

## Enums

An enum is a fixed list of values you can use as a column type. Enums are not drawn as boxes on the diagram: they are listed in the [Docs view](generated-documentation), and a column typed with an enum shows its name.

```dbml
Enum order_status {
  pending [note: 'Created, waiting for payment']
  paid
  shipped
}

Table orders {
  id integer [pk]
  status order_status [default: 'pending']
}
```

When you import from PostgreSQL, enum types become `Enum` blocks and the columns that use them are linked to them.

## Indexes

Indexes go in an `indexes` block inside the table. They can be single, composite or expressions, and a composite primary key is declared with `[pk]`.

```dbml
Table order_items {
  order_id integer
  product_id integer
  qty integer

  indexes {
    (order_id, product_id) [pk]
    qty [name: 'idx_qty']
    `lower(sku)` [unique, type: btree]
  }
}
```

Indexes are listed under the columns of the table in the diagram. They are hidden by the **Names**, **Keys** and **Tables** detail levels, or with the **Display** tab of the side panel → **Hide indexes**.

## Schemas

Prefix a table with a schema name. Tables of different schemas can have the same name.

```dbml
Table sales.invoices {
  id integer [pk]
}

Table billing.invoices {
  id integer [pk]
}
```

In the diagram the schema is shown next to the table name (nothing is shown for `public`). The Tables panel can group the list **by schema**.

## Composite example

```dbml
Project shop {
  database_type: 'PostgreSQL'
}

Enum payment_method {
  credit_card
  bank_transfer
  cash
}

Table sales.payments [headercolor: #E67E22] {
  id integer [pk, increment]
  method payment_method [not null]
  amount decimal(12,2) [not null]

  indexes {
    method
  }
}
```
