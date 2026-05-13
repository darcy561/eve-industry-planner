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
- [x] **#10 — Decompose `useDocumentLock.js`.** Thin coordinator `frontend/src/Hooks/DocumentLock/useDocumentLock.js` plus `useLockAcquireRelease.js`, `useLockExtendLoop.js`, `useLockSyncFromServer.js`, `useLockSyncHeartbeat.js`, `useLockViewerPresence.js`, `useLockVacancySnackbar.js`, `useLockWsListener.js`, `useLockReadOnlyGrace.js`, `documentLockHookShared.js`. Public `useDocumentLock` API unchanged. Initial `renderHook` coverage for sub-hooks is in **#11**; optional follow-up: `useLockAcquireRelease`, `useLockExtendLoop`, `useLockSyncFromServer`, `useLockViewerPresence`, `useLockVacancySnackbar`, `useLockWsListener`.
- [x] **#17 — Explicit `holder_release` on voluntary releases.** `LockReleaseReasonHolderRelease` in `documentlock/events.go`; `Service.Release` publishes `reason: holder_release`; `DOCUMENT_LOCK_RELEASE_REASONS.HOLDER_RELEASE` in `documentLockEvents.js`. Legacy clients omitting `reason` remain supported.
- [x] **#16 — `held` mirror via `useReducer`.** `documentLockHeldReducer.js`, `useDocumentLockHeld.js`, and `dispatchHeld` plumbed through `useLockAcquireRelease`, `useLockSyncFromServer`, `useLockExtendLoop`, `useLockWsListener`. `heldRef` updates synchronously inside the functional `useReducer` updater so `/release` and WS holder checks stay race-safe. `keyRef`, `readOnlyGraceRef`, `prevHolderUiRef` unchanged. Pure reducer covered by `documentLockHeldReducer.test.js`.
- [x] **#15 — Same-account force-release.** `POST /api/v1/document-locks/force-release` + `Service.ForceReleaseSameAccount` + Lua `forceReleaseSameAccountScript` in `documentlock/atomic.go`; `LockReleaseReasonForceReleasedSameAccount` in `events.go`; `ErrForceRelease*` in `status.go`; handler audit log in `handlers.go`; `TestForceReleaseSameAccount` in `atomic_concurrent_test.go`. Frontend: `forceReleaseDocumentLockSameAccount` in `documentLockClient.js`, `DOCUMENT_LOCK_RELEASE_REASONS.FORCE_RELEASED_SAME_ACCOUNT`, `forceReleaseSameAccountEditLock` in `documentLockSlice.js` (confirm → POST → clear scope handoff fields → `acquireDocumentLock`), viewer popover **Clear lock (same account)** in `DocumentLockHeaderControl.jsx`. Handoff-field reset inlined in the slice as `clearedHandoffFieldsForSlice()` to avoid importing `documentLockHookShared.js` (that module imports `usersStore` and would cycle the store).
- [x] **#11 — Vitest coverage for the pure lock surface (initial).** `documentLockSlice.test.js` (`patchDocumentLockForScope`, `patchManyDocumentLockScopes`, `resetDocumentLockForScope`, `resetAllDocumentLocks`), `documentLockSelectors.test.js`, `documentLockHeaderSelectors.test.js`, `readOnlyGrace.test.js` (`shouldEndReadOnlyGrace`, `endReadOnlyGraceIfApplicable` with a shimmed `usersStore`), `applyDocumentLockStatusFromPayload.test.js` (holder / other-session / grace + fake timers), `useDocumentLockState.test.jsx` (`vi.hoisted` Zustand shim + `documentLockClient` mocks so Vitest does not hit a `usersStore`↔slice circular import via `realtimeClient`), `useLockReadOnlyGrace.test.jsx`, `useLockSyncHeartbeat.test.jsx`. No HTTP mocks; `documentLockClient` is stubbed only where importing the real slice would pull `realtimeClient` → `usersStore` mid-load. Follow-up: `renderHook` for `useLockAcquireRelease`, `useLockExtendLoop`, `useLockSyncFromServer`, `useLockViewerPresence`, `useLockVacancySnackbar`, `useLockWsListener` if desired.

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
5. **#12** — header control split.
6. **#8 (Redis-materialised group→jobs)** — wait for #4 metrics to show whether Mongo is actually hot enough to matter.
7. **#14, #18** — independent polish; pick when convenient.
