# Table groups

A **table group** puts related tables in a colored box. It is useful to organize a database with many tables.

## Syntax

```dbml
TableGroup billing [color: #E67E22] {
  invoices
  payments

  Note: '''
    Everything that deals with money.
  '''
}
```

- The `color` is optional. Typing `color: ` offers a preset palette, and the small square next to a color opens the color picker.
- A table belongs to **one** group.
- Names with spaces use quotes: `TableGroup "User Wishlist" [color: #1E69FD] { ... }`.

## What you can do with a group

- **Focus** it by clicking its title: the box becomes solid and the rest dims.
- **Move** the whole group by dragging its title.
- **Arrange** treats each group as a block, so boxes do not overlap. See [Arrange](arrange).
- Group the **Tables panel** list by table group and hide a group with one click. See [Tables panel](tables-panel-and-views).
- The **Docs** view lists the tables by group, with the group color.

## Build groups while importing

In **More → Database**, the **All tables — choose specific ones…** dialog has a **Groups** tab:

1. Type a **name** and pick a **color** (the palette or any color).
2. Mark the tables of the group in its own list (search, wildcards and *Select shown* work here too).
3. **Create group.** Repeat for the other groups.
4. Use **Edit tables** on a group to add or remove tables. Adding a table to a group moves it out of its previous group.
5. **Use N tables**, then **Import**: the groups are written to the DBML as `TableGroup` blocks.

The groups of the current diagram are the starting point of the dialog. Tables in a group are imported even if you did not tick them.

> **Tip** Name groups after business areas (Sales, Catalog, Billing) rather than technical layers: the box then reads like a map.
