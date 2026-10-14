# Administration

Administrators open the panel from the **avatar menu → Administration**.

## Users

- **Create** a user with an e-mail, a name and a role. You can type an initial password or let the app **generate a temporary one**, which is shown **once**.
- A new or reset user is forced to **choose a new password** at the next sign-in; until then only the sign-in and password endpoints work.
- **Reset password** gives a new temporary password. **Disable** blocks an account without deleting it. **Delete** removes it and its data.
- The instance must always keep **one active administrator**: the app refuses to disable, delete or demote the last one.

## Groups

Flat groups (no hierarchy). Create a group, add or remove members. A person can be in several groups. Groups are used to share diagrams with many people at once.

## Settings

| Setting | Effect |
|---------|--------|
| **Organisation name** | shown in the top bar instead of "OpenDiagram" |
| **Allow public sign-up** | lets anybody create a member account. Keep it off unless the instance is for an open community. |

The environment can force these (`ALLOW_SIGNUP`), see [Self-hosting](self-hosting).

## Operator command line

If nobody can sign in, an operator with access to the server can manage accounts from the command line:

```bash
docker compose exec app node src/cli.js create-admin you@example.com 'a-long-password' 'Your Name'
docker compose exec app node src/cli.js reset-password you@example.com 'a-new-long-password'
docker compose exec app node src/cli.js list-users
```

> **Note** Passwords have 10 to 200 characters.

## What administrators can see

Every diagram of the organization (to open, edit, comment, share and delete). They **never** see another person's saved connections or credentials.
