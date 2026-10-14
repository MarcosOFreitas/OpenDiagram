# Introduction

## OpenDiagram Docs

OpenDiagram is an open-source tool to draw database diagrams (ERDs) by typing code. It uses the popular **DBML** (Database Markup Language): you write text, the diagram follows. It can also **read the structure of a live PostgreSQL or Oracle database** and generate the diagram for you.

> **Info** OpenDiagram runs on your own machine or server (a single Docker image with SQLite storage). Your diagrams and database credentials never leave your installation.

## What you can do

- **Write DBML** in a code editor with autocomplete, inline errors and color pickers, and see the diagram update live.
- **Import from a database** (PostgreSQL, Oracle): tables, columns, keys, indexes, views, enums, sequences and triggers. Sessions are always **read-only** and only read catalog metadata, never your data. See [Import from a database](database-import).
- **Work with large diagrams**: table groups, saved views, detail levels, hiding tables, automatic layouts. See [Working with diagrams](diagram-basics).
- **Generate documentation**: a browsable, searchable page of every table, with comments, plus a standalone HTML or Markdown export. See [Generated documentation](generated-documentation).
- **Share and collaborate**: accounts with roles, sharing with people, groups and links (optionally password-protected). See [Accounts & permissions](accounts-and-sharing).
- **Export** to PNG, SVG, DBML, JSON and SQL for PostgreSQL, MySQL, SQL Server and Oracle. See [Import & export](import-export).

## Where to start

1. Open the app and create the first account: it becomes the **administrator**.
2. Follow [Getting started](getting-started) to draw your first diagram, or go straight to [Import from a database](database-import).
3. Keep [Shortcuts & FAQ](shortcuts-faq) at hand.

## Feature requests and bug reports

OpenDiagram is developed in the open. Use the issue tracker of the project repository to request features or report bugs.
