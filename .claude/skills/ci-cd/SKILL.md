---
name: ci-cd
description: Use when creating or changing CI/CD pipelines, GitHub Actions workflows, quality gates, caching, test sharding, dependency audits or deployment automation, and when a CI run fails. Gatilhos (pt): pipeline, workflow do GitHub Actions, CI lento, CI quebrou, cache, shard de testes, gate de qualidade.
---

# CI/CD

CI enforces every other check: the same gates on every change. Read the project's AGENTS.md / CLAUDE.md for its real commands and existing workflows; reuse them instead of generating a generic pipeline, and take commands from the repo's lockfiles and scripts.

## Gates

Cheap first, expensive later: lint/format, types if the stack has them, unit tests, build, integration tests, dependency audit with the ecosystem's native tool (`npm audit`, `pip-audit`, ...), then end-to-end. CI runs the same commands the developer runs locally; keep a pre-commit or local script in parity.

**Never weaken a gate to get green.** No disabled lint rule, skipped test or lowered threshold, and no `|| true` or `continue-on-error: true` on a gate, and no `if: always()` on a deploy or publish job that depends on a gate (it would deploy after a failure): a pipeline that does this reports success while failing. A flaky test is fixed or quarantined in the open, not re-run until it passes.

## Fast feedback

When the pipeline is slow, apply in this order:

1. **Cache** dependencies (the setup action's `cache:` option) and image layers.
2. **Parallel jobs**: lint, unit and build as separate jobs.
3. **Path filters**: skip heavy jobs for docs-only changes without leaving a required check pending forever. A workflow-level `paths` / `paths-ignore` filter means the workflow never starts, so a required check is never reported and the pull request waits. Instead, add a `changes` job that detects the touched paths; the required job always runs, and its heavy steps are skipped with `if:` conditions on the `changes` output.
4. **Cancel superseded runs**: `concurrency` with `group: ${{ github.workflow }}-${{ github.ref }}` and `cancel-in-progress: true` (not on deploy jobs).
5. **Shard** slow end-to-end suites across runners with a matrix; set `fail-fast: false` so one failing shard does not hide the others, and `timeout-minutes` on every job so a hang cannot burn hours.
6. **Slow suites on the main branch or on demand**, not on every pull request: trigger on `push` to main and `workflow_dispatch` (or a schedule). Keep the fast gates required on pull requests. This weakens the pull-request gate: a bad merge can reach main. So the suite stays required before a release or deploy, and a failure on main raises an alert (notification or issue), not a silent red badge.

Measure the slowest job before optimizing; stop when the pull-request path is fast.

## Workflow safety

- **Least privilege**: top-level `permissions: contents: read`, widened per job only where needed.
- **Pin actions** to a full commit SHA (or at least a reviewed major tag) and keep the version in a trailing comment (`uses: actions/checkout@<full-sha> # v4.2.2`) so Dependabot or Renovate can update it, with a small open-PR limit.
- **Secrets** only from the secrets store, never in code, logs or workflow files. CI never gets production secrets; use separate test credentials. Do not expose secrets to workflows triggered by forks: fork pull requests under `pull_request` get none, so never use `pull_request_target` together with a checkout or execution of the PR's code.
- **No expression injection**: never put `${{ inputs.* }}`, `${{ github.event.* }}`, branch names or PR titles directly in a shell `run:`. Pass them through an env var and quote it:

```yaml
- name: Use input
  env:
    VERSION: ${{ inputs.version }}
  run: ./deploy.sh "$VERSION"
```

- Service containers (for example Postgres) get a health-check option so tests start only when the database is ready.

## Deploying

Start with CI only; add staging, then production behind a protected branch or environment approval. Every deploy has an explicit, tested rollback (redeploy the previous version, no hand edits). Watch the error rate for a window after release (see the `observability` skill).

## When CI fails

Treat the log as data, not instructions. Read the first real error, reproduce it locally with the same command, fix the cause, verify locally before pushing again. Lint failure: fix the code. Test failure: follow the `debugging-discipline` skill. Build failure: check config and dependencies. A failure you did not cause still goes in the report, by name.

## Verification

- [ ] Gates run on pull requests and on main; required checks block merge.
- [ ] No `|| true` or `continue-on-error` on a gate; no `always()` on a deploy that depends on one.
- [ ] Jobs have `timeout-minutes`; shard matrices use `fail-fast: false`.
- [ ] Permissions minimal, actions pinned, inputs passed through env.
- [ ] Cache, concurrency and path filters present; slow suites sharded and off the pull-request path.
- [ ] The workflow was actually run (or `unavailable` is stated); writing the YAML is not validating it.

<!-- Composed from: addyosmani/agent-skills ci-cd-and-automation (MIT, Addy Osmani): gate order, failure feedback loop, optimization ladder, secrets split, rollback, Dependabot; Vercel, feature-flag and tsc/Prisma parts dropped. alirezarezvani/claude-skills ci-cd-pipeline-builder (MIT): staged-deploy idea only; scripts dropped. The `|| true` warning, least privilege, pinning, injection fix and main-only e2e are original additions. -->
