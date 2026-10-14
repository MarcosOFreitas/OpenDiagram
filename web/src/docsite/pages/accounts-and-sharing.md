# Accounts & permissions

## Accounts

One installation is one organization. People sign in with **e-mail and password**.

- The **first account** created is the **administrator**.
- After that, sign-up is **closed**: the administrator creates the other accounts (see [Administration](administration)). A new user gets a temporary password and chooses their own at the first sign-in.
- Roles: **administrator** and **member**. Members can belong to any number of **groups** (flat, no hierarchy).

## Private by default

Diagrams and saved database connections are **private** to the account that owns them. Nobody sees them until you share. Your own connections and their credentials are **never** shared, only the diagram. The exception is a [shared connection](shared-connections) registered by an administrator, which people use without seeing its credential.

## Sharing a diagram

Open the diagram and press **Share**. You can give access to:

- a **person** (search by name or e-mail),
- a **group** (everybody in it),
- or create a **link** (see [Share links](share-links)).

![The Share panel: people and groups on top, links below.](share-panel.jpg)

Levels, from least to most:

| Level | Can |
|-------|-----|
| **View** | open the diagram and its documentation, read comments |
| **Comment** | everything in *View*, add comments, delete their own |
| **Edit** | everything in *Comment*, change the DBML and the layout (which autosave into the owner's diagram) |
| **Owner** | everything: also title, connection link, delete and sharing |

If several grants apply to the same person (directly and through groups), the **highest** one wins. You can change or remove access at any time; removing the last grant hides the diagram again.

Editors never change the title, the connection link or the sharing.

## Administrators

Administrators can open every diagram of the organization and edit it, comment, share and delete it. They **never** get the owner's saved connection or credentials.

## Comments

Comments live in the [Docs view](generated-documentation#comments): any number per table or column, with author and date. They respect the levels above.

> **Warning** There is no real-time co-editing yet. If two people edit the same diagram at the same time, the second one to save is asked whether to load the other version or overwrite it (see [Versions & history](versions-and-history)). Coordinate who edits, or give the other person *Comment* access.
