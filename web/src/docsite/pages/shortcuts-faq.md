# Shortcuts & FAQ

## Shortcuts

| Keys | Where | Action |
|------|-------|--------|
| `Ctrl+K` / `⌘+K` | diagram | open the **Tables panel** and focus its search |
| `Ctrl+K` / `⌘+K` | this documentation | search the documentation |
| `Ctrl+Space` | editor | autocomplete |
| `Ctrl+F` / `Ctrl+H` | editor | find / replace |
| `Esc` | dialogs, panels, menus | close |
| `Ctrl+Enter` | a comment in Docs | post it |
| Double-click a table header | diagram | collapse / expand the table |
| Double-click a relationship label | diagram | put the line back |
| Double-click the edge of a sidebar | Docs, editor | reset its width |

## FAQ

### Does OpenDiagram read my data?

No. Database sessions are read-only and only query catalog views (`pg_catalog`, `ALL_*`). See [Security & TLS](database-security).

### Can two people edit at the same time?

Not in real time yet: the last save wins. Give the other person *Comment* access, or take turns. See [Accounts & permissions](accounts-and-sharing).

### My diagram became slow with hundreds of tables. What can I do?

Hide what you do not need with the [Tables panel](tables-panel-and-views), switch the **detail level** to *Keys* or *Tables*, and use saved **views** for the areas you work on. The **Auto** [arrange](arrange) packs big diagrams into a readable rectangle.

### The importer wrote a view as a table. Is that a bug?

No. DBML has no view type, so a view is a table marked **· View** with its SQL in the note. It is exported to SQL as a plain table.

### Why does an Oracle connection with TLS close right after connecting?

You probably have TLS **off** against a TCPS port (the error mentions `NJS-521`). Set the TLS mode to *on, verify certificate*. If the database is an Oracle Autonomous Database, also check its **access control list** and whether it requires mTLS (a wallet).

### Where is my data stored?

In a single SQLite file in the Docker volume `appdata`. See [Self-hosting](self-hosting#backup-and-moving-to-another-machine).

### How do I recover access if the administrator forgot the password?

An operator can reset it from the command line: see [Administration](administration#operator-command-line).

### Can I embed a diagram in another site?

Not at the moment. Use a [share link](share-links) or the exported [documentation](generated-documentation#export).
