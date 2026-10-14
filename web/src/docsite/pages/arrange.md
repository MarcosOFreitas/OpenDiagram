# Arrange (automatic layout)

**Arrange** in the dock lays the tables out again. The **▾** next to it chooses the algorithm; your choice is remembered.

![The Arrange button and the ▾ menu with the five algorithms.](arrange-menu.jpg)

| Algorithm | What it does | Best for |
|-----------|--------------|----------|
| **Auto** | Packs each table group and each connected cluster on its own, tables without relationships in balanced columns, and arranges the blocks in rows. | The default. Large diagrams. |
| **Left to right** | Classic layered layout following the relationships. | Long relationship chains. |
| **Pipeline** | Stages from left to right by dependency (referenced tables first): one stage per table group, or per dependency level when there are no groups. Tables are stacked vertically. | Data models with layers. |
| **Snowflake** | The most connected table in the center and the related tables in rings around it. | Star and snowflake schemas. |
| **Compact** | Tables in a compact rectangle, ignoring relationships. | A quick overview. |

## With table groups

Auto, Snowflake and Compact lay out **each group on its own** and treat it as one block with room for its box, so group boxes never overlap. Left to right uses the groups as clusters of a single layout; Pipeline makes each group a stage.

## Good to know

- Arrange resets the positions of the **visible** tables and the offsets of relationship labels. Table sizes and collapsed states are kept.
- Manual widths and heights are respected, so nothing overlaps even when you resized tables.
- A new diagram or an import is laid out with **Auto** the first time.
- To move a whole group afterwards, drag its title. See [Diagram basics](diagram-basics#moving-things).
