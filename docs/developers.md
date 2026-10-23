# Developers: start here

OpenDiagram is a self-hostable database diagramming tool: a DBML editor with a live diagram, generated documentation, and a **read-only** import of the structure of live PostgreSQL, Oracle and MySQL databases, with accounts, sharing, an audit log and an MCP connector for AI clients. One Docker image, one SQLite file.

**Status:** version 1.0 is the single, feature-complete release, under the Apache-2.0 license. Nobody is on call to maintain it: issues and pull requests are read on a best-effort basis, and forks are welcome. These pages are for whoever carries it on, a person or an AI coding agent, with no context beyond the repository.

## Read in this order

1. **This page**: what is where.
2. [Development](development.md): run it, change it, prove the change.
3. `.specs/00-product.md` and `.specs/01-architecture.md` in the repository: what the product is, how it is built, and why the big decisions were taken.
4. `AGENTS.md` in the repository root: the rules every change follows, people and agents alike. The **security invariants** and the **UI standard** there are not negotiable.
5. [Tools](../tools/README.md): the scripts that prove the app works end to end, and the instances they need.
6. [Releasing](releasing.md) and [Forking](forking.md): publishing a version, publishing your own copy.
7. [History](history.md): how the project got to 1.0, and what was cut.

The specs in `.specs/` are the detailed reference, one topic per file (`.specs/README.md` lists them); the pages under *Getting started* to *Release notes* in this site are the user documentation.

## Repository map

| Path | What it holds |
|------|---------------|
| `server/src/` | The API (Fastify, plain ES modules, no build step): routes, accounts, diagrams, connections, the read-only import of each engine, the scheduled refresh, the MCP connector, the SQLite schema. `index.js` declares every route. |
| `server/test/` | Server unit tests (`node:test`), including the real routes through `app.inject`. |
| `web/src/` | The interface (React 18, Vite, JSX): the editor, the diagram, the generated documentation, the administration; `web/src/docsite/` is this documentation site. Unit and component tests sit next to the code. |
| `tools/` | Scripts that check the app from outside: end-to-end checks, the interface audit, documentation pictures, visual and behaviour comparisons, benchmarks. |
| `demo/` | Demo databases (PostgreSQL, MySQL, Oracle, TLS proxies) for trying the import and for the tests. |
| `docs/` | These developer pages. |
| `.specs/` | The specifications: product, architecture, each feature area, security, testing, known limitations and ideas for forks. |
| `.github/` | CI (`ci.yml`), the release workflow (`release.yml`), the end-to-end script (`ci-e2e.sh`), Dependabot, issue and pull-request templates. |
| `.githooks/` | A pre-commit hook that runs the unit tests the staged files can affect (`git config core.hooksPath .githooks`). |
| `.claude/skills/` | Optional guides for AI coding agents (test-first, verification, review, security, SQL, UI review), each tied to this repository's rules in `AGENTS.md`. Nothing in the app depends on them. |

## Where the truth lives

- **DBML text** is the single source of truth for a diagram: import generates DBML, and the diagram, the docs and the exports are built from it. There is no second schema model.
- **Authorization** lives in the server, never only in the interface.
- **Behaviour** is described in the specs, the user pages and the README together; a change updates them in the same commit.
- **What was not tested** is written down: the *Not tested* list of the release notes, and the known limitations in `.specs/06-roadmap.md`.

## Reporting

Security problems go through GitHub's private vulnerability reporting (`SECURITY.md`), never a public issue. Anything else is an issue or a pull request; read `CONTRIBUTING.md` first.
