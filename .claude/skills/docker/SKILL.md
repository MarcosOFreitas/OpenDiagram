---
name: docker
description: Use when writing, reviewing or debugging a Dockerfile or docker-compose file, reducing image size or build time, setting up multi-stage builds, healthchecks, volumes or networks, or auditing container security.
---

# Docker

Concrete decisions, not a tutorial. Read the project's AGENTS.md / CLAUDE.md and the existing Dockerfile and compose files first; change what is there rather than regenerating it. After a change, build and run it, and report what you did not run.

## Image size and build cache

- Pin the base image to a specific tag (never `:latest`); pin the digest in CI when reproducibility matters. Prefer `-slim`; alpine only if musl is fine (watch native Python/Node modules).
- Order layers least-changing first: copy dependency manifests, install, then copy source. Never `COPY . .` before the install.
- Multi-stage: a build stage with the SDK and dev dependencies, a runtime stage with only artifacts. The final image has no build tools, no source, no dev dependencies.
- Clean package caches in the same `RUN` (`rm -rf /var/lib/apt/lists/*`, `pip install --no-cache-dir`). Use BuildKit cache mounts for package caches.
- Always have a `.dockerignore` (at least `.git`, `node_modules`, `__pycache__`, `.env`, build output).
- Node: `npm ci`, production dependencies only in the runtime stage. Python: install into a prefix in a builder stage, copy it to a slim runtime.

## Compose

- Healthcheck on every service others depend on; `depends_on` with `condition: service_healthy`. The check command must exist in the image: slim images often lack `curl` and `wget`, so install one or use the runtime itself.
- Named volumes for persistent data; bind mounts only for development hot reload.
- Publish only ports that need outside access; internal-only networks for backends (`internal: true` also cuts their outbound internet, so a service that must download something cannot sit only there).
- Config through `env_file` or `${VAR:-default}`; commit `.env.example`, never `.env`. Dev vs prod through profiles or override files.
- Pin image versions; set resource limits on shared hosts.

## Security checklist

| Check | Fix |
|---|---|
| Runs as root | create a user and `USER` it |
| Secret in `ENV`, `ARG` or a layer | BuildKit `--mount=type=secret`; anyone with the image can read layers |
| `:latest` or unpinned base | pin tag (and digest in CI) |
| Docker socket or `/etc` mounted | do not, except a reviewed dev-only need |
| Extra capabilities, writable root fs | `cap_drop: [ALL]`, `read_only: true` where it works (add `tmpfs: [/tmp]` for the writable paths it needs) |
| No `HEALTHCHECK` | add one |
| Unused `EXPOSE`, broad `COPY` | narrow them; `EXPOSE` is documentation and publishes nothing, so it is hygiene, not security |

## Flag without being asked

`:latest`; no `.dockerignore`; `COPY . .` before dependencies; running as root; secrets in layers; image over 1 GB; missing healthcheck; `apt-get` without cleanup in the same layer.

## Windows with Git Bash

- Git Bash rewrites absolute Unix paths in arguments. For container paths prefix the command with `MSYS_NO_PATHCONV=1` (`docker compose exec`, `docker run -v`), or use a double leading slash.
- Bind mounts from Windows can be slow and differ in permissions and line endings; a shell script with CRLF fails in the container, so keep `.sh` files LF, enforced by a `.gitattributes` line: `*.sh text eol=lf`.
- Database images such as `postgres` declare an anonymous volume for the data directory. Init scripts (`/docker-entrypoint-initdb.d`) run only on an empty data directory, so editing one has no effect until the volume is removed (`docker compose rm -sfv <service>`, then `up`). That deletes the data: confirm it is a throw-away database first. The same applies to `docker compose down -v`, which deletes every named volume of the project.

<!-- Composed from: alirezarezvani/claude-skills docker-development (MIT, Alireza Rezvani; text only): optimize checklist, compose rules, security table, proactive triggers. Scripts, slash commands, Installation, Related Skills and Go/distroless patterns dropped. Windows/Git Bash and volume notes are original. -->
