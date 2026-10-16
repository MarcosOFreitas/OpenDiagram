# DBML: tables, fields and notes

DBML (Database Markup Language) is a simple, readable language to describe a database structure. The diagram is drawn with [`@dbml/core`](https://dbml.dbdiagram.io/docs), so any valid DBML works; this page covers what you will use most.

## Tables and columns

A table is a block with one column per line: name, type, and optional **settings** in square brackets.

```dbml
Table users {
  id integer [pk, increment]
  email varchar(255) [unique, not null, note: 'Login e-mail']
  status varchar [default: 'active']
  created_at timestamp [default: `now()`]
}
```

| Setting | Meaning |
|---------|---------|
| `pk` | primary key |
| `not null` / `null` | nullability |
| `unique` | unique constraint |
| `increment` | auto-increment / serial |
| `default: value` | default; wrap an expression in backticks, as in the example above (`now()`) |
| `note: 'text'` | a note, shown as a tooltip and in the documentation |
| `ref: > other.id` | inline relationship, see [Relationships](relationships) |

Types are free text: `varchar(255)`, `decimal(10,2)`, `integer[]`. A type that is not a single word must be quoted when you write it by hand (`"timestamp with time zone"`); the importer does this for you.

## Table settings and notes

Settings for the whole table go after its name.

```dbml
Table products [headercolor: #3498DB, note: 'Items for sale'] {
  id integer [pk]
  sku varchar [unique]
  price decimal(10,2)
}
```

- `headercolor` changes the title bar. See [Table groups](table-groups) for the color picker.
- A multi-line note uses triple quotes:

```dbml
Table orders {
  id integer [pk]
  Note: '''
    One row per order.
    Totals are recalculated by a trigger.
  '''
}
```

## Project

A `Project` block holds metadata and a note for the whole diagram.

```dbml
Project shop {
  database_type: 'PostgreSQL'
  Note: 'Shop schema overview'
}
```

## Sticky notes

A top-level `Note` is a free text block that is not attached to a table. Its name is its title on the canvas (underscores show as spaces; quote a name that has spaces). OpenDiagram draws it on the diagram as a **sticky note** (see [Diagram basics](diagram-basics#sticky-notes)). Use triple quotes for several lines.

```dbml
Note reminder {
  '''
  Review the payments model
  before the release
  '''
}
```

> **Note** DBML does not accept settings (such as a color) on a top-level `Note`, so every sticky note has the same color. The importer writes a database sequence in the note of the table that uses it (a `SEQUENCES` section); a sequence that no imported table uses becomes a `Note` block whose text starts with `SEQUENCE`. Those stay in the text and the documentation and are not drawn as stickies.

## Comments

`// like this` is ignored by the parser. Use it freely to organize the file. One kind of comment has a meaning for OpenDiagram: `// lineage: target <- source` declares [data lineage](data-lineage).

## Views from a database

Views are drawn as normal tables, marked **· View** (or **· Mat. view**) next to the name. Their `CREATE VIEW … AS …` statement is added to the table note only when **Full DDL of views** was ticked at import. See [Import from a database](database-import#what-is-imported).
