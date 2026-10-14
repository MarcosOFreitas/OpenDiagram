# 09 — Accounts, administration, groups and sharing

**Status:** implemented (self-hosted). Code: `server/src/{db,auth,admin,diagrams,store,policy,cli,index}.js`, `web/src/{Auth,Admin,Library,SharePanel,App}.jsx`. Verified by `server/test-auth.mjs` (91 checks) and manual browser runs ([07](07-testing.md)).

## Model

One installation = one organisation. People have **e-mail + password** accounts with a role (**administrator** or **member**), belong to any number of flat **groups** (no hierarchy), own private diagrams and saved database connections, and share diagrams with **people, groups and optional links**. Storage is **SQLite** (`DATA_DIR/app.db`) in the same volume — still one container.

## Accounts and roles

- **The first account created becomes the administrator** (`/auth/me` → `firstRun`, the sign-in screen says so). Databases created before roles existed promote their oldest account.
- **Public sign-up is closed once an administrator exists.** Administrators create everyone else's account. An admin setting ("let people create their own account", off by default) or `ALLOW_SIGNUP=1` opens self-registration (members only); `ALLOW_SIGNUP=0` forces it closed.
- Accounts created or reset by an administrator carry a **temporary password** (generated and shown once, or typed by the admin) and the user is forced to choose their own before anything else (`403 password change required` for every other API call; `PasswordForm` full-screen in the UI). Changing a password signs out the user's other sessions.
- Passwords: 10–200 characters, scrypt with a random 16-byte salt. Unknown e-mail and wrong password return the same error and take similar time.
- Sessions: random 32-byte token in an `HttpOnly; SameSite=Lax; Path=/` cookie (`Secure` with `COOKIE_SECURE=1` or `x-forwarded-proto: https`), only its SHA-256 stored, 30 days, deleted on logout, on password change/reset and when the account is disabled.
- Throttling (in memory): 8 failed logins / 15 min per (IP, e-mail); 30 sign-ups / 15 min per IP. `TRUST_PROXY=1` behind a reverse proxy.
- CSRF: `SameSite=Lax` plus rejection (403) of non-GET requests whose `Origin` host differs from `Host`.
- Not implemented: e-mail verification, self-service "forgot password" (an administrator resets it, or the operator CLI), MFA, SSO (OIDC/LDAP — roadmap).
- The first account also adopts connections saved by the pre-accounts version (`connections.json` → `.migrated`) and its browser's old local diagram becomes its first diagram.

## Administration (administrators only, `/api/admin/*`, UI: avatar menu → **Administration**; errors show inside the panel because it sits above the toasts)

| Area | Capabilities |
|---|---|
| Users | list (role, groups, status); create (e-mail, name, role, optional password); change name/role; disable/enable; reset password; delete (also deletes their diagrams and saved connections; comments they wrote stay, without a user) |
| Groups | create, rename, delete (removes grants given to the group); add/remove members; a user can be in **any number** of groups |
| Settings | organisation name (sign-in screen and top bar); allow self-registration |
| Guards | the instance always keeps **at least one active administrator** (cannot demote, disable or delete the last one — also for the user themselves); the UI disables self-service on your own row |

**Administrators have access to every diagram of the organisation** (role `admin` on diagrams they do not own): they can open, edit (DBML, layout, title), comment, share (people, groups, links), delete, and delete any comment. They still **never** see another account's saved connections, credentials or the diagram's connection link (`source` is hidden and `PUT` ignores it), and cannot use their connections. The Diagrams tab lists *Everyone else's diagrams (administrator)*.

**Operator CLI** (also the way back in if every administrator is locked out):
`docker compose exec app node src/cli.js create-admin <email> <password> [name]` · `reset-password <email> <new-password>` · `list-users`.

## Diagrams and sharing

A diagram stores `title`, `dbml`, `layout` (table positions) and `source` (link to one of the owner's saved connections, for refresh). The UI autosaves 800 ms after a change (`Saving… / Saved / Not saved`). A new account's first diagram is the bundled sample model ("Online store - sample", `web/src/templates.js`: 8 tables, enums, indexes, relationships with actions, three TableGroups) — unless the browser still held a diagram from the pre-accounts version, which is kept instead. The *Diagrams* tab offers *New blank diagram* and *Start from a template*, and lists **My diagrams** and **Shared with me** (with owner and permission).

Who can open a diagram (the effective level is the **highest** that applies):

| Source | Granted by | Notes |
|---|---|---|
| Owner | — | everything: edit, title, connection link, delete, sharing |
| Administrator | role | everything except the owner's connection link/credentials (see above) |
| Person | owner (Share tab → Person; search by name/e-mail) | level `view` / `comment` / `edit` |
| Group | owner (Share tab → Group; any group of the installation) | applies to every current member; leaving the group or deleting it removes the level |
| Link | owner (Share tab → Links) | random 24-char token `/s/<token>`; anonymous = read-only; `comment`/`edit` require sign-in. Optional **password** (6–200 chars, scrypt in `shares.password_hash`, never returned): visitors send it in the `x-share-password` header (the UI asks once per tab and keeps it in `sessionStorage`); `401 {code:'share_password'}` when missing/wrong, `429` after 10 wrong attempts per (IP, link) in 15 min. Owner sets/changes/removes it with `PATCH /api/shares/:sid {password}` (empty removes) |

Levels: **view** (diagram, docs, comments), **comment** (+ add comments, delete own), **edit** (+ change DBML and layout, which autosave into the owner's diagram). Editors never change the title, connection link, sharing, or delete; nobody but the owner sees `source`, saved connections or credentials; the owner and administrators delete any comment. Changes and revocations take effect immediately.

| Method & path | Who | Purpose |
|---|---|---|
| `GET/POST /api/diagrams`, `GET/PUT/DELETE /api/diagrams/:id` | owner or granted | list (own + shared, with `role`), open, save (owner: all; edit: `dbml`,`layout`), delete (owner) |
| `GET/POST /api/diagrams/:id/access`, `PATCH/DELETE /api/access/:aid` | owner | people/group grants |
| `GET/POST /api/diagrams/:id/shares`, `PATCH/DELETE /api/shares/:sid` | owner | links |
| `GET/POST/DELETE /api/diagrams/:id/comments[/:cid]` | by level | comments |
| `GET /api/shared/:token`, `PUT …`, `POST/DELETE …/comments` | link | anonymous read; signed-in comment/edit |
| `GET /api/directory/users?q=`, `/api/directory/groups` | any signed-in user | pick people/groups to share with (min. 2 characters, 8 results, active users only) |
| `/api/admin/users…`, `/api/admin/groups…`, `/api/admin/settings` | administrators | see above |
| `POST /api/auth/register|login|logout|password`, `GET /api/auth/me` | public / signed-in | accounts |

Everything under `/api` except `health`, `auth/*` and `shared/*` requires a session; resources of other accounts answer **404** so existence is not revealed.

## Versions, conflicts and history
- `diagrams.version` (integer, starts at 1) is bumped by every content save (title, DBML, layout, source); a save that changes nothing does not bump it. `PUT /api/diagrams/:id` and `PUT /api/shared/:token` accept `baseVersion` (the version the client loaded or last saved): a different current version answers **409** `{code:'conflict', version}` and writes nothing. No `baseVersion` = no check (scripts). A flagged `overwrite:true` save (the person chose "Keep my changes") and an `entry:'refresh'` save (sent by the first autosave after a metadata refresh that changed the DBML, manual or automatic) each get their own history entry; the refresh one is summarised as `Refresh from database: …`.
- Table `diagram_versions` (title, DBML, layout, author, summary, optional label). Entries of the same person within 10 minutes are coalesced; unnamed entries are pruned to the latest 60, named ones are kept. The first save after the feature (or on a migrated diagram) first stores the previous content as the "starting point". `summary` is computed when saving: tables added/removed by name (regex on `Table name`), plus lines added/removed.
- Routes (edit level or above, owner and administrators; not view/comment, not links): `GET /api/diagrams/:id/versions`, `GET .../versions/:vid` (full content), `POST .../versions {label}` (name the current state), `DELETE .../versions/:vid`, `POST .../versions/:vid/restore` (saved as a new version; editors never change the title).
- UI: **More → History** (`History.jsx`: list, name, Compare = line diff against the editor, Restore) and the conflict dialog in `App.jsx` (autosave pauses while it is open; status shows "Conflict").
- Not done: detecting a newer version without saving (no polling, no push), a per-entry delete button, diff of the layout, history for edit-link visitors.

## Presence
- `POST /api/diagrams/:id/presence` and `POST /api/shared/:token/presence` (any access level; link visitors, anonymous ones as `Guest`): body `{ tab, sel?, editing?, leave? }` (`tab` = random id of the browser tab, `[\w-]{6,40}`). Answer `{ viewers: [{ id, name, color, sel, editing }], version }`: the other people with the diagram open (several tabs of one person count once; the caller is never listed) and the current diagram version. Never returns e-mails.
- `server/src/presence.js`: in-memory map diagram -> tab -> entry; entries expire after 15 s without a heartbeat, at most 200 per diagram, a cleanup timer every minute. Nothing is persisted. The client beats every 4 s while the tab is visible, at once when the selection or the saved state changes, and with `leave` on page hide.
- UI (`App.jsx`): avatars next to the title (colour from the account id, amber ring while editing), the selected table of others outlined with a name tag (`peers` in `shown`), and the "newer version" bar when `version` from a beat is above the loaded one and nothing is unsaved.
- Not done: cursors, live text, presence in the Docs view, a list of everybody (only 4 avatars + a count).

## Comments

Any number per target key (`"<schema>.<table>"`, `"<schema>.<table>.<column>"`, `"__project"`) with author, date and text (≤ 2000 chars), stored in the app — **never** in DBML or a database; included (with author) in the `.html`/`.md` documentation exports. The Docs view refetches them when opened.

## Database connections

Private to the account; secrets AES-256-GCM encrypted (`APP_SECRET`); another account can never list or use them (`404`). **Sharing connections inside a group is not implemented yet** (roadmap): today each person registers their own. See [03](03-connections-import.md).

## Outbound host policy (SSRF)

`DB_HOST_POLICY`: `open` (default; any host — fine on your own network), `public-only` (reject hosts resolving to loopback/private/link-local/CGNAT/multicast addresses — for public hosting), `allowlist` (`DB_HOST_ALLOWLIST`). Checked before Test/Import/Refresh. Known gap: DNS is resolved once for the check and again by the driver (rebinding window).

## Acceptance criteria

- [x] The first account is the administrator; once one exists public sign-up is closed (also reflected in `/auth/me`); the admin setting opens it for members.
- [x] Administrators create users (chosen or generated temporary password), change roles, disable/enable (sessions end at once, login refused), reset passwords (old sessions end), delete users; members get 403 on every admin route.
- [x] A temporary/reset password forces a password change before any other API call; wrong current password rejected; other sessions end after a change.
- [x] The last active administrator cannot be demoted, disabled or deleted (verified on an isolated database); possible once another admin exists.
- [x] Groups: create/rename/delete (unique, case-insensitive), a user in several groups, membership in `/auth/me` and the admin list; non-admins cannot manage them.
- [x] Sharing with a person and with a group; highest level wins; leaving or deleting the group removes its level; revoking the last grant hides the diagram (404); viewers/commenters cannot edit, manage links/access or delete; editors cannot change title or connection link.
- [x] Administrators open, list, edit (title included), share and delete any diagram, without seeing its connection link or being able to use the owner's connections; members are unaffected.
- [x] Directory search works for members (no sensitive fields), short queries return nothing.
- [x] Connections and diagrams are isolated between accounts; link permissions (view/comment/edit, anonymous vs signed-in, downgrade, revoke) behave as specified; CSRF guard, logout, SPA fallback and security headers.
- [x] Browser: first-run/sign-in screens, Admin overlay (create user with temporary password, create group, add member, settings), group share → the member signs in with the temporary password, is forced to change it, and sees the diagram under *Shared with me* read-only with the right permission label and no Admin/Share/Database tabs.
- [ ] `public-only` host policy verified through `/api/schemas` (only the policy functions are tested).
- [ ] Browser check of a *comment*-level member posting a comment and an *edit*-level member saving (API covers both; UI exercised for links and owner flows).
- [ ] E-mail verification, self-service password reset, MFA, SSO, account self-deletion, audit log, session list.
- [ ] Group-owned (shared) database connections — next step on the roadmap.
