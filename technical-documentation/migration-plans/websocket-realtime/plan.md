# Websocket realtime — promotion plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

The realtime work shipped. What remains is a documentation debt: this folder holds the only
written record of some current behaviour, mixed with design text that no longer matches the code.

This project verifies each claim against the code, promotes what is accurate into live SoT, and
then retires the folder.

## Why the folder cannot simply be deleted

Two problems sit on top of each other.

**Unpromoted behaviour.** Org-scope authorization, the outbound routing model, and the delivery
envelope are documented only here. Deleting today loses them.

**Stale design text.** Parts describe a system that no longer exists. Most importantly the folder
describes a **JWT ceiling** with `corporations[]` / `alliances[]` in `InternalClaims`. The
websocket server has no JWT: identity comes from the `eip_session` cookie resolved against Redis,
and the scope ceiling is the session's grants. Promoting the folder as written would publish an
authorization model the code does not implement.

Verified claims are recorded below. Only those get promoted.

## Verified against code

Checked against `services/websocket/server/**` on `Development`.

| Claim | Verdict | Evidence |
|-------|---------|----------|
| Scope ceiling is a JWT claim set | **Wrong** — no JWT in the websocket server | `handler.go:73` resolves identity via `apihelperauth.ExtractAccountSession`; ceiling is `identity.Session.Grants` at `handler.go:195` |
| Dispatch precedence account → corporation → alliance → explicit | **Accurate** | `dispatch.go` `deliverOutboundDocUpdate` |
| `upgrade_scopes` / `scopes_ack`, requests filtered against the ceiling and merged | **Accurate**, ceiling is session grants | `scope_upgrade.go:16-27` |
| Invalid ids dropped silently; nothing valid means no pools joined | **Accurate** | `scope_upgrade.go:17-19` |
| `scopes_ack` carries `subscription.{account,corporation,alliance}` | **Accurate** | `scope_upgrade.go:36-40` |
| Session handoff carries `corporation_ids` / `alliance_ids` | **Accurate** | `session_resume.go:28-29` |
| Scopes re-checked against the ceiling on resume | **Accurate** | `session_resume.go:201` `replaceScopesWithinSessionGrants` |
| Message scopes narrow delivery: `corporationIDs`, `accountIDs` | **Accurate** | `outgoinglogic/decode.go:11-19,56-63` |
| Outbound partition keys `account:` / `corporation:` / `alliance:` / `explicit:`, FNV sharded | **Accurate** | `outbound_doc_update.go:33-50` |
| Full shard queue delivers inline rather than dropping | **Accurate** | `outbound_doc_update.go:62,82-85` |
| Lock order `corpIndexMu` before `allianceIndexMu` | **Accurate**, already in code | `org_indexes.go:32,104-123` |
| Subscribe ACL fail-closed, singleton by id vs Mongo `_meta.accountID` | **Accurate**, already in code | `subscribe_auth.go:19-63` |
| Lazy per-org workers | **Never built** | fixed FNV shards instead |
| SPA sends `upgrade_scopes` | **Never built** | no sender in `frontend/src/` |

## Findings that outlive this folder

**Org-scoped delivery is server-complete and client-unused.** The server ships scope upgrade,
org pools, and resume, but the SPA never sends `upgrade_scopes`. Recording this in live SoT keeps
the gap visible once the folder is gone.

**Two code comments name a JWT that no longer exists.** `natslogic/locks.go:31` and its test call
the session id a "JWT session id". The mechanism is right and the name is stale.

## Phases

Phase 1 is this file. Later stages run only after that gate.

### Stage A — promote org scopes and routing

Into `backend/websocket/websocket.md`: dispatch precedence, the `upgrade_scopes` / `scopes_ack`
exchange with the session-grant ceiling, handoff scope fields and the re-check on resume, outbound
partition keys with the ordering guarantee and the inline-delivery caveat.

Lock order and subscribe ACL are already documented at their call sites and are not repeated.

### Stage B — promote the delivery envelope

Into `backend/core/core.md`: the fields carried alongside the subject, and how `scopes` narrows
delivery under a corporation or alliance root.

### Stage C — record the client gap

Into `frontend/auth/spa.md`: the `connected` subscription hint, and one line stating the SPA does
not send `upgrade_scopes`.

### Stage D — retire the folder

Delete all files here, and the inbound links from `backend/websocket/contents.md` and the section
task map.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| A — org scopes and routing | Not started |
| B — delivery envelope | Not started |
| C — client gap | Not started |
| D — retire folder | Not started |

## Done when

- Live SoT carries the verified behaviour above, with no reference to a JWT ceiling.
- This folder is deleted and no dangling links remain.

## Handoff status

**Start here:** Stage A. Nothing is in flight.

The stale JWT comments in `natslogic/locks.go` are unrelated to promotion and can be fixed
separately at any time.
