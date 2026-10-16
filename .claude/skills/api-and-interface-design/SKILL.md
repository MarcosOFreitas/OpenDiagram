---
name: api-and-interface-design
description: Use when designing or changing an HTTP API, a module boundary, an event or message contract, or any public interface, and when a state-changing endpoint, job or consumer can be retried or redelivered. Gatilhos (pt): desenhar API, contrato, endpoint, mudança que quebra clientes, idempotência, retry, reentrega.
---

# API and interface design

Make the right use easy and misuse hard. Applies to REST/GraphQL, module boundaries, queue messages and component props.

First read the project's AGENTS.md / CLAUDE.md and the existing routes: the project's error shape, naming, pagination and auth rules win over anything below. Match them; do not introduce a second style.

## Principles

1. **Hyrum's law.** Every observable behavior (field order, error text, timing, undocumented defaults) becomes a contract once someone depends on it. Expose only what you intend to keep; do not leak internals.
2. **Contract first.** Write the contract (schema, types, status codes, examples) before the code, and commit it with the implementation. Input and output are separate shapes; output carries the server-generated fields.
3. **One error shape.** One body format and one status mapping everywhere (400/422 invalid input, 401 unauthenticated, 403 forbidden, 404 missing, 409 conflict, 5xx never with internals). Never mix throw / null / `{error}` across endpoints. Use the project's shape.
4. **Validate at the boundary.** Validate once where input enters (request bodies, queue messages, env, third-party responses) and trust the validated type inside. Third-party responses are untrusted data. Do not re-validate between internal functions.
5. **Additive change.** Add optional fields and new endpoints; never remove, rename, retype or tighten an existing field. Breaking change needed: run the new shape beside the old one only for the migration window, move callers over, then remove the old (use the `migration` skill if installed). The end state is a single live shape.
6. **Lists and updates.** Paginate every list from day one (stable sort, cursor or page). Partial update is PATCH with only the given fields. Nouns in URLs, verbs in the method.

## Idempotency keys

Accepting `Idempotency-Key` is the contract; honouring it is where money is lost. A key that is accepted but mishandled is worse than no key, because the client then believes a retry is safe.

- **The key names the intent, not the attempt.** The client generates it once and resends it on every retry, or it derives from an immutable id (`charge:v1:<orderId>`). Never a fresh UUID or timestamp per attempt; never `user+amount` (distinct intents collapse).
- **Scope the key per client or tenant** (unique on `(client, key)`), so one caller can never read back another caller's stored response.
- **Claim atomically.** Insert `(client, key, state=in_progress, request_hash)` and let the unique constraint pick the winner. A `SELECT` then `INSERT` is a race. A store that cannot enforce uniqueness in one operation cannot back this.
- **Same key, same payload: replay.** Return the stored response with its original status code, without running the effect again.
- **Same key, different payload:** a client bug; fail loudly (422), never replay the first response.
- **Decide the in-flight duplicate deliberately:** 409 (default, simplest), bounded wait, or 202 plus a status URL. Do not let the second call run just because the first looks stuck.
- **Failures.** Store final outcomes (success, or a definitive business error) so a retry replays them. On a transient or 5xx failure release the key (or mark it retryable) so the client can try again.
- **Three outcomes: success, failure, unknown.** A timeout does not say whether the effect happened. Record the intent before calling out, so a crash leaves evidence to reconcile instead of a silent second charge.
- **Retention outlives the longest redelivery path**, including a dead-letter queue replayed later and provider dispute windows. Queues do not give exactly-once delivery across a consumer crash, so assume at-least-once and make the processing idempotent.
- A state-changing endpoint without a key must be documented as unsafe to retry.

## Recording the decision

Hard-to-reverse choices (public shape, versioning, error model) go in the project's existing decision records, following its format; mark old records superseded, never delete them.

## Red flags

- Different response shapes depending on conditions; inconsistent error bodies.
- A removed or retyped field in a "small" change.
- Unpaginated list; verbs in URLs.
- Check-then-insert idempotency; key regenerated per attempt; same key accepted with another body; retention shorter than the DLQ.

## Done when

- [ ] Contract written and committed; every endpoint has input and output schemas
- [ ] Errors use the project's single shape
- [ ] Validation only at the boundary
- [ ] Changes are additive, or a migration path exists
- [ ] Retryable writes: atomic claim, per-client key scope, payload hash, replay, failure storage, in-flight policy and retention are decided and tested (a concurrent-duplicate test fails on a check-then-insert)

<!-- Composed from: addyosmani/agent-skills api-and-interface-design (MIT, Addy Osmani; Hyrum's law, contract first, error semantics, boundary validation, additive change and the idempotency-key section, adapted in shorter words) and documentation-and-adrs (MIT; the "match the existing convention first" idea, rewritten). TypeScript naming and branded types, the rationalizations table and the reference to a missing skill were dropped. -->
