# Versions & history

OpenDiagram keeps the history of every diagram. It protects you in two ways: it stops two people from silently overwriting each other, and it lets you go back to an earlier state.

## Version numbers and edit conflicts

Every time a change is saved, the diagram gets the next **version number**. Your editor remembers the version it loaded. If somebody else saves in the meantime, your next save is **refused** instead of overwriting their work, and a dialog opens:

- **Load the latest version (discard my changes)** reloads the diagram as saved by the other person. Your unsaved changes are dropped.
- **Keep my changes (overwrite theirs)** saves your version on top. The other version is not lost: it stays in the history.

While the dialog is open, autosave is paused and the status next to the title says **Conflict**. Nothing is written until you choose.

> **Note** The conflict is detected when you save, not while the other person types. There is still no real-time co-editing: two people can work on the same diagram, but the second one to save is asked what to do.

## Who has the diagram open

Next to the title, round **avatars** show the other people who have the same diagram open right now (up to four, then *+N*). Hover one to see the name and what the person is doing: **looking at** a table (the table gets an outline in the person's color with their name) or **editing** (the avatar gets an amber ring while their changes are not saved yet). Visitors of a share link appear as *Guest*.

When someone else saves while you have nothing unsaved, a bar says **Someone saved a newer version of this diagram** with **Load it** and **Dismiss**. If you do have unsaved changes, you are asked what to do when you save (see above).

> **Note** Presence is a heartbeat every few seconds from each open tab, kept in the server's memory only: nothing is stored, and a restart empties it. It shows what people are looking at, not their cursors or text, and edits are still not merged live.

## History

Open **More → History** (people who can **edit**, administrators and the owner). It lists the saved versions, newest first:

| Part | Meaning |
|------|---------|
| Name or **Version N** | the version; the newest one is marked **current** |
| Author and time | who saved it and when (the first entry is the **Original** content) |
| Summary | what changed: tables added or removed by name, and the number of lines added and removed |

- Changes by the **same person within 10 minutes** are grouped in one entry, so typing does not create hundreds.
- Every **refresh from the database** that changes something is saved as its own entry (summary starting with *Refresh from database*), never merged with your edits, so you can compare or restore the state before and after it.
- **Name this version** (for example *Release 1*) puts a name on the current state. Named versions are **never removed**; the unnamed ones keep the latest 60.
- **Compare** shows the DBML lines that changed between that version and now (`-` only in the old version, `+` added since).
- **Restore** makes that version the current one. It is saved as a **new version**, so what you had before is still in the history and you can undo a restore.

The same list appears as the **Changelog** at the top of the [Docs view](generated-documentation) for people who can edit; the HTML and Markdown exports include only the named versions.

> **Tip** Name a version before a risky change, such as a large refresh from the database or a mass edit of the text.

## Who can see the history

The history contains earlier content, so it is available only to people who can **edit** the diagram, the owner and administrators. People with *View* or *Comment* access, and visitors of a view or comment link, do not see it. **Edit links** do not show the history either, but they take part in conflict detection.
