# Introduction

## OpenDiagram Docs

OpenDiagram is a free, open-source tool (Apache-2.0: see [License](license)) to draw database diagrams (ERDs) by typing code. It uses the popular **DBML** (Database Markup Language): you write text, the diagram follows. It can also **read the structure of a live PostgreSQL, Oracle or MySQL database** and generate the diagram for you.

> **Info** OpenDiagram runs on your own machine or server (a single Docker image with SQLite storage). Your diagrams and database credentials never leave your installation.

## What you can do

- **Write DBML** in a code editor with autocomplete, inline errors and color pickers, and see the diagram update live.
- **Import from a database** (PostgreSQL, Oracle, MySQL): tables, columns, keys, indexes, views, enums, sequences and triggers. Sessions are always **read-only** and only read catalog metadata, never your data. See [Import from a database](database-import).
- **Work with large diagrams**: table groups, saved views, detail levels, hiding tables, automatic layouts. See [Working with diagrams](diagram-basics).
- **Generate documentation**: a browsable, searchable page of every table, with comments, plus a standalone HTML or Markdown export. See [Generated documentation](generated-documentation).
- **Share and collaborate**: accounts with roles, sharing with people, groups and links (optionally password-protected). See [Accounts & permissions](accounts-and-sharing).
- **Follow the data**: dashed lineage arrows from source tables to the views built from them, down to the column. See [Data lineage](data-lineage).
- **Connect an AI client**: Claude Code and other MCP clients can read, comment on and edit the diagrams that were shared with them, and never see a database credential. See [Connect Claude (MCP)](connect-claude-mcp).
- **Keep metadata fresh**: the server re-reads linked databases on a schedule, even with nobody connected. See [Import from a database](database-import).
- **Keep history**: every change is saved, versions can be named, compared and restored. See [Versions & history](versions-and-history).
- **Import** SQL (PostgreSQL, MySQL, SQL Server, Snowflake, Oracle) or DBML files from **More → Import**, and **export** to PNG, SVG, DBML, JSON and SQL for PostgreSQL, MySQL, SQL Server and Oracle. See [Import & export](import-export).

## Where to start

1. Open the app and create the first account: it becomes the **administrator**.
2. Follow [Getting started](getting-started) to draw your first diagram, or go straight to [Import from a database](database-import).
3. Keep [Shortcuts & FAQ](shortcuts-faq) at hand.
4. Installing it for a team? Read [Self-hosting](self-hosting) and [Hosting requirements](hosting-requirements) (CPU, memory, disk, network, VPN).

## Feature requests and bug reports

Send questions and bug reports to the people who run your OpenDiagram installation. The project itself takes issues on GitHub, read on a best-effort basis: version 1.0 is feature-complete and nobody is on call.
