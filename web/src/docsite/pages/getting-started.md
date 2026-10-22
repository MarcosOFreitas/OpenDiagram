# Getting started

## The screen

- **Left**: the DBML editor. It is the **single source of truth**: the diagram is always drawn from this text.
- **Center**: the diagram. Drag tables, zoom with the wheel or the dock at the bottom, and click things to focus them.
- **Top bar**: the diagram title, the **Diagram | Docs** switch, **Share**, **Export**, **More** (Diagrams, Database, Import, History, View, Documentation) and your avatar (Account & password, Administration for administrators, Sign out). **Database** is only there on your own diagrams.
- **Right edge** of the diagram: the **Tables panel** (search, group, hide and jump to tables).

![The sample model: tables, table groups (colored boxes) and relationship lines. The dock at the bottom has zoom, fit, collapse, highlight and Arrange.](diagram-overview.jpg)

Everything **autosaves** a moment after you change it ("Saved" appears next to the title). Your diagrams are private to your account until you share them.

## Your first diagram

Every new account starts with a sample, **Online store - sample**. To start from scratch use **More → Diagrams → New blank diagram**. It starts with a tiny users/posts example: select everything (`Ctrl+A`) and replace it with:

```dbml
Table users {
  id integer [pk, increment]
  email varchar(255) [unique, not null]
  created_at timestamp [default: `now()`]
}

Table posts {
  id integer [pk, increment]
  user_id integer [not null]
  title varchar(200)
}

Ref: posts.user_id > users.id
```

The two tables appear with a line between them. Click a table to highlight its relationships, drag it to move it, double-click its header to collapse it.

## The editor

| What | How |
|------|-----|
| Autocomplete (keywords, types, tables, `table.column`) | opens as you type; `Ctrl+Space` forces it |
| Syntax errors | underlined in the code; the first message is in the status bar |
| Colors | after a `headercolor:` or `color:` value a small square opens a color picker; typing `color: ` offers presets |
| Find and replace | `Ctrl+F` (`⌘+F` on macOS) opens the find and replace bar |
| Wrap long lines | the button at the right of the editor's status bar (under the code) |
| Resize the editor | drag the edge between the editor and the diagram (double-click resets) |

> **Tip** Collapse the editor with the **‹** button on its edge when you only want to look at the diagram. It is hidden automatically in the **Docs** view.

## Diagrams, templates and deleting

**More → Diagrams** lists your diagrams and the ones shared with you, lets you start from a template and delete a diagram (the card asks first). With more than eight, a search box (name or owner), a sort by name or last change and a filter for the diagrams linked to a database appear. Deleting a diagram also removes its share links and comments.

## Next steps

- Learn the [DBML syntax](dbml).
- [Import a database](database-import) instead of typing it.
- [Share](share-links) the diagram.
