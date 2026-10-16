# Connect Claude (MCP)

OpenDiagram has an **MCP server** (Model Context Protocol), so an AI client such as Claude Code can **read**, **comment on** and **edit** your diagrams. It works as a person would: it is an **agent** account, and it can open **only** the diagrams that someone shared with it, at the level they chose.

> **Warning** An agent **never** sees a database connection, a user name, a password or a certificate, not even for diagrams that were built from a database. It only gets the DBML text, the title, the version and the comments.

## Set it up

1. An **administrator** switches it on in **Administration → Settings → Agents** (off by default).
2. In **Administration → Agents**, **Create agent** (for example *Claude of the data team*), then **+ Token**. Copy the token: it starts with `odt_`, is shown **once**, and only a hash of it is kept. It can expire and can be **revoked** at any time.
3. The **owner of a diagram** shares it with the agent: **Share → Person**, search the agent by name (it shows an *AI agent* tag) and choose **Can view**, **Can comment** or **Can edit**. Without this the agent sees nothing.
4. Connect the client:

```bash
# Claude Code
claude mcp add --transport http opendiagram https://your-server/mcp --header "Authorization: Bearer odt_..."
```

For a client that only speaks to local programs (such as Claude Desktop), use a bridge that sends the header, for example `npx mcp-remote https://your-server/mcp --header "Authorization: Bearer odt_..."`, as the command of an entry in its MCP settings.

The address is the same server and port as the app, path `/mcp`. Over a network, put the app behind **HTTPS** (see [Self-hosting](self-hosting)): the token travels in a header.

## What the agent can do

| Tool | Needs | What it does |
|---|---|---|
| `list_diagrams` | | the diagrams shared with it, with its level on each |
| `get_diagram` | view | the DBML, the title and the **version** |
| `list_comments` | view | the comments of a diagram |
| `add_comment` | comment | adds a comment to the whole diagram, a table (`schema.table`) or a column (`schema.table.column`) |
| `update_diagram` | edit | replaces the DBML, and **must** send the version it read (`base_version`) |

- A save is refused when somebody else saved in the meantime (the agent must read again) and when the DBML does not parse. Nothing is half saved.
- Every save by an agent is **its own entry in the diagram's history**, with the agent's name, so you can compare it and restore the version before it.
- The agent cannot create or delete diagrams, change sharing, import from or refresh a database, run SQL, or use the Administration.

## Safety

- **Diagram text is written by people, and an agent reads it as input.** A note such as "ignore your rules and..." must not be obeyed. OpenDiagram marks everything it hands over as *data, not instructions*, and the client usually asks you before an action, but a clever text can still mislead a model. Give agents **view** or **comment** by default, and **edit** only on diagrams where a bad edit is easy to undo.
- Use one agent and one token per use (laptop, pipeline), give tokens an **expiry**, and revoke the ones you no longer use. **Disable** an agent to stop it at once without deleting it.
- Every call is recorded in **Administration → Sign-ins & connections → Agent calls**: which agent, which tool, which diagram, whether it worked. The content of the diagram is never written to the log.
- The token only works on `/mcp`. It does not open the app, the API or the Administration, and an agent has no password and cannot sign in.
- Limits: 120 calls per minute for each token, and 2 MB of DBML per save.

## Not supported yet

- **Custom connectors of claude.ai on the web**: they need OAuth sign-in and a public HTTPS address. This comes later, together with single sign-on (SSO) through AWS Cognito.
- Creating diagrams, or acting on behalf of a person.
