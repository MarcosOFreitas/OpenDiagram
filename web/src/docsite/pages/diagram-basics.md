# Diagram basics

## Navigating

- **Zoom** with the mouse wheel, the **− / +** buttons or the buttons in the dock (the percentage shows the zoom); **Fit to screen** shows everything.
- **Pan** by dragging the empty canvas. The **minimap** in the corner shows where you are.
- The dock also has **Collapse all tables** and **Expand all tables**, the relationship highlight button and **Arrange** (see [Arrange](arrange)).

## Selecting and focusing

| Click | Result |
|-------|--------|
| A **table** | The table and its relationship lines are highlighted. |
| A **relationship line** | The line turns orange; only its two tables stay in focus. |
| A **table group title** | The group box becomes solid and glows; other tables and unrelated lines dim. |
| The empty canvas | Clears the focus. |

## Moving things

- **Tables**: drag a table to move it (people who can edit).
- **A whole table group**: drag the **title** of its box. The tables keep their relative positions.
- **A relationship line**: drag its **label** to bend the line; double-click the label to reset.
- Positions are saved with the diagram. Table positions survive a [refresh](database-import#keep-it-fresh).

## Collapsing and resizing tables

- The **▾** in a header (or a double-click on it) collapses the table to its title. Relationship lines stay attached.
- **Select** a table and drag the handles on its edges and corners to change its **width and height**. A manual height makes the rows scroll inside the table. A width-only change keeps the height automatic.
- The default width follows the content, so the longest column name always fits. Column names are on the left and keep priority; types are on the right and are the first to be shortened.

## Sticky notes

Sticky notes are free text on the canvas, kept in the DBML as top-level `Note` blocks (see [DBML](dbml#sticky-notes)).

![A sticky note (bottom left) on the canvas next to the tables.](lineage-notes-presence.jpg)

- **Add** one with the **Add a sticky note** button in the dock (people who can edit). It appears in the middle of the screen, ready to type.
- **Edit** by double-clicking it. The text is written back into the DBML when you click outside; Esc cancels.
- **Move** it by dragging its top; **resize** it with the corner handles when it is selected; **delete** it with the ✕ in its corner. Its place and size are saved with the diagram.
- **Hide** all of them with the **Display** tab of the side panel → **Sticky notes**. Arrange never moves them.
- Notes you type in the editor appear on the canvas as soon as the text is valid; a note without a saved place is put under the tables.

## Header colors

```dbml
Table products [headercolor: #3498DB] {
  id integer [pk]
}
```

Next to the color a small square opens a color picker, and typing `headercolor: ` offers a preset palette.

## Views, tables and the detail

Tables that come from a database view are drawn like the others, marked **· View** or **· Mat. view** after the name.

## Theme and lines

The **sun/moon** button in the top bar switches **light / dark** (on a phone it is in the **More** menu). The side panel on the right of the diagram (the **‹** button at its edge, or `Ctrl+K`) has two tabs: **Tables**, and **Display** with the line style, the relationship highlight, the detail level, the layers (data lineage, sticky notes), the background grid and snap to grid. The saved view picker above the tabs applies to both.

> **Tip** Press the **Docs** switch in the top bar for a browsable page of the same model, see [Generated documentation](generated-documentation).
