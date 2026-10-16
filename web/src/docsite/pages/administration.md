# Administration

Administrators open the panel from the **avatar menu → Administration**.

## Users

- **Add user** with an e-mail, a name and a role (member or administrator). You can type an initial password or let the app **generate a temporary one**, which is shown **once**.
- A new or reset user is forced to **choose a new password** at the next sign-in; until then they can only sign in, change the password and open share links.
- **Reset password** gives a new temporary password. **Disable** blocks an account without deleting it and signs the person out at once. You cannot disable, delete or change the role of your own account here. **Delete** removes it and its data.
- The instance must always keep **one active administrator**: the app refuses to disable, delete or demote the last one.

## Groups

Flat groups (no hierarchy). Create a group, add or remove members. A person can be in several groups. Groups are used to share diagrams with many people at once.

## Connections

**Connections** registers **shared database connections**: one read-only credential that chosen people and groups can use without seeing it. See [Shared connections](shared-connections).

## Audit log

There are two logs, in two tabs, newest first. Both are kept for **180 days**.

**Audit log** is every **change made in the Administration panel**: users, passwords reset, groups, members, settings and shared connections (the route and the ids only; never passwords or other contents).

**Sign-ins & connections** is what people did to get in and what they used:

- **sign-ins** and **failed sign-ins** (the e-mail that was tried, the device and the address, never the password), sign-outs, password changes, ended sessions, new accounts and **closed accounts**. Only the last 50,000 failed sign-ins are kept, so a flood of attempts cannot push the rest out;
- the **use of shared connections**: test, list tables, import and refresh (also the scheduled ones), with the diagram, whether it worked and a short detail (schemas, number of tables, or the error).

![Administration → Sign-ins & connections, filtered to the use of shared connections.](admin-audit.jpg)

Filter by **Done by** (a person), **Target** (a shared database, a diagram, or Users / Groups / Settings) and **Type of operation** (administrator actions: added, changed, deleted; sign-in and accounts; shared-connection use: tested, listed tables, imported, refreshed), combine them with a search text, **Clear filters**, load more, or **Download CSV** (it follows the filters) (formula-safe for spreadsheets; up to the newest 5000 matching entries). Entries are kept for **180 days**. Personal connections are private: their use is not recorded and administrators cannot see it.

## Sessions and closed accounts

- **Sign out** next to a user ends all their sessions (use it when a laptop is lost). **Disable** and **Reset password** also end them.
- In **Settings** you choose the **session length** (1 to 90 days, for new sign-ins; default 30) and, optionally, to sign people out after some **days without use** (0 = never).
- When a person **deletes their own account** (Account → Delete my account), they are signed out for good and their database connections are deleted at once. Their diagrams are kept for **7 days**, with no links and no shared access, in **Users → Diagrams of closed accounts**. For each one you choose a person (yourself included) and, if you want, a **group** that can edit it, then **Hand over**; or **Delete now**. What nobody takes in 7 days is deleted for good. Deleting a user yourself (**Delete**) is immediate.

## Settings

| Setting | Effect |
|---------|--------|
| **Organisation name** | shown on the sign-in screen and in the top bar instead of "OpenDiagram" |
| **Let people create their own account (as members)** | lets anybody create a member account. Keep it off unless the instance is for an open community. Press **Save settings**. |

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

Every diagram of the organization (to open, edit, comment, share and delete). They **never** see another person's *personal* saved connections or credentials. The shared connections they register themselves are the exception: they manage them, and still cannot read the password back.
