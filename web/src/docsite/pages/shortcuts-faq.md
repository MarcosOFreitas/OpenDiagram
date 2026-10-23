# Shortcuts & FAQ

## Shortcuts

| Keys | Where | Action |
|------|-------|--------|
| `Ctrl+K` / `⌘+K` | diagram | open the **Tables panel** and focus its search |
| `Ctrl+K` / `⌘+K` | this documentation | search the documentation |
| `Ctrl+Space` | editor | autocomplete |
| `Ctrl+F` | editor | find bar (`Enter` next, `Shift+Enter` previous, `Esc` closes; Replace opens from the arrow) |
| `Esc` | dialogs, panels, menus | close |
| `Ctrl+Enter` | a comment in Docs | post it |
| Double-click a table header | diagram | collapse / expand the table |
| Double-click a sticky note | diagram | edit its text (Esc cancels) |
| Double-click a relationship label | diagram | put the line back |
| Double-click the edge of a sidebar | Docs, editor | reset its width |

## FAQ

### Does OpenDiagram read my data?

No. Database sessions are read-only and only query catalog views (`pg_catalog`, `ALL_*`). See [Security & TLS](database-security).

### My database is behind a VPN. Do I configure it in OpenDiagram?

No. The **server** opens the connection, so the machine that runs OpenDiagram must reach the database like any program on it; the people using the app do not need the VPN. Run the app where the VPN is (a server on the network, or a VPN client beside it). Docker Desktop on a PC often does not use the PC's VPN. See [Self-hosting → Databases behind a VPN or a firewall](self-hosting).

### Where do the sequences of the database appear?

DBML has no sequence object, so a sequence is written as text. One that a table **uses** (a column default, or a trigger on the table) is in the **note of that table**, under `SEQUENCES`. One that no imported table uses is a standalone note starting with `SEQUENCE`, which is documentation, not a sticky note. Sequences owned by a serial or identity column are not listed. See [Import from a database](database-import).

### I forgot my password. What now?

If you made a **recovery key** (Account → Recovery key), use **Forgot your password?** on the sign-in screen. If not, an administrator resets it. See [Accounts & permissions](accounts-and-sharing).

### Can an AI assistant use my diagrams?

Yes, through the MCP connector, at the level you give it (view, comment or edit) and only on the diagrams you share with it. It never sees a database credential. See [Connect Claude (MCP)](connect-claude-mcp).

### Can two people edit at the same time?

There is no real-time co-editing. If both save changes, the second save is refused and a dialog asks whether to load the other person's version or keep yours (the other version stays in the history). See [Versions & history](versions-and-history). Giving the other person *Comment* access avoids the question.

### My diagram became slow with hundreds of tables. What can I do?

Hide what you do not need with the [Tables panel](tables-panel-and-views), switch the **detail level** to *Keys* or *Tables*, and use saved **views** for the areas you work on. The **Auto** [arrange](arrange) packs big diagrams into a readable rectangle.

### The importer wrote a view as a table. Is that a bug?

No. DBML has no view type, so a view is a table marked **· View** (with its SQL in the note when **Full DDL of views** was ticked at import). It is exported to SQL as a plain table.

### Why does an Oracle connection with TLS close right after connecting?

You probably have TLS **off** against a TCPS port (the error mentions `NJS-521`). Set the TLS mode to *on, verify certificate*. If the database is an Oracle Autonomous Database, also check its **access control list** and whether it requires mTLS: databases that require a wallet (mutual TLS) are not supported, so allow TLS-only (non-mTLS) connections on the database.

### Can I go back to an earlier version?

Yes: **More → History** lists the saved versions with who changed what. You can name a version, compare it with the current one and restore it. See [Versions & history](versions-and-history).

### Where is my data stored?

In a single SQLite file in the Docker volume `appdata`. See [Self-hosting](self-hosting#backup-and-moving-to-another-machine).

### How do I recover access if the administrator forgot the password?

An operator can reset it from the command line: see [Administration](administration#operator-command-line).

### Can I embed a diagram in another site?

No. Use a [share link](share-links) or the exported [documentation](generated-documentation#export).
