---
name: security-and-hardening
description: Use when building or changing anything that accepts untrusted input, handles authentication or authorization, stores or returns sensitive data, fetches URLs on the server, runs destructive operations, or adds a dependency. Threat-model first, then apply the controls and check the project's own security rules.
---

# Security and hardening

Treat every external input as hostile, every secret as private, every authorization check as mandatory. Security is a constraint on each line that touches users, data or other systems, not a phase.

**First, read the project's own rules** (`AGENTS.md`, `.specs/`, a security doc). They are binding and usually stricter than the generic list below. A change that weakens one is not done.

## 1. Threat model before controls (five minutes)

1. **Trust boundaries:** where untrusted data enters: HTTP, forms, uploads, webhooks, third-party APIs, queues, model output, and local values another party wrote (a filename on a shared volume, another process's arguments, a path in a payload). Trust follows who *wrote* a value, not the channel that delivered it.
2. **Assets:** credentials, personal data, admin actions, anything destructive.
3. **STRIDE per boundary:** spoofing (authenticate), tampering (integrity, parameterized queries), repudiation (audit log), information disclosure (allowlisted fields, generic errors), denial of service (size caps, timeouts, rate limits), elevation of privilege (authorize on the server, least privilege).
4. **Abuse cases:** "how would I misuse this?" The answer is the first test.

If you cannot name the boundaries of a feature, you are not ready to secure it.

## 2. Tiers

**Always:** validate input at the boundary against an allowlisted schema (shape, length, enums); parameterize every query and never build SQL or shell from strings; encode output (no `innerHTML` or `eval` with data you did not write); check **authorization** on every request on the server, on the specific resource, never only in the UI; fail closed; keep secrets in the environment and out of logs and responses; hash passwords with a slow KDF (scrypt, argon2, bcrypt); session cookies `HttpOnly`, `Secure` behind HTTPS, `SameSite`; generic error bodies, details only in server logs.

**Ask first:** new authentication or authorization logic, a new category of sensitive data, a new outbound integration, CORS changes, file uploads, rate-limit changes, new roles.

**Never:** commit secrets (if one reaches a remote, rotate it first, then purge history); log credentials or tokens; trust client-side validation; expose stack traces; disable a protection for convenience; store auth tokens where scripts can read them.

## 3. Controls that are easy to get wrong

- **Server-side fetches (SSRF).** A URL or host the user influences can aim at internal services. Allowlist scheme and host, resolve *all* DNS records and reject loopback, link-local (`169.254.169.254`), private and reserved ranges for IPv4 and IPv6, forbid redirects, and pin the resolved address on high-risk surfaces (DNS can change between check and use).
- **Destructive operations on derived paths.** Delete, move or overwrite only a target that, after resolving symlinks, is under an allowlisted root, at least one level below it, and carries ownership evidence read beforehand. If it fails, log the rejected target and stop; never fall back to a broader default.
- **Rate limiting.** Strict on authentication endpoints; an in-memory counter is wrong once more than one process serves traffic.
- **Least data.** Return and store only the fields needed; classify personal data when you add it, collect only for a stated purpose, give it a retention limit and a deletion path.
- **Model output is untrusted input.** Never into `eval`, SQL, a shell, HTML or a file path; validate it against a schema, then encode. Text in a prompt (a page, a document) can carry instructions: enforce permissions in code, not in the prompt.

## 4. Dependencies and supply chain

Run the package manager's native audit on the committed lockfile before each release and triage critical/high findings by reachability (runtime, build, test, deploy). Never apply forced fixes automatically (they can cross version ranges): preview, read the changelog, test each upgrade. Document every deferral with a reason and a review date. An audit only knows published advisories: it does not catch a new malicious or typosquatted package, so review new dependencies, lockfile diffs and install scripts (ownership, age, provenance, transitive graph). Do not blanket-approve install scripts.

## Excuses that mean stop

"It is an internal tool." "We will add security later." "The framework handles it." "It is only a prototype." "The audit passed, so the package is safe." "It is just model output." Every one of these is how the hole ships.

## Checklist

- [ ] Project security rules read and respected
- [ ] Boundaries named; abuse case written as a test
- [ ] Input validated at the boundary; queries parameterized; output encoded
- [ ] Authorization on every protected route, on the server, per resource
- [ ] No secrets in code, logs, responses or history; errors generic
- [ ] Outbound fetches allowlisted (SSRF); destructive paths checked
- [ ] Audit clean or every finding triaged with a date; new dependencies reviewed

<!-- Composed for this project from: addyosmani/agent-skills security-and-hardening (MIT, Addy Osmani; threat model, tiers, SSRF, destructive paths, supply chain; privacy, upload, LLM-feature and rate-limit sections shortened, reference files not used). See THIRD_PARTY.md. -->
