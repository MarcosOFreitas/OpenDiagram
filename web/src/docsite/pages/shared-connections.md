# Shared connections

By default a saved database connection is **private** to the account that created it. A **shared connection** is registered once by an **administrator**, with a **read-only** database user, and then used by the people and groups the administrator chooses, who never see its password.

## Why

- The credential lives in one place and can be replaced or revoked without asking everybody.
- People who only need to draw or refresh a diagram do not need to be given a database password.
- Every use is recorded in the [audit log](administration#audit-log).

## For administrators

Open **avatar menu → Administration → Connections**.

![Administration → Connections: a shared connection with the group that may use it.](admin-connections.jpg)

1. Press **Register a shared connection** and fill in the name, host, port, database (or Oracle service name), the **read-only** database user and its password, and the TLS mode. Keep **Refuse to use this credential if it has write privileges** on: a person who tries it then gets an explanation instead of an import.
2. Use **+ give access to…** on the connection to add **groups** and **people**. Remove them with the ✕ on their chip. Administrators can always use every shared connection.
3. **Test** opens a read-only session and warns if the credential can do more than read metadata. **Edit** changes the fields (leave the password empty to keep it), **Delete** removes the connection; diagrams linked to it keep their text and can no longer refresh.

> **Warning** Use a dedicated read-only user. Everyone with access uses the same database account, so it should be able to read the catalog and nothing else. See [Security & TLS](database-security).

Shared connections belong to the organization, not to the administrator who created them: if that administrator is deleted, the connections stay.

## For members

In **More → Database**, shared connections appear in **Saved connections** with a **shared** tag. You see the **name, type, host and database**. The user, password and certificate are never sent to your browser, and the form is read-only.

You use it like any connection: **Test connection**, pick the schemas and tables, **Import**. A request can only use the connection as it was registered; it cannot point its credentials to another host.

## Refreshing a linked diagram

A diagram imported through a shared connection keeps a link to it (never the credential). People who **can edit** the diagram **and** have access to the connection can press **↻** to re-read the metadata, not only the owner. Anyone without access to the connection does not see the link or the button.

The automatic refresh (every N minutes) still runs only in the **owner's** open page, so one open browser makes one refresh.

## What is recorded

Each test, table listing, import and refresh through a shared connection is logged with who did it, which connection, which diagram (when it was a diagram the person can open), whether it worked and a short detail such as the schemas and the number of tables. Personal connections are private and are not logged.
