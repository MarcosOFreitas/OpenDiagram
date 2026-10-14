# Share links

A link lets people without an account (or without a direct grant) open a diagram. Only the **owner** (and administrators) can create them, under **Share → Links**.

## Create a link

1. Open **Share**.
2. In **Links**, choose the level: **view**, **comment** or **edit**.
3. Optionally type a **password** (6 or more characters).
4. Press **Create link** and copy it. It looks like `https://your-server/s/<token>`.

You can create several links with different levels and revoke each one on its own.

## What a link allows

| Level | Anonymous visitor | Signed-in visitor |
|-------|-------------------|-------------------|
| **view** | opens the diagram and Docs, read-only | same |
| **comment** | asked to sign in | can add comments |
| **edit** | asked to sign in | can change the DBML and the layout |

The link never exposes your saved connections, credentials or the sharing settings.

## Password-protected links

When a link has a password, visitors first see a **Protected link** screen. Once they type it, it is remembered for that browser tab only.

- Change or remove the password at any time with the **Change password** button next to the link. An empty password removes it.
- Changing the password immediately stops the old one from working.
- Too many wrong passwords from the same address lock the link for a few minutes (10 attempts per 15 minutes).
- The password is stored hashed (scrypt) and is never shown again; if you forget it, set a new one.

> **Tip** Send the link and the password through different channels.

## Revoke

**Revoke** removes a link. Anyone using it loses access immediately.
