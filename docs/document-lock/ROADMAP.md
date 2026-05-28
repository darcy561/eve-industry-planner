# Document lock — roadmap & backlog

This file replaces **`IMPROVEMENTS.md`**. It tracks:

1. **Strategic work** — generalise the lock from **account-partitioned** Redis / JetStream / API to **tenant-partitioned** locks so **account**, **corporation**, and **alliance** scoped documents share one implementation.
2. **Hardening** — observability, tests, UX polish, and small correctness gaps on the **current** account-scoped stack.

> Per item: **status** · **size** (S/M/L) · **where** · **why** · **how** · optional **acceptance**.  
> Add **new** open items at the bottom **without renumbering** existing ids. Strategic multi-tenant items use **#3x** ids to stay distinct from legacy **#1–#23** shipped / hardening ids.

---

## Strategic direction — multi-tenant locks (account | corporation | alliance)

**Product model**

- Every document is scoped to **exactly one** of: **account** (personal), **corporation**, or **alliance** — never outside this set; each doc belongs to one scope family.
- **Alliance** ⊃ **corps** ⊃ **characters** (linked to **accounts**). Users see corp/alliance docs when **character permissions** allow.
- **Separate Mongo collections** for corp vs alliance vs personal job docs are expected; lock always keys on **`(tenant, collection, docID)`** where `tenant` is derived from doc meta, not from “who is viewing.”
- **`_meta`** carries `corporationID` / `allianceID` where relevant, but keeps the **same envelope** as personal jobs so **changestream / WS doc-change** payloads stay uniform.
- Users may have **personal + corp + alliance** docs open at once, **multiple tabs**; each tab keeps **`sessionID`** for holder/waitlist identity; **`accountID`** remains the stable **account** principal for audit and for “who holds this lease” alongside session.

**Lock partition (who shares one Redis row)**

| Scope        | Tenant string (example)   | Everyone who competes for the same lease                          |
|-------------|-----------------------------|-------------------------------------------------------------------|
| Personal    | `account:{accountID}`      | Tabs / sessions for that account on that doc                    |
| Corporation | `corporation:{corpID}`     | All permitted accounts/characters for that corp doc               |
| Alliance    | `alliance:{allianceID}`    | All permitted accounts/characters for that alliance doc         |

**Holder identity**

- Store **both** `holderAccountID` and `holderSessionID` (or one composite `holderPrincipal`) so: (a) multi-tab same account is distinguishable, (b) two different accounts under the same corp share one partition but different principals.

**Not in scope for “one lock”**

- Do **not** key corp/alliance docs by viewer `accountID` in Redis — that would split locks per user and break mutual exclusion across the org.

### #30 — `LockTenant` type and canonical string encoding

- **Status**: open · **Size**: M · **Where**: new `documentlock/tenant.go` (or `locktenant.go`); callers thread `LockTenant` instead of raw `accountID` string.
- **Why**: today `LockKey(accountID, collection, docID)` and `doc.lock.{accountID}` bake in account-only tenancy.
- **How**: define `LockTenant { Kind account|corporation|alliance; ID string }` and `func (t LockTenant) String() string` → e.g. `account:uuid`, `corporation:uuid`, `alliance:uuid` (prefix avoids ambiguous bare UUIDs). Migration: existing docs map to `account:{_meta.accountID}`.

### #31 — Redis keys, waitlist, pulse, viewers use tenant string

- **Status**: open · **Size**: L · **Where**: `documentlock/redis.go`, all key builders, Lua scripts that receive keys, `holder_require.go`, `status_pipeline.go`, `cascade_pipeline.go`, `viewer.go`, `expiry.go` keyspace subscription routing.
- **Why**: every Redis structure must share the same first-key segment as today’s `accountID` slot.
- **How**: replace `LockKey(accountID, …)` with `LockKey(tenant LockTenant, …)` internally using `tenant.String()`; update expiry subscriber to parse tenant from key (extend key layout or embed kind in key already via prefix). Port **#40** `lease_rebind.go` + presence ingress to tenant keys (same solo/contested rules per corp/alliance doc). **Acceptance:** miniredis tests for corp tenant: two logical “accounts” contend for one lock row; solo rebind on acquire for uncontested corp doc.

### #32 — JetStream subjects and WebSocket fan-out by tenant

- **Status**: open · **Size**: M · **Where**: `documentlock/publish.go`, `shared/core/nats/constants.go` (`SubjectDocLock`), `websocket/server/nats_doc_lock.go`, subscription / `broadcastRawToAccount` → tenant-based broadcast (new helper or parameterised bucket).
- **Why**: today `doc.lock.{accountID}` and `broadcastRawToAccount` only reach account-scoped listeners.
- **How**: publish to `doc.lock.{tenantString}`; WS clients subscribe to **all tenants** needed for open routes (union). Echo suppression by `sessionID` unchanged; consider suppress by principal if needed.

### #33 — `LockRecord` and waitlist entries: holder principal

- **Status**: open · **Size**: M · **Where**: `documentlock/redis.go` JSON, Lua scripts in `atomic.go`, HTTP JSON responses if they expose holder fields, **409** `rejected[]` shape in `lock_http.go`.
- **Why**: cross-account same tenant must not treat different users as the same holder.
- **How**: add `holderAccountID` (or reuse `AccountID` field with documented semantics “holding account”) + keep `holderSessionID`; waitlist stores same composite. API **409** returns enough for UI (“another character/session”).

### #34 — AuthZ + API write gates resolve tenant from document

- **Status**: open · **Size**: L · **Where**: `holder_require.go` signatures, all gated handlers, new corp/alliance route modules, session middleware that attaches **allowed tenants** or resolves tenant per request from doc id + collection.
- **Why**: holder check must use **document tenant** Redis key; auth must prove session may act for that tenant (character → corp/alliance rules).
- **How**: central `ResolveLockTenant(ctx, collection, docID) (LockTenant, error)` from Mongo; `CollectLockHeldElsewhereRejects(ctx, rdb, tenant, sessionID, …)`; align with **#20** pattern. Dual-read personal docs during migration.

### #35 — Frontend: scope state keyed by tenant

- **Status**: open · **Size**: L · **Where**: `documentLockSlice.js` scope key, `useDocumentLock`, `useLockScopeSync`, `applyDocumentLockStatusFromPayload`, `documentLockClient.js`, selectors, **persist gate** helpers (generalise `useActiveJobPersistGate` or parallel hooks for corp/alliance editors).
- **Why**: Zustand + WS routing must not collapse two corp docs or corp vs personal when `docID` collides across collections.
- **How**: scope key = `f(tenantString, collection, docID)`; pass tenant into lock HTTP calls; WS handler dispatches to correct scope by payload `tenant` + `collection` + `docID`.

### #36 — Force-release, handover, and admin semantics for corp/alliance

- **Status**: open · **Size**: M · **Where**: `ForceReleaseSameAccount`, handlers, UI copy in `DocumentLockHeaderControl.jsx`.
- **Why**: “same account, different session” is insufficient when holders are different accounts under one corp.
- **How**: define product rules (e.g. corp officer may force-release any session in tenant; alliance role mirrors). New reasons / API fields as needed.

### #37 — Cascade and group→job dependencies under tenant

- **Status**: open · **Size**: M–L · **Where**: `cascade.go`, `cascade_pipeline.go`, group membership (#19) paths; any Redis materialised sets (**#8**) must key by **tenant**, not hard-coded account, when group docs become corp-scoped.
- **Why**: cascade today assumes account-scoped group + job ids in Mongo lookups.
- **How**: thread `LockTenant` through cascade drivers; revisit Mongo queries for corp/alliance collections.

---

## Shipped snapshot — account-scoped stack (today)

- **Edit Job** — dual `useDocumentLock` for job + group when `activeGroupID` matches job `groupID` (`useEditJobDocumentLocks.js`); header primary prefers job scope.
- **Quiet solo UI + snackbars** — contention-gated ownership toasts (`useLockVacancySnackbar` + `scopeHasOtherSessionContention`), extend nudge (`useLockExtendNudgeSnackbar` / `DOCUMENT_LOCK_RENEW_REQUEST_EVENT`) only under lease pressure, mount bootstrap (`lockScopeBootstrapped`) to avoid vacant-icon flash; see [FRONTEND.md § Snackbars](./FRONTEND.md#snackbars).
- **Solo vs contested lease (#40)** — one policy for **every** lockable document (`collection` + `docID`): uncontested acquire → long solo TTL (24 h), no client `/extend`; any other session on the doc (passive viewer or waitlist) → server rebind to contested (5 min) + holder extend cycle; uncontested again → rebind solo. Same hooks on Edit Job, Group page, and any future `useDocumentLock` mount; planner cards read the same Redis rows via batch status. Details: [FRONTEND.md § Quiet solo](./FRONTEND.md#quiet-solo-policy), [BACKEND.md § extend / rebind](./BACKEND.md#http-surface).
- **API #20** — pipelined holder gate on gated private writes when Redis configured; **409** `lock_held_elsewhere`; SPA patch + `DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE`; `Pipeline.Exec` ignores aggregate `redis.Nil` on batched GET.
- **Frontend #21** — vacancy self-heal in `useLockAcquireRelease`; persist gate on save/delete/leave/sibling links.
- **Policy #22** — gated set = read-only-disabled controls + **#21** persist paths; no blanket holder migration unless a gap is found.

---

## Done (legacy ids — shipped)

- [x] **#1–#3, #5, #7** — Atomic Lua, single-leader expiry, pipelined Redis, batched cascade event, canonical key/wire.
- [x] **#10, #11** — Decomposed `useDocumentLock`; Vitest surface + `useLockAcquireRelease.test.jsx`.
- [x] **#15–#17** — Force-release same account, `held` reducer, explicit `holder_release` reason.
- [x] **#19** — Group membership-add cascade (`BulkUpsertGroups` + `group_membership_added`).
- [x] **#20** — API holder enforcement (`holder_require`, `lock_http`, gated routes).
- [x] **#21** — Vacancy self-heal + `useActiveJobPersistGate` / tooltips / leave confirm.
- [x] **#22** — Edit-job gate scope **policy** (documented gated set; opportunistic widening only).
- [x] **#40** — Solo vs contested lease modes (collection-agnostic; `lease_rebind.go`, gated extend loop).

---

## Shipped — #40 Solo vs contested lease (all documents)

- **Status**: shipped (account-scoped) · **Size**: M (delivered) · **Where**:
  - Backend: `documentlock/lease_rebind.go`, `presence_ingress.go`, `atomic.go` (acquire / extend `cycle_reset` / request queued), `redis.go` (`LeaseMode`, `SoloHolderLockTTL`), `payload.go` (`leaseMode` on status/extend JSON).
  - Frontend: `scopeHasLeasePressure` (= `scopeHasOtherSessionContention`), `useLockLeaseContentionEffects`, gated `useLockExtendLoop` / `useLockSyncHeartbeat` / `useLockExtendNudgeSnackbar`.
- **Why**: solo editors should not run the 5 min renew→probe cycle or extend snackbars; another session on the **same doc** (any collection) must override solo the way cross-session pressure already overrides “quiet” UI — analogous in spirit to **#15–#17** force-release breaking another session’s exclusive hold (viewers rebind TTL; force-release still deletes the row).
- **Scope — same process everywhere**:
  - Any route that mounts `useDocumentLock(collection, docID, …)` gets identical behaviour. No job-only or group-only fork in lease logic.
  - **Edit Job** — independent solo/contested state per scope (job row + group row when the job belongs to a group); each scope has its own `leaseMode` in Redis.
  - **Group page** — group `collection` + `groupID` uses the same acquire / viewer / request / rebind paths.
  - **Job planner / list** — does not mount per-card `useDocumentLock`; batch `/lock-state` reflects the same `leaseMode` / expiry fields the editor uses.
  - **HTTP + WS** — `viewer-arrived` / `viewer-departed` and `POST /request` (queued) drive rebind; not editor-specific handlers.
- **State machine (per document row)**:

  | Phase | Server `leaseMode` | Redis TTL | Holder client `/extend` |
  |-------|-------------------|-----------|-------------------------|
  | Uncontested holder | `solo` | ~24 h | Off |
  | Passive viewer and/or waitlist | `contested` | ~5 min | On (+ nudge ≤30 s) |
  | Last viewer gone, empty waitlist | `solo` | ~24 h | Off |
  | Extend `cycle_reset`, empty waitlist | `solo` | ~24 h | Off |

- **Triggers to leave solo**: first passive `viewer-arrived` (different `sessionID` than holder); `request` → `queued`; extend probe cycle when waitlist alive (unchanged). **Return to solo**: `TryRebindHolderLeaseSoloIfUncontested` on last `viewer-departed` with empty waitlist; extend `cycle_reset` when no alive waitlist head.
- **Multi-tenant (#30–#37)**: rebind scripts and ingress must thread **`LockTenant`** when Redis keys move off raw `accountID` — behaviour is unchanged, only the key prefix.
- **Follow-ups (open)**: **#4** metrics (`lease_rebind` outcomes); **#6** rebind vs `Extend` races; **#9** extend/probe Lua aligned with `leaseMode`; **#38** how voluntary `Release` interacts with long solo + passive viewers.

---

## Remaining — Hardening (account-scoped implementation)

### #4 — Observability for the lock subsystem

- **Status**: open · **Size**: M · **Where**: new `documentlock/metrics.go` + wire in `Service`, cascade, expiry, `v1endpoints/documentlocks`; align with `shared/telemetry/apimetrics`.
- **Why**: prove transitions, WS vs HTTP share, cascade volume in prod.
- **How**: counters for `doc_lock.transition{op,outcome}`, `doc_lock.event_published{event,reason}`, `doc_lock.cascade_jobs_released{reason}`, `doc_lock.transport{http|ws}`, `doc_lock.expiry_promotions{outcome}`, `doc_lock.lease_rebind{from,to,trigger}` (**#40**); histogram `doc_lock.hold_seconds`; optional OTel spans on `Service.*` and cascade.

### #6 — Close the missing concurrency cases

- **Status**: open · **Size**: S · **Where**: `documentlock/atomic_concurrent_test.go`.
- **How**: `HandOver` vs `Extend` race; TTL vs mid-`HandOver` with `miniredis.FastForward` + manual expiry publish; **#40** `RebindHolderLeaseContested` vs concurrent `Extend` / `viewer-arrived`.

### #8 — Materialise group→jobs membership in Redis

- **Status**: open · **Size**: M · **Where**: `cascade.go`, group PUT/DELETE, optional changestream.
- **Note**: when **#30+** land, any new `doc_lock_group_jobs:…` key must use **tenant** string, not raw `accountID`, if group documents become corp-scoped.

### #9 — Smarter probe selection in `Service.Extend`

- **Status**: open · **Size**: S–M · **Where**: `extendLockScript` + viewer ZSET in Lua.
- **Note**: **#40** already sets `cycle_reset` → solo when the waitlist is empty; probe/waitlist work should treat `leaseMode` as part of the extend state machine, not only `extendCount`.

### #12 — Split `DocumentLockHeaderControl.jsx`

- **Status**: open · **Size**: M · **Where**: `frontend/src/Components/Header/…`

### #13 — Rename `MAX_STATUS_BATCH_DOC_IDS` → `MAX_LOCK_STATE_BATCH_DOC_IDS`

- **Status**: open · **Size**: S · **Where**: `documentLockClient.js`, `documentlock/status.go`; deprecated re-export one release.

### #14 — `AbortController` for in-flight lock-state fetches

- **Status**: open · **Size**: S · **Where**: `applyPrivateHeaders.js`, `useLockScopeSync.js`.

### #23 — Planner-only grace: no `tryAcquire` until mount (optional)

- **Status**: open · **Size**: S · **Where**: `applyDocumentLockStatusFromPayload.js` vs mounted `useLockAcquireRelease`.
- **How**: document as intentional, or one-shot acquire on navigation to edit.

### #18 — `documentlock.logFields` helper

- **Status**: open · **Size**: S · **Where**: new helper + replace ad-hoc field lists in `documentlock` + `documentlocks` handlers.

### #38 — Promote a successor on voluntary holder `Release`

- **Status**: open · **Size**: M–L · **Where**: `documentlock/atomic.go` (`releaseLockScript` or successor), `service_ops.go::Release`, `events.go` reasons; frontend `useLockWsListener.js`.
- **Why**: today `POST /release` **deletes** the row and publishes `document_lock_released` only. **TTL expiry** and **`/hand-over`** promote the waitlist head; passive read-only viewers are **not** promoted — they get `released` → vacant → `#21` `tryAcquire` race. With **#40**, holders may sit on a long **solo** lease while viewers watch without entering the extend loop — product choice for promotion on release is more visible.
- **Product rules (proposed)**:
  1. On voluntary `Release`, if the **waitlist** has an alive head → promote (same as expiry / hand-over) → `document_lock_handoff_completed`.
  2. Else if the **viewer ZSET** has any alive session → promote **one** (e.g. earliest viewer) → `handoff_completed`.
  3. Else → neutral `released`.
- **Doc freshness**: **not** coupled to promotion — see **#39**. WS already updates `jobArray`; edit-job `activeJob` is opt-in via merge notification.
- **Frontend interim**: `RELEASED` + `holder_release` on read-only tabs → `syncLockFromServer()` instead of vacant patch.
- **Acceptance**: holder closes with one read-only viewer on same job → viewer receives `handoff_completed`, `lockHeld` true; doc content handled by **#39** (merge snackbar or auto-apply when not dirty).

### #39 — Edit-job: notify on remote doc change; opt-in merge into `activeJob`

- **Status**: open · **Size**: M · **Where**: `useEditJobRemoteDocNotice` (mount from `editJob.jsx`), post-coalesce hook in `inboundJobDocumentsCoalesce.js`, `snackbar.jsx` action (e.g. `EDIT_JOB_REMOTE_DOC_UPDATE`), `mergeRemoteJobIntoActiveJob.js`, edit reducer reset branch; **groups unchanged** (`groupArray` / planner already follow WS — no local fork).
- **Why**: `activeJob` is forked at mount (`useEditJobInitialState`); WS upserts only touch `jobArray`. Two layers: **planner truth** (`jobArray`, always updated) vs **edit surface** (`activeJob`, user opt-in). No `GET` — remote payload is already in `jobArray` after coalesce.
- **Detection**: on `/editjob/:jobID`, when `docID === jobID` and `metaLastModifiedMs(remote) > metaLastModifiedMs(activeJob._meta)` → stash **pending remote** (pointer to `jobArray` row or WS document); dedupe coalesced upserts to one pending version / one snackbar.
- **Notification flow**:
  1. WS → existing coalesce → **`jobArray` always updated** (unchanged).
  2. If viewer has **local dirty** (`jobModified` or ephemeral queues below) → snackbar: *“This job was updated elsewhere”* with **Merge** / **Dismiss** (no auto-hide; pattern like `DOCUMENT_LOCK_EXTEND_NUDGE`).
  3. **Dismiss**: keep `activeJob`; `jobArray` already has server copy.
  4. **Read-only** on edit job (no local edits): **auto-apply** merge (no snackbar) — covers holder save + leave before **#38** promotion.
- **Merge semantics (v1 — “accept remote”, not 3-way / field blend)**:
  - **Not** field-level merge, **not** blending local + remote (ambiguous for materials, setups, ESI sets).
  - **Merge** = replace `activeJob` with server document from `findJobInJobArray(jobID)` or `new Job(pendingRemoteDoc)`.
  - Helper `mergeRemoteJobIntoActiveJob({ activeJob, remoteDocument, preserveLayout })`:
    1. `merged = new Job(remote.toDocument())`.
    2. **Preserve session UI only** (if setup still exists): `layout.setupToEdit`, optionally `layout.esiJobTab`, `layout.resourceDisplayType`. All persisted fields in `Job.toDocument()` (`build`, materials, purchases, ESI link sets, `jobStatus`, `layout.materialPriceOverrides`, etc.) come from **remote**.
    3. **Recompute** `estimatedInstallCost` per setup (same as `useEditJobInitialState` + world data).
    4. `setActiveJob(merged)`; `jobModified = false`.
    5. **Reset ephemeral edit-session state** (not in Mongo): `temporaryChildJobs`, `esiDataToLink`, `parentChildToEdit`. Snackbar warns when any of these or `jobModified` would be discarded.
    6. `backupJobRef.current = new Job(merged)` (leave/discard path stays consistent with `useEditJobLeaveConfirm`).
    7. Clear pending remote; dismiss snackbar.
- **Out of scope for v1**: per-field dirty tracking; 3-way merge; `GET /job-documents` refetch (WS miss / `syncInProgress` drop → optional v2 fallback or planner resync only).
- **v2 (optional)**: pre-merge review dialog (summary: name, step, setup count, material totals) — still server-wins replace; or per-section “apply remote materials only” (each section still full replace, not blend).
- **Locks (#38)**: promotion does **not** auto-merge. If pending remote exists when becoming holder, user merges (or read-only already auto-applied). `doc.update` vs `handoff_completed` ordering independent.
- **Echo**: holder’s writing tab is WS echo-suppressed — no self-notification.
- **Acceptance**: holder saves + closes; read-only viewer’s form matches saved data without manual refresh; holder with local edits sees snackbar, Dismiss keeps stale form, Merge matches `jobArray` and clears dirty; planner/group cards always show server row; second WS while snackbar open updates pending payload once.

---

## Recommended pickup order

1. **#30–#32** (tenant type, Redis, JetStream/WS) — foundation for everything else; can be developed behind feature flag with all traffic mapped to `account:{id}` initially.
2. **#33–#35** (record shape, API, SPA scope key) — vertical slice for one corp collection pilot.
3. **#36–#37** (admin + cascade) — after first corp/alliance editor ships.
4. **#4** observability — ideally early in **#31** so multi-tenant rollout is measurable.
5. **#13**, **#6**, **#9**, **#4** (`lease_rebind` metrics) — small wins on current stack in parallel where capacity allows (**#40** shipped; harden and observe).
6. **#39** edit-job remote doc notice + merge (decouples doc freshness from locks); **#38** promote-on-release.
7. **#12**, **#8**, **#23**, **#14**, **#18** — polish and perf as before.

---

## Obsolete reference

Older notes and numbering lived in **`IMPROVEMENTS.md`** (removed). Git history retains that file for archaeology.
