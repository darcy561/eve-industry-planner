# Document lock — improvements backlog

Tracking list for the document-lock subsystem (`services/shared/core/documentlock`
plus the frontend `useDocumentLock` family). Each item is sized so it can be
picked up cold without re-deriving the rationale.

> Format per item: **status** · **size** (S/M/L) · **where** · **why** · **how** · optional **acceptance**.
>
> Update the status when you start / ship something, and add new items at the bottom — don't renumber.

## Done

- [x] **#1 — Atomic Lua-script transitions.** `documentlock/atomic.go`; every `Service` op + `PromoteWaitlistHead` runs as one EVAL with JSON outcomes. Race tests in `atomic_concurrent_test.go` cover parallel acquire / hand-over / claim-handoff / request-access.
- [x] **#2 — Single-leader expiry subscriber.** Generic `shared/core/redis/lease` primitive + `core/singleton` runner; `RunExpirySubscriber` lease-gated, hosted in the `core` service. Replaces the "every API replica subscribes" duplicate-work pattern.
- [x] **#3 — Pipelined per-doc Redis ops.** `status_pipeline.go` + `cascade_pipeline.go`; `/lock-state-batch` and group→jobs cascade are now 1–2 RTTs regardless of batch size (was `3N` / `2N`).
- [x] **#5 — Batched group-handoff cascade event.** Single `document_lock_group_cascade` JetStream message carries every release; frontend applies all scope patches in one `patchManyDocumentLockScopes` Zustand transaction. No per-job `released` burst.
- [x] **#7 — Single canonical key & wire shape.** v1 key path, dual-read fallback, and the legacy `inner["type"]` envelope deleted server- and client-side. One key prefix (`doc_lock:`), one Lua signature, one flat WS envelope. Lower bar for #4 (one set of counters, not two).

## Remaining — Backend

### #4 — Observability for the lock subsystem

- **Status**: open · **Size**: M · **Where**: new `documentlock/metrics.go` + wire-up in `Service` ops, cascade, expiry subscriber, and the `v1endpoints/documentlocks` handlers; metrics registered alongside the existing `shared/telemetry/apimetrics/instruments.go` style.
- **Why**: every other doc-lock improvement that's shipped (atomicity, pipelining, batched cascade, v1 deletion) is invisible in prod. No way to confirm wins or catch regressions. Also the prerequisite for the next round of "is it safe to delete" questions.
- **How**: introduce a per-package metrics struct created at startup and threaded through `Deps`. Counters/histograms to instrument:
  - `doc_lock.transition{op=acquire|extend|release|handover|claim|request,outcome=…}` — counter, tagged with the Lua outcome string.
  - `doc_lock.event_published{event,reason}` — counter, fired inside `PublishLockEvent`.
  - `doc_lock.hold_seconds` — histogram, recorded on `released` / `expired` / `handoff_completed`.
  - `doc_lock.cascade_jobs_released{reason}` — counter, fired inside `cascadeReleaseDependentJobLocks` (use the released slice length).
  - `doc_lock.transport{kind=http|ws}` — counter on every Service entrypoint so we can see HTTP-vs-WS share.
  - `doc_lock.expiry_promotions{outcome=promoted|no_alive_head}` — counter inside the expiry subscriber.
  - Optional OTel spans wrapping each `Service.*` op + the cascade.
- **Acceptance**: a Grafana panel showing each counter, plus a check that hold-time histograms are populated end-to-end (acquire → release sequence in a smoke test bumps the bucket).

### #6 — Close the missing concurrency cases

- **Status**: open (most cases already covered by #1 + #3 tests) · **Size**: S · **Where**: `documentlock/atomic_concurrent_test.go` (extend existing suite).
- **Why**: two edge cases the existing race tests don't drive.
- **How**:
  1. `HandOver` racing with `Extend` from the holder side — interleave the two scripts and assert no double-grant, no record corruption, eventual outcome is exactly one of `{promoted, released_no_queue, noop}`.
  2. TTL fires while another tab is mid-`HandOver` — use `miniredis.FastForward` to expire the key and a manual `__keyevent@*__:expired` publish in parallel with a holder `HandOver`. Expected: at most one waitlist head ends up holding the lock, and the cascade event count is exactly 1.

### #8 — Materialise group→jobs membership in Redis

- **Status**: open · **Size**: M · **Where**: cascade hot path in `documentlock/cascade.go` and the group-write paths in `services/api/v1endpoints/groups` (PUT/DELETE) + `core/changestream` if it touches `IncludedJobIDs`.
- **Why**: `cascadeReleaseDependentJobLocks` still reads `group.IncludedJobIDs` from Mongo on every group handoff. Removing that hop puts the cascade entirely on Redis.
- **How**: maintain `SADD doc_lock_group_jobs:{accountID}:{groupID}` alongside every `IncludedJobIDs` write; on cascade, `SMEMBERS` instead of Mongo `FindOne`. Mongo becomes the cold-start fallback when the Redis set is missing (lazy fill from the next group read). Drop the fallback once a deploy cycle of #4 metrics shows the set is always hit.

### #9 — Smarter probe selection in `Service.Extend`

- **Status**: open · **Size**: S–M · **Where**: `extendLockScript` in `documentlock/atomic.go` (and the Lua `find_alive_head` helper).
- **Why**: today the probe is sent to the alive-head of the waitlist — alive only by pulse, not by *currently looking at the doc*. Result: the 20 s probe-ack window can burn on someone who minimised the tab two minutes ago.
- **How**: pass the viewer ZSET key as a 4th KEY to `extendLockScript`. Modify `find_alive_head` to also check `ZSCORE viewers_key <session>` and require a score in the future. Skip and `LREM` queue entries that have a pulse but no current viewer presence.
- **Acceptance**: extend tx with a queue of `[stale, alive-pulse-not-viewing, alive-viewing]` lands the probe on the third entry, not the second.

## Remaining — Frontend

### #10 — Decompose `useDocumentLock.js`

- **Status**: open · **Size**: L · **Where**: `frontend/src/Hooks/DocumentLock/useDocumentLock.js` (~700 lines, 4 refs, 8 effects).
- **Why**: every read of the hook is a 700-line traversal. Each effect has subtle ordering / cleanup invariants that are hard to verify in isolation.
- **How**: extract per-concern sub-hooks behind a thin facade:
  - `useLockAcquireRelease` — owns the imperative acquire / release lifecycle.
  - `useLockExtendLoop` — TTL-renewal interval + probe-pending state.
  - `useLockSyncHeartbeat` — `/lock-state` sync timer + visibilitychange.
  - `useLockViewerPresence` — `/viewer-arrived` / `/viewer-departed` + sendBeacon on pagehide.
  - `useLockWsListener` — `eip-document-lock` listener that fans into the others.
  - `useLockVacancySnackbar` — orphaned-lock pending-access snackbar logic.
  - Parent `useDocumentLock` becomes a coordinator that calls these and exposes the same public return shape (preserves call sites).
- **Acceptance**: existing call sites compile unchanged; each sub-hook has at least one `renderHook` test (lands as part of #11).

### #11 — Vitest coverage for the pure lock surface

- **Status**: open · **Size**: M · **Where**: new `frontend/src/...` tests next to the modules listed below.
- **Why**: the only frontend lock test today is the implicit "it works in the planner" smoke. Pure functions and selector logic are easy wins.
- **How**: tests for —
  - `Zustand/documentLockSlice.js` — `patchDocumentLockForScope`, `patchManyDocumentLockScopes`, `clearDocumentLockScopes`.
  - `Hooks/DocumentLock/selectors/*` (`documentLockSelectors.js`, `documentLockHeaderSelectors.js`).
  - `Functions/DocumentLock/applyDocumentLockStatusFromPayload.js`.
  - `Functions/DocumentLock/readOnlyGrace.js` — fake timers.
  - `renderHook` tests for `useDocumentLockState.js`.
- **Acceptance**: `vitest run` adds these and they pass against the current store wiring without mocking the network layer.

### #12 — Split `DocumentLockHeaderControl.jsx`

- **Status**: open · **Size**: M · **Where**: `frontend/src/Components/Header/...` (~500 line component).
- **Why**: mixed presentation + derivation + popover-switch logic in one file. Hard to render-test in isolation.
- **How**:
  - Move pure derivation (`scopeContended`, `secondaryScopeSummary`, `showHeaderLockIcon`) into `documentLockHeaderSelectors.js`.
  - Split the popover body into `HolderPopoverContent`, `ViewerPopoverContent`, `OrphanedPopoverContent`; parent picks one based on the scope state.
  - Header icon becomes a small presentational component that takes a derived `{ tone, label, badgeCount }`.

### #13 — Rename `MAX_STATUS_BATCH_DOC_IDS` → `MAX_LOCK_STATE_BATCH_DOC_IDS`

- **Status**: open · **Size**: S · **Where**: frontend `Functions/Endpoints/Pirivate/documentLockClient.js` (+ wherever it's imported) and Go `MaxStatusBatchDocs` in `documentlock/status.go`.
- **Why**: the route is `/lock-state-batch` and the JS event is `document_lock_lock_state_batch`; the constant is the only place still saying `status`. Naming consistency.
- **How**: rename + keep a deprecated re-export on both sides for one release cycle (so chats / branches in flight don't break). Update doc strings.

### #14 — `AbortController` for in-flight lock-state fetches

- **Status**: open · **Size**: S · **Where**: `frontend/src/Functions/Endpoints/Pirivate/applyPrivateHeaders.js` and `Hooks/DocumentLock/useLockScopeSync.js`.
- **Why**: today `useLockScopeSync` cancellation just drops the result; the actual `fetch` keeps running until response. On logout that's a wasted request that fails auth and noisy-logs.
- **How**: plumb an optional `signal` into `requestWithPrivateHeaders`, surface it from the lock client wrappers (`patchPlannerJobLockScopeFromApi`, etc.), wire a cleanup `AbortController` from each `useEffect` that initiates the fetch.

## Remaining — Lower-impact polish

### #15 — Same-account force-release

- **Status**: open · **Size**: M · **Where**: new endpoint under `v1endpoints/documentlocks/`, new `Service.ForceRelease`, new frontend snackbar variant.
- **Why**: today's "Take over" is only available when the lock looks orphaned (pulse stale). The crashed-tab scenario where the original session is gone but the lock isn't yet stale still leaves the user waiting up to 5 min.
- **How**: explicit `POST /api/v1/document-locks/force-release` that requires the requester to be on the same `accountID` as the holder. Confirm dialog client-side; audit log line server-side; publish `document_lock_released { reason: "force_released_same_account" }`. New `LockReleaseReason*` constant on both sides.

### #16 — `useReducer` for `useDocumentLock` state

- **Status**: open (blocked by #10) · **Size**: M · **Where**: the new `useLockAcquireRelease` from #10.
- **Why**: four `useRef`s (`heldRef`, `pendingHandoffRef`, `pendingAcquireRef`, `readOnlyGraceRef`) carry coupled state. A reducer makes the transitions auditable.
- **How**: encode `{ held, readOnly, pendingAcquire, handoffStage, graceUntil }` as a single `useReducer` state; transitions become named actions (`ACQUIRED`, `HANDOFF_PROBED`, `RELEASED`, `GRACE_EXPIRED`, …) that close over the same JetStream events `useLockWsListener` dispatches.

### #17 — Explicit `holder_release` reason on voluntary releases

- **Status**: open · **Size**: S · **Where**: `documentlock/events.go` (+ wherever `BuildReleasedPayload`/equivalent lives) and `frontend/src/Functions/DocumentLock/documentLockEvents.js`.
- **Why**: voluntary releases currently arrive with `reason` absent; the frontend has to discriminate by *missing* field instead of by value.
- **How**: add `LockReleaseReasonHolderRelease = "holder_release"`, set it in every voluntary-release publish (the `Service.Release` happy path), and surface the constant in `DOCUMENT_LOCK_RELEASE_REASONS`. Frontend release handler can then switch on `reason` like every other event.

### #18 — `documentlock.logFields` helper

- **Status**: open · **Size**: S · **Where**: new `documentlock/logfields.go` + replace ad-hoc field lists in every `logs.WarnCtx` / `ErrorCtx` call inside `documentlock` and `v1endpoints/documentlocks`.
- **Why**: today each log line picks its own subset of `{accountID, collection, docID, sessionID, holderSessionID}`. Loki/Grafana filtering is fragile.
- **How**: `func logFields(accountID, collection, docID, sessionID string) []any { return []any{"accountID", accountID, "collection", collection, "docID", docID, "sessionID", sessionID} }`. Use `...slog.Attr` form if the rest of the codebase prefers attrs.

---

## Recommended pickup order

1. **#4 (observability)** — unblocks evidence-based decisions for everything else.
2. **#13 (constant rename)** — trivial, gets `lock-state-batch` naming consistent end-to-end.
3. **#6 (two missing race cases)** — small follow-up to #1, finishes off concurrency coverage.
4. **#9 (viewer-aware probe selection)** — small UX win and uses infrastructure already in place from #1.
5. **#11 (frontend vitest coverage)** — pre-requisite confidence for #10.
6. **#10 (`useDocumentLock` decomposition)** — big refactor; do once #11 has a safety net.
7. **#16, #12** — quality polish on the just-decomposed code.
8. **#8 (Redis-materialised group→jobs)** — wait for #4 metrics to show whether Mongo is actually hot enough to matter.
9. **#17, #14, #15, #18** — independent polish; pick when convenient.
