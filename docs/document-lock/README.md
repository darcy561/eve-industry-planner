# Document lock system

Cross-tab edit coordination for `user_job_documents` (planner jobs) and
`user_job_groups` (job groups). Other sessions on the same account can see who is
editing, queue for access, watch passively, and take over cleanly when the
holder leaves or their lease expires.

The system spans three services and the SPA:

- **`services/api/v1endpoints/documentlocks`** — authoritative state in Redis,
  REST endpoints, cascade helpers, TTL-expiry subscriber.
- **`services/websocket`** — receives lock events on JetStream subject
  **`doc.lock.{accountID}`** and fans them out to every connected tab.
- **`services/core`** — not involved (locks are not Mongo documents).
- **`frontend/src/{Hooks,Functions,Components,Zustand,Events}/DocumentLock`** —
  Zustand mirror, hook, header affordance, scope-aware UI gating.

This README is the cross-stack overview. Implementation detail lives in:

- [FRONTEND.md](./FRONTEND.md) — Zustand slices, hooks, components, event flow.
- [BACKEND.md](./BACKEND.md) — HTTP endpoints, Redis key layout, handlers,
  cascade, expiry subscriber, viewer presence.

## Vocabulary

| Term | Meaning |
|------|---------|
| **`collection`** | Mongo logical collection the lock guards: `user_job_documents` or `user_job_groups`. |
| **`docID`** | Document id within `collection` (jobID or groupID). |
| **`sessionID`** | JWT `session_id` claim. Identifies *one tab*; not the user, not the device. Two tabs of the same account have different sessionIDs and can fight for the same lock. |
| **Holder** | The session in `lockRecord.HolderSessionID`. Has exclusive write access. |
| **Viewer** | A session showing the doc in read-only mode (lock held by someone else). Registered in a Redis ZSET; the holder gets a contention affordance when `viewerCount > 0`. |
| **Waitlist** | Redis list of sessions queued to take over via the "Request access" flow. The head is promoted on holder-handover and on TTL expiry. |
| **Lease** | A holder's TTL window (`DefaultLockTTL` = 5 min). Renewed by `/extend` while the tab is visible. After 3 consecutive renewals the holder consults the waitlist (handoff probe). |
| **Handoff probe** | `/extend` selects the next-in-line as `ProbeTargetSessionID`, publishes `document_lock_handoff_probe`; the targeted client auto-claims via `/claim-handoff`. |
| **Cascade** | When a *group* lock rotates (handoff or TTL promotion), per-job locks held by the old session are force-released. See [BACKEND.md § Cascade](./BACKEND.md#cascade). |
| **Read-only grace** | Client-side 5 s window after a held lock vanishes during which the UI stays read-only — bridges the gap until a `handoff_completed` / `acquired` event confirms the new owner. |

## High-level architecture

```mermaid
flowchart LR
  subgraph SPA["Browser tab (SPA)"]
    direction TB
    Hook["useDocumentLock"]
    Slice["documentLockSlice (Zustand)"]
    Header["DocumentLockHeaderControl"]
    Cards["Job / Group cards"]
    Hook --> Slice
    Slice --> Header
    Slice --> Cards
  end

  subgraph API["services/api"]
    direction TB
    Routes["/api/v1/document-locks/*"]
    Cascade["cascade.go"]
    Expiry["expiry_subscriber.go"]
  end

  Redis[("Redis<br/>doc_lock:v2:*<br/>doc_lock_wait:v2:*<br/>doc_lock_pulse:v2:*<br/>doc_lock_viewers:v2:*")]
  JS["JetStream<br/>doc.lock.{accountID}"]

  subgraph WS["services/websocket"]
    direction TB
    DocLockConsumer["doc.lock consumer<br/>BuildDocumentLockWire"]
    Fanout["broadcastRawToAccount"]
    DocLockConsumer --> Fanout
  end

  Hook -->|"POST /acquire /extend<br/>/release /request<br/>/hand-over /claim-handoff<br/>/viewer-arrived /viewer-departed<br/>/waitlist-pulse"| Routes
  Slice -->|"POST /status-batch<br/>GET /status"| Routes
  Routes <-->|"GET/SET/DEL<br/>LIST/ZSET"| Redis
  Routes -->|"PublishDocLockNotification"| JS
  Cascade -->|"force release"| Redis
  Cascade -->|"publish released"| JS
  Expiry -->|"keyspace __keyevent@*__:expired"| Redis
  Expiry -->|"promote/expired"| JS
  JS --> DocLockConsumer
  Fanout -->|"{type: 'document_lock', payload}"| SPA
  SPA -->|"CustomEvent eip-document-lock"| Hook
```

**One sentence:** Redis is the source of truth, the API enforces transitions,
JetStream broadcasts every transition through the websocket service to every
tab on the same account, and each tab mirrors what it cares about into
Zustand.

## Wire contract (frontend ↔ backend)

Inner-payload `type` strings every fan-out wraps:

| Frontend constant (`documentLockEvents.js`) | Backend constant (`events.go` / `viewer_presence.go` / `expiry_subscriber.go`) | Emitted by |
|---|---|---|
| `DOCUMENT_LOCK_EVENTS.ACQUIRED` (`document_lock_acquired`) | `LockEventAcquired` | `/acquire`, `/request` auto-grant |
| `DOCUMENT_LOCK_EVENTS.RELEASED` (`document_lock_released`) | `LockEventReleased` | `/release`, `/hand-over` fallback, cascade |
| `DOCUMENT_LOCK_EVENTS.REQUESTED` (`document_lock_requested`) | `LockEventRequested` | `/request` (lock contended) |
| `DOCUMENT_LOCK_EVENTS.EXPIRED` (`document_lock_expired`) | `LockEventExpired` | TTL with no live waitlist head |
| `DOCUMENT_LOCK_EVENTS.HANDOFF_PROBE` (`document_lock_handoff_probe`) | `LockEventHandoffProbe` | `/extend` after 3 renewals while waitlist is alive |
| `DOCUMENT_LOCK_EVENTS.HANDOFF_COMPLETED` (`document_lock_handoff_completed`) | `LockEventHandoffCompleted` | `/hand-over`, `/claim-handoff`, TTL promotion |
| `DOCUMENT_LOCK_EVENTS.VIEWER_JOINED` (`document_lock_viewer_joined`) | `LockViewerEventJoined` | `/viewer-arrived` (newly added) |
| `DOCUMENT_LOCK_EVENTS.VIEWER_LEFT` (`document_lock_viewer_left`) | `LockViewerEventLeft` | `/viewer-departed` (removal hit) |

Each payload also includes `accountID`, `collection`, `docID`, plus a subset of
`sessionID`, `holderSessionID`, `requesterSessionID`, `probeTargetSessionID`,
`expiresAtUnix`, `previousHolderSessionID`, `reason`. The WS envelope wraps it:

```json
{ "type": "document_lock", "payload": { "type": "...", ...rest } }
```

See `services/websocket/server/natslogic/locks.go::BuildDocumentLockWire`.

`reason` strings for the three flagged events:

| Reason | Emitted on | Frontend constant |
|---|---|---|
| `group_handoff_cascade` | `released` from `cascade.go` | `DOCUMENT_LOCK_RELEASE_REASONS.GROUP_HANDOFF_CASCADE` |
| `hand_over_no_queue` | `released` from `/hand-over` (requester gone) | `DOCUMENT_LOCK_RELEASE_REASONS.HAND_OVER_NO_QUEUE` |
| `ttl` | `expired` from TTL keyspace event | `DOCUMENT_LOCK_EXPIRY_REASONS.TTL` |
| `holder_handover` | `handoff_completed` from `/hand-over` | `DOCUMENT_LOCK_HANDOFF_REASONS.HOLDER_HANDOVER` |
| `ttl_promotion` | `handoff_completed` from expiry subscriber | `DOCUMENT_LOCK_HANDOFF_REASONS.TTL_PROMOTION` |

## End-to-end flows

### Acquire (uncontested)

```mermaid
sequenceDiagram
  participant T as Tab A
  participant Slice as Zustand slice
  participant API as POST /acquire
  participant R as Redis
  participant JS as JetStream
  participant WS as WS service
  participant OT as Other tabs

  T->>Slice: useDocumentLock mount → tryAcquire
  Slice->>API: { collection, docID }
  API->>R: GET doc_lock:v2:{aid}:{coll}:{id}
  R-->>API: nil
  API->>R: SET ... rec(HolderSessionID=A, exp=now+5m), TTL=5m
  API->>JS: publish doc.lock.{aid}<br/>(type=acquired, sessionID=A, exp)
  API-->>Slice: 201 {acquired:true, expiresAtUnix, ttlSeconds}
  Slice->>Slice: patch lockHeld=true
  JS->>WS: doc.lock consumer
  WS->>OT: {type:document_lock, payload}
  OT->>OT: noop (different docID) or sync
```

### Acquire (contested → read-only)

The non-holder branch returns `200 {held:true, acquired:false,
holderSessionID, viewerCount}`. The hook patches `readOnly: true` and on the
next frame fires off `/viewer-arrived` (see [Viewer presence](#viewer-presence)).

### Holder accepts a request (`/hand-over`)

```mermaid
sequenceDiagram
  participant B as Tab B (requester)
  participant SB as Slice (Tab B)
  participant A as Tab A (holder)
  participant SA as Slice (Tab A)
  participant API as API
  participant R as Redis
  participant JS as JetStream

  B->>SB: click "Request access"
  SB->>API: POST /request
  API->>R: RPUSH doc_lock_wait:v2:..., SET doc_lock_pulse:v2:...:B
  API->>JS: type=requested, requesterSessionID=B
  JS-->>SA: requested → snackbar
  A->>SA: click "Accept"
  SA->>API: POST /hand-over
  API->>R: peekWaitlistHeadAlive → B
  API->>R: SET ... rec(HolderSessionID=B, exp=now+5m), LREM B
  API->>JS: type=handoff_completed,<br/>previousHolderSessionID=A,<br/>sessionID=B,<br/>reason=holder_handover
  API->>R: (if group) cascade-release per-job locks held by A
  JS-->>SB: handoff_completed → syncLockFromServer<br/>then holder branch → lockHeld=true
  JS-->>SA: handoff_completed → syncLockFromServer<br/>then viewer branch → readOnly=true
```

### Lease expiry with alive waitlist (TTL promotion)

```mermaid
sequenceDiagram
  participant R as Redis
  participant E as expiry_subscriber.go
  participant API as documentlocks pkg
  participant JS as JetStream
  participant All as All tabs

  Note over R: doc_lock:v2:... TTL fires
  R->>E: __keyevent@*__:expired
  E->>API: promoteWaitlistHeadOnExpiry
  API->>R: peekWaitlistHeadAlive (pulse check)
  alt alive head found
    API->>R: SET ... rec(HolderSessionID=head, exp=now+5m)
    API->>R: LREM head from waitlist
    E->>JS: type=handoff_completed,<br/>sessionID=head,<br/>reason=ttl_promotion
    opt collection = user_job_groups
      E->>API: ReleaseStaleDependentJobLocksAfterGroupGrant
      API->>R: DEL stale per-job locks
      API->>JS: type=released, reason=group_handoff_cascade (per job)
    end
  else no live head
    E->>JS: type=expired, reason=ttl
  end
  JS-->>All: fanout
  All->>All: read-only grace, then sync
```

### Read-only grace (client-side)

When a tab learns the lock is gone but the next holder hasn't been announced
yet (TTL race), it keeps `readOnly: true` for a 5 s grace window. Any
`acquired` / `handoff_completed` arriving in that window cancels the grace and
installs the new holder. If nothing arrives, the grace expires and the UI
becomes editable so the user isn't trapped on a dead lock.

Frontend code: `frontend/src/Functions/DocumentLock/readOnlyGrace.js`
and per-hook timer in `useDocumentLock.js`.

### Viewer presence

```mermaid
sequenceDiagram
  participant B as Tab B (viewer)
  participant Hook as useDocumentLock (B)
  participant API as POST /viewer-arrived
  participant R as Redis ZSET
  participant JS as JetStream
  participant A as Tab A (holder)

  Hook->>Hook: readOnly transitions true<br/>(effect)
  Hook->>API: { collection, docID }
  API->>R: ZADD doc_lock_viewers:v2:..., B<br/>(score = now + ViewerPresenceTTL)
  alt newly added
    API->>JS: type=viewer_joined, sessionID=B
    JS-->>A: viewer_joined → patch viewerCount++
  end

  Note over Hook: cleanup runs (readOnly=false, unmount, route change)
  Hook->>API: POST /viewer-departed<br/>(or sendBeacon on pagehide)
  API->>R: ZREM ..., B
  API->>JS: type=viewer_left, sessionID=B
  JS-->>A: viewer_left → patch viewerCount--
```

A holder shows the header lock affordance whenever
`viewerCount > 0` even without an explicit request. This is the "passive
viewer" contention signal added so silent observers still trigger the holder's
awareness UI.

## Constants — frontend / backend mapping

Frontend timings live in
`frontend/src/Functions/DocumentLock/documentLockTimings.js`. Backend lease /
TTL values live in `services/api/v1endpoints/documentlocks/lock_redis.go` and
`services/api/v1endpoints/documentlocks/viewer_presence.go`.

| Concept | Frontend | Backend | Notes |
|---|---|---|---|
| Lease length | `LOCK_LEASE_MS` = 5 min | `DefaultLockTTL` = 5 min | Must match. |
| Holder extend cadence | `LOCK_EXTEND_INTERVAL_MS` = 5 min | n/a | Triggered while tab visible + holder. |
| Lock status sync heartbeat | `LOCK_STATUS_SYNC_INTERVAL_MS` = 45 s | n/a | Self-heal for any missed WS event. |
| Post-expiry resync | `LOCK_EXPIRY_RESYNC_INTERVAL_MS` = 15 s | n/a | After cached `expiresAtUnix` passes. |
| Expiry slack | `LOCK_EXPIRY_SLACK_SECONDS` = 2 | n/a | Absorbs client/server clock skew. |
| Waitlist pulse cadence | `LOCK_WAITLIST_PULSE_INTERVAL_MS` = 35 s | `WaitlistPulseTTL` = 2 min | Client must refresh below TTL. |
| Read-only grace | `LOCK_READONLY_GRACE_MS` = 5 s | n/a | Bridges TTL-expiry races. |
| Scope-sync debounce | `LOCK_SCOPE_SYNC_DEBOUNCE_MS` = 200 ms | n/a | Coalesces planner churn. |
| Status batch ceiling | `MAX_STATUS_BATCH_DOC_IDS` = 500 | `MaxStatusBatchDocs` = 500 | Per-array cap (jobs + groups). |
| Planner chunk | `PLANNER_PAGE_JOB_CHUNK_MAX` = 450 | n/a | Reserve slack for groups in first chunk. |
| Probe ack window | n/a | `ProbeAckWaitSeconds` = 20 | Queued client must `/claim-handoff` in this window. |
| Extends per cycle | n/a | `MaxExtensionsBeforeHandoffConsult` = 3 | After this many, `/extend` probes waitlist. |
| Viewer presence TTL | n/a | `ViewerPresenceTTL` = 5 min | Defensive sweep for crashed tabs. |

## Where every file lives

### Backend

```
services/api/v1endpoints/documentlocks/
  router.go            — HTTP route table
  request_context.go   — auth + body parse preamble
  handlers.go          — acquire / extend / release / hand-over / request / status / claim-handoff / waitlist-pulse
  status_batch.go      — POST /status-batch
  viewer_presence.go   — /viewer-arrived /viewer-departed + ZSET helpers
  lock_redis.go        — Redis key layout, lockRecord, promoteWaitlistHead, waitlist helpers
  lock_json.go         — shared JSON response shape (lockPayload, writeExtendJSON)
  events.go            — event type + reason constants + buildHandoffCompletedPayload
  cascade.go           — group handoff cascade (decideHandoffCascadeRelease, decideStaleAfterGrantRelease)
  expiry_subscriber.go — Redis __keyevent@*__:expired listener + waitlist promotion
  *_test.go            — unit tests (events, lock_redis, cascade)
services/api/helper/doclock/publish.go    — JetStream PublishDocLockNotification
services/websocket/server/nats_doc_lock.go — doc.lock consumer
services/websocket/server/natslogic/locks.go — BuildDocumentLockWire wrapper
```

### Frontend

```
frontend/src/Functions/DocumentLock/
  documentLockKey.js                — (collection, docID) → scope key
  documentLockCollections.js        — USER_JOBS_COLLECTION / USER_JOB_GROUPS_COLLECTION
  documentLockEvents.js             — wire-contract constants (type / reason)
  documentLockTimings.js            — timing constants
  documentLockScope.js              — ScopedDocumentLockState initial + merge
  documentLockSelectors.js          — selectScopedDocumentLock / selectDocumentLockReadOnly / filterUnlockedDocumentIDs
  documentLockHeaderSelectors.js    — selectors for DocumentLockHeaderControl
  documentLockStatusFields.js       — numberOrNull, buildGrantedHolderPatch
  documentLockAcquireFeedback.js    — vacancy-notice suppression
  applyDocumentLockStatusFromPayload.js — applies a /status row to Zustand
  readOnlyGrace.js                  — shared grace predicate + patch

frontend/src/Hooks/DocumentLock/
  useDocumentLock.js                — the engine (mount per scope)
  useRegisterHeaderDocumentLockUI.js — page-level header context
  useLockScopeSync.js               — batch sync core for planner pages
  useJobPlannerJobLockSync.js       — planner job-only sync hook
  useJobPlannerPageLockSync.js      — planner job+group sync hook
  plannerLockScopeFromApi.js        — single-scope refresh helper
  useDocumentLockState.js           — ID-shaped hooks for cards (useJobLockReadOnly etc.)

frontend/src/Components/DocumentLock/
  DocumentLockHeaderControl.jsx     — header icon + popover
  LockGatedTooltip.jsx              — uniform "Another session holds the edit lock" copy

frontend/src/Zustand/
  documentLockSlice.js              — scopes map + actions (request, accept, hand-over, claim)
  headerDocumentLockUISlice.js      — registrations array (which scope drives the header)

frontend/src/Events/
  headerDocumentLockEvents.js       — imperative API for the header slice
  editJobReleaseRequestEvents.js    — release-request handler registry (edit-job ↔ slice)

frontend/src/Functions/Endpoints/Pirivate/documentLockClient.js — REST client functions + WS-batch path

frontend/src/Components/Edit Job/Edit Job Hooks/useActiveJobDocumentLock.js
                                    — reducer-shaped hooks for the Edit Job page
                                      (useActiveJobReadOnly, useActiveGroupReadOnly, useSiblingLinkLock,
                                       useLockGatedHandler)
```

For per-layer detail see [FRONTEND.md](./FRONTEND.md) and [BACKEND.md](./BACKEND.md).
