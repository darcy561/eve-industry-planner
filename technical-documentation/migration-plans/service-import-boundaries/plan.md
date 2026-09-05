# Service import boundaries — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

No service under `services/` imports another service's packages. Each is its own deployable; code two
services need lives in `services/shared/`.

Six files break this today. All six reach into `api/`, which makes `api` an accidental library for
the rest of the fleet: a change to a request helper there can alter worker, core and websocket
behaviour, and the import graph says the API service must build before they do.

## The crossings

| From | File | Imports | Uses |
|------|------|---------|------|
| core | `core/singleton/jobs.go` | `api/helper/auth` | `RunAuthSessionMaintenance`, `RunAuthSessionMaintenanceLoop`, `SessionCleanupOptionsFromEnv` |
| worker | `worker/tasks/maintenance/prune_expired_sessions.go` | `api/helper/auth` | the same maintenance surface |
| worker | `worker/tasks/esi/update_account_session_grants.go` | `api/helper/auth`, `api/helper/sso` | `UpdateAccountSessionGrants`, `StoreCorporations`, `StoreAlliances`, `ValidateEveSSOToken` |
| websocket | `websocket/server/handler.go` | `api/helper/auth` | `ExtractAccountSession`, `ReadAppSessionCookie`, `ResolvePlannerSessionID`, `PlannerSessionIDQueryParam` |
| websocket | `websocket/server/logging.go` | `api/helper/auth` | `AuthSessionFailureDetailFromError`, `TouchAccountSession` |
| websocket | `websocket/app.go` | `api/middleware` | `RequestLoggingConstructor`, `RequestStartTimeConstructor` |

Three distinct surfaces are involved, not one: **session storage and maintenance**, **EVE SSO token
validation**, and **HTTP request middleware**. They are the parts of `api/helper` that were never
API-specific.

## Destinations

| Surface | Goes to | Why |
|---------|---------|-----|
| Account session read / touch / resolve, and the maintenance sweep | `shared/core/accountsession` (name to confirm) | Sessions are Redis-backed state four services read; the API is one caller among several |
| `ValidateEveSSOToken` and its key handling | `shared/core/eveauth` (name to confirm) | Token validation is an ESI concern, not an HTTP one |
| `RequestLoggingConstructor`, `RequestStartTimeConstructor` | `shared/httpmiddleware` (name to confirm) | Both services serve HTTP; neither owns the other's middleware |

Names are proposals. Confirm them against neighbouring packages before the first move — the rules warn
against a name that confuses ownership, and `shared/core/` already holds `config`, `documentlock`,
`objectstore` and `redis`.

## Phases

Phase 1 is this folder.

### Stage A — Sessions

Move the account-session surface and repoint `api`, `core`, `worker` and `websocket`. Largest of the
three and the one the other two are easiest to judge after.

### Stage B — SSO validation

Move `ValidateEveSSOToken` and whatever key material it reaches for, then repoint `worker`.

### Stage C — HTTP middleware

Move the two constructors, then repoint `websocket`.

### Stage D — Guard

A test that fails when a service imports another service, so the rule stops depending on someone
noticing. Cheapest home is a repo test walking the import graph.

**Done when:** the cross-service scan below reports nothing, and Stage D fails if that changes.

```
for svc in api core worker websocket ws-router capacity-controller; do
  for other in api core worker websocket ws-router capacity-controller; do
    [ "$svc" = "$other" ] && continue
    grep -rl "eve-industry-planner/$other/" --include='*.go' $svc/ | grep -v _test.go
  done
done
```

## Wire compatibility

None of this changes a message, an HTTP contract, or a persisted shape — it moves Go packages and
rewrites imports. Session **key formats and Redis layouts must not change** while moving, or the move
stops being a refactor: a rename there is a data migration and belongs in its own change.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | Done |
| A — sessions | Not started |
| B — SSO validation | Not started |
| C — HTTP middleware | Not started |
| D — guard test | Not started |

## Handoff

**Start here:** confirm the three destination package names, then Stage A.

**Known context:** the rule is not written down in
[`../../technical-rules.md`](../../technical-rules.md), which only states the `services` ↔
`deployment-tool` no-cross rule. Adding it belongs with this project's promote, so the rule and its
guard land together.
