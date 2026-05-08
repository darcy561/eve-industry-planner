# Interactions & requests log — WebSocket realtime migration

**Instructions:** Append newest entries at the **top** (below this header). Use ISO dates. Link commits/PRs when available.

---

## 2026-04-22 — Org-scoped realtime: `scopes`, indexes, `upgrade_scopes`, JWT `alliances`

- **Request / context:** Implement alliance/corporation routing with downward **`scopes`**, progressive pools (account-first connect), reverse indexes per replica, and session resume / Redis handoff for upgraded scopes.
- **Decision:**
  - **Dispatch:** `accountID` → account path; else `corporationID` / `allianceID` → `corpToClients` / `allianceToClients` (populated only after **`upgrade_scopes`**); optional message **`scopes`** narrow recipients (alliance: union of corp vs account filters). Single JSON decode per message ([`outgoinglogic/decode.go`](../../../services/websocket/server/outgoinglogic/decode.go)).
  - **JWT:** `InternalClaims` gains **`alliances`** (`[]int64`); **`GenerateInternalJWT`** now takes explicit `corporations, alliances` slices (callers pass `nil` for alliances until populated). Websocket stores **allowed** corp/alliance string sets on the client for upgrade validation.
  - **Inbound WS:** **`upgrade_scopes`** with `corporationIDs` / `allianceIDs`; server responds with **`scopes_ack`** and updated `subscription` flags.
  - **Changestream:** `ChangeStreamMessage` includes optional **`corporationID`**, **`allianceID`**, **`scopes`** extracted from documents / `_meta`.
  - **Docs:** New [ROUTING-AND-SCOPES.md](./ROUTING-AND-SCOPES.md); [IMPLEMENTATION.md](./IMPLEMENTATION.md) and [SCOPED-REALTIME-ROUTING-PLAN.md](./SCOPED-REALTIME-ROUTING-PLAN.md) updated for maintenance pointers.
- **Code touched:** `services/websocket/server/{dispatch,org_indexes,scope_upgrade,session_resume,reader,handler,types,server}.go`, `services/websocket/server/outgoinglogic/{decode,outgoing}.go`, `services/shared/core/internaljwt/jwt.go`, `services/api/v1endpoints/{authenticate,refresh}.go`, `services/core/changestream/watcher.go`, docs under `docs/migrations/websocket-realtime/`.
- **Links:** (none)

---

## 2026-04-22 — SessionID cutover for locks + change-origin dedupe

- **Request / context:** Detach document-lock and change-origin identity from websocket `clientID` churn during JWT refresh/reconnect; enforce single active client per auth session and keep realtime fan-out stable.
- **Decision:**
  - **JWT/auth:** internal JWT claim now includes **`session_id`** (login + login-refresh mint; refresh preserves; refresh backfills when missing on legacy refresh-token rows).
  - **Locks:** API `document-locks` routes now derive identity from JWT `session_id`; lock Redis fields/events/status switched to session-based names (`holderSessionID`, `requesterSessionID`, `probeTargetSessionID`); `rebind` removed.
  - **SPA locks:** `useDocumentLock`, planner lock sync, and delete-group guard compare session IDs (no `eip-ws-client-id-changed` rebind path).
  - **Metadata + headers:** write paths stamp `_meta.sessionID`; private requests include `X-Session-ID` (observability/debug), while lock auth still trusts JWT claims.
  - **Realtime dedupe:** changestream emits `sourceSessionID`; websocket dispatch suppresses self-echo by session first (fallback to client only when session missing).
  - **WS guardrail:** websocket server maintains one active `clientID` per `sessionID`; duplicate session client triggers warning log + metric counter and evicts the previous socket.
- **Code / infra touched:** `services/shared/core/internaljwt/jwt.go`, `services/api/helper/auth/auth_helpers.go`, `services/api/v1endpoints/{authenticate,refresh}.go`, `services/api/v1endpoints/documentlocks/**`, write handlers in `userDoc/applicationSettings/groups/jobs/jobdocuments/archivedjobs`, `services/core/changestream/watcher.go`, `services/websocket/server/{types,server,handler,reader,dispatch,metrics}.go`, frontend lock and auth header paths, docs.
- **Links:** (none)

---

## 2026-04-21 — Remove `userJobSnapshot` store + Firebase `uploadJobSnapshots`

- **SPA:** Deleted Zustand `userJobSnapshot`, former `frontend/src/Zustand/jobsSlice/jobSnapshots.js`, and `frontend/src/Functions/Firebase/uploadJobSnapshots.js`. Planner and dashboard derive lists from **`jobArray`** (e.g. `displayOnPlanner` where relevant). Former `frontend/src/Hooks/useFirebase.jsx` no longer exposed **`userJobSnapshotListener`** (Firestore `ProfileInfo/JobSnapshot`).
- **Persistence:** Call sites use **`saveJobsViaApi`** / **`updateOrAddJobsToJobArray`** instead of snapshot mirror + Firestore snapshot doc.

---

## 2026-04-20 — `user_job_documents`: Mongo API + WS + SPA (planner hydration, debounced saves)

- **Collection:** Mongo `user_job_documents` — same [`models.Job`](../../../services/shared/shared/models/job.go) shape; indexes on `(_meta.accountID, displayOnPlanner)` and `(_meta.accountID, groupID)`; `changeStreamPreAndPostImages` listed in [`scripts/mongo-setup.sh`](../../../scripts/mongo-setup.sh).
- **REST (private JWT):** `GET /api/v1/job-documents/planner`, `GET /api/v1/job-documents/by-group/{groupID}`, `GET /api/v1/job-documents/{jobID}`, `PUT /api/v1/job-documents`, `DELETE /api/v1/job-documents` — wired in [`jobdocuments/router.go`](../../../services/api/v1endpoints/jobdocuments/router.go). No account-wide GET-all.
- **Realtime:** Changestream publishes `accountID` from `_meta` → account broadcast like `user_job_groups`. SPA: [`applyRemoteMessage.js`](../../../frontend/src/Realtime/applyRemoteMessage.js) + [`inboundJobDocumentsCoalesce.js`](../../../frontend/src/Functions/Debounce/inboundJobDocumentsCoalesce.js); persists via [`jobDocumentsPersistSchedule.js`](../../../frontend/src/Functions/Debounce/jobDocumentsPersistSchedule.js) / [`saveJobsViaApi.js`](../../../frontend/src/Functions/JobDocuments/saveJobsViaApi.js) mirroring groups.
- **Firebase:** Job document listeners and Firestore batch update paths removed from login/edit/group flows in favor of API + WS.
- **Locks:** [`documentLockCollections.js`](../../../frontend/src/Functions/DocumentLock/documentLockCollections.js) — `USER_JOBS_COLLECTION` is `user_job_documents`.

---

## 2026-04-19 — Redis document locks + WS fan-out + SPA (header, planner, rebind)

- **Request / context:** Collaborative edit locks live in Redis; the websocket service consumes JetStream `doc.lock.*` and broadcasts `document_lock` JSON to browsers. JWT refresh rotates the WebSocket **client id** (`X-WS-Client-ID`); document-lock **rebind** must not flash **read-only** when Redis already lists the **new** client id as holder (raced or duplicate `eip-ws-client-id-changed`). Planner should reflect group lock state via **push + targeted status GETs**, not per-card polling.
- **Decision:**
  - **Backend:** API `services/api/v1endpoints/documentlocks/` — acquire, extend, release, **rebind** (`previousClientID` → current header), status, request access, handoff helpers; publishes lock events onto NATS for websocket (`doc.lock.{accountID}`). Websocket wraps payloads as `{ type: "document_lock", payload }`; SPA raises `CustomEvent("eip-document-lock", { detail })`.
  - **Frontend store:** `documentLockSlice` scopes by `(collection, docID)`; selectors for read-only vs holder (`documentLockSelectors.js`). **`useDocumentLock(collection, docID, enabled)`** drives acquire/sync/extend intervals and listens for `eip-document-lock`. On **`eip-ws-client-id-changed`**, POST rebind; if **`rebound`** is false but **`holderClientID`** equals **`getRealtimeClientID()`**, treat as holder; otherwise **`syncLockFromServer()`** reconciles (no pessimistic read-only-only patch). `wsClientIdentity.js` pairs old→new id via `sessionStorage` for rebind after transient disconnect.
  - **Header UI:** `useRegisterHeaderDocumentLockUI` / `DocumentLockHeaderControl` — primary scope is **job** before **group** on edit-job (`documentLockHeaderSelectors.primaryHeaderRegistration`). Group page (`groupFrame.jsx`) exposes **`groupReadOnly`** via `selectDocumentLockReadOnly` + `USER_JOB_GROUPS_COLLECTION`.
  - **Planner:** `useJobPlannerGroupLockSync` in `JobPlanner.jsx` — initial **`GET /api/v1/document-locks/status`** per visible group when `groupArray` changes; live updates from **`eip-document-lock`**. Compact/classic **group cards**: read-only chip (compact: column before View, mirroring job **info** slot); no left-edge warning stripe (bottom **Job Group** / gradient bar retained).
- **Code / infra touched:** `services/api/v1endpoints/documentlocks/**`, `services/api/helper/doclock/publish.go`, `services/websocket/server/nats_doc_lock.go`, `frontend/src/Hooks/useDocumentLock.js`, `frontend/src/Hooks/useJobPlannerGroupLockSync.js`, `frontend/src/Zustand/documentLockSlice.js`, `frontend/src/Functions/DocumentLock/**`, `frontend/src/Components/DocumentLock/**`, `frontend/src/Components/Edit Job/editJob.jsx`, `frontend/src/Components/Groups/groupFrame.jsx`, `frontend/src/Components/Job Planner/**/ClassicGroupJobCard.jsx`, `CompactGroupJobCard.jsx`, `frontend/src/Realtime/realtimeClient.js`, `docs/migrations/**` (this pass).
- **Links:** (none)

---

## 2026-04-19 — JetStream `EnsureStreams` prunes obsolete subject bindings

- **Request / context:** Existing **`doc-update-stream`** (and similar) could keep **old** subject patterns forever because **`EnsureStreams`** only **merged** new subjects and never removed dropped ones (e.g. `doc.subscribe.>`).
- **Decision:** Reconcile existing streams so **`Subjects`** match the configured slice **exactly** (order-independent); **`UpdateStream`** copies prior **`StreamConfig`** and replaces **`Subjects`**. On failure, log **`from` / `to`** subject lists and warn that **stale durables** may block removal—operators delete obsolete consumers and rely on the next ensure pass.
- **Code / infra touched:** [`services/shared/core/nats/jetstream.go`](../../../services/shared/core/nats/jetstream.go), [`jetstream_test.go`](../../../services/shared/core/nats/jetstream_test.go), [`IMPLEMENTATION.md`](./IMPLEMENTATION.md).
- **Links:** (none)

---

## 2026-04-19 — Remove JetStream `doc.subscribe` / API autosubscribe pipeline

- **Request / context:** Drop the autosubscribe path entirely—no API or core publishing subscription envelopes to JetStream, no websocket consumer for `doc.subscribe.*`. Subscribe to specific documents only via explicit WebSocket **`subscribe`** / **`unsubscribe`** when needed.
- **Decision:** Removed **`AutoSubscribe`** / **`subscribe`** query handling and NATS publishes from API document and job/group handlers; deleted **`services/api/helper/subscription.go`** and **`v1endpoints/subscription.go`**; core changestream no longer emits **`doc.subscribe`**; websocket no longer runs **`doc-live-subscribe-*`** JetStream consumer; shared NATS **`DocUpdateStreamSubjects`** excludes **`doc.subscribe.>`**; **`ws_autosubscribe_requests_total`** dropped from Grafana. Frontend group APIs no longer pass subscribe flags on GET/PUT. **`MessageTypeSubscription`** retained only for decoding legacy payloads if encountered.
- **Code / infra touched:** `services/api/**`, `services/core/changestream/watcher.go`, `services/shared/core/nats/{constants.go,messages.go,nats.go}`, `services/websocket/server/{server.go,nats_subscriptions.go,jetstream_consumer_id.go,metrics.go}`, `frontend/src/Functions/Endpoints/Pirivate/groups.js`, related group save/bootstrap helpers, `observability/grafana/**`, docs in this folder + [`docs/migrations/README.md`](../README.md).
- **Links:** (none)

---

## 2026-04-18 — Account-scoped realtime + JetStream delivery (documentation refresh)

- **Request / context:** Align migration docs with the redesigned websocket path: **account-wide** doc updates after JWT upgrade, **`sourceClientID`** echo suppression, optional explicit per–`docID` subscribe, JetStream consumers per replica (not core NATS fan-out).
- **Decision:** **Server:** [`dispatch.go`](../../../services/websocket/server/dispatch.go) **`deliverOutboundDocUpdate`**; JetStream **`doc.update.>`** → **`doc-live-updates-<suffix>`**, **`doc.subscribe.>`** → **`doc-live-subscribe-<suffix>`** (subscribe stream processed for observability only); **`connected`** includes **`subscription: { account: true }`**; session handoff snapshots **`explicitDocIDs`** only; **`resume_ack`** may **`skipBaselineSync`** whenever handoff matched. **SPA:** baseline subscribe empty in [`realtimeClient.js`](../../../frontend/src/Realtime/realtimeClient.js). **Docs:** rewrite [`IMPLEMENTATION.md`](./IMPLEMENTATION.md), [`README.md`](./README.md), contract quick-reference below; [`docs/migrations/README.md`](../README.md); [`PLAN-TODO-TRACKER.md`](./PLAN-TODO-TRACKER.md).
- **Code / infra touched:** Docs only this pass; implementation under `services/websocket/server/{dispatch,nats_subscriptions,subscription,session_resume,handler}.go`, `frontend/src/Realtime/realtimeClient.js`, related files cited in IMPLEMENTATION.
- **Links:** (none)

---

## 2026-04-18 — Documentation pass: job groups realtime + NATS core fan-out

- **Request / context:** Align migration docs with work since job groups were brought onto Mongo realtime (multi-tab sync, multi-replica websocket); capture NATS architecture change (core vs JetStream).
- **Decision:** **NATS:** Core changestream + `PublishSubscriptionMessage` dual-publish **JetStream** (unchanged stream contracts) **and** core **`ws.doc.fanout.*` / `ws.doc.subscribe.fanout.*`** so every websocket replica receives live events without relying on JetStream consumer fan-out for those paths; websocket uses `Conn.Subscribe` + shutdown `Unsubscribe`; **`doc.lock`** still JetStream pull on websocket. **SPA:** `applyRemoteMessage` handles **`user_job_groups`** via `handlers/userJobGroupsDocument.js`; monotonic guard uses **`remoteMs < prevCursor`** (ties allowed). **Docs:** update `IMPLEMENTATION.md`, `README.md`, `docs/migrations/README.md`, `PLAN-TODO-TRACKER.md`, this log, contract quick-reference.
- **Code / infra touched:** `docs/migrations/**`, `services/shared/core/nats/{constants,nats}.go`, `services/core/changestream/watcher.go`, `services/websocket/server/{nats_subscriptions,types,shutdown,jetstream_consumer_id}.go`, `services/api/helper/subscription.go` + v1 group/job handlers, `frontend/src/Realtime/**`, group/planner files cited in `IMPLEMENTATION.md`.
- **Links:** (none)

---

## 2026-04-18 — Session resume + Traefik sticky + Redis handoff (multi-replica VPS)

- **Request / context:** Document and preserve JWT rotation behavior: optional baseline skip when the same tab reconnects; horizontal websocket replicas behind Traefik; avoid relying on single-process memory only.
- **Decision:** **Client:** `stashRealtimeSessionResumeHint` before `disconnectRealtime` in `useAccountWebSocket`; after `open`, send `session_resume` with prior server `clientID`, await `resume_ack` (`skipBaselineSync`) with timeout ~400ms. **Server:** `session_resume.go` snapshots subscriptions on disconnect; **`popSessionHandoff`** uses Redis **`GETDEL`** on key `ws:session_handoff:v1:{accountID}:{oldClientID}` (JSON `account_id` + `docs`), then in-memory fallback; Session handoff TTL **synced with client reconnect caps**: `RECONNECT_MAX_MS (20s) + slack (5s) = 25s` — see `realtime_timing.go` + `realtimeClient.js` exports. **Infra:** `docker-compose` Traefik labels — sticky cookie **`eip_ws_affinity`**, `httpOnly`; default Traefik sticky **maxAge** unset (per Traefik docs, affinity cookie not given a finite lifetime unless configured). Load balancing: default RR for new clients, not least-connection-count.
- **Code / infra touched:** `frontend/src/Realtime/{realtimeClient.js,useAccountWebSocket.js}`, `services/websocket/server/session_resume.go`, `services/websocket/server/{reader.go,types.go,server.go}`, `docker-compose.yml`, `docs/migrations/websocket-realtime/{IMPLEMENTATION.md,README.md}`.
- **Links:** (none)

---

## Template (copy for each entry)

```text
### YYYY-MM-DD — Short title

- **Request / context:** …
- **Decision:** …
- **Code / infra touched:** …
- **Links:** commit / PR / issue …
```

---

## 2026-04-18 — Realtime handlers folder (per collection)

- **Request / context:** Expect more change-stream collections / message shapes; keep `applyRemoteMessage.js` manageable.
- **Decision:** Move account reconcile helpers to `frontend/src/Realtime/handlers/accountReconcile.js`; `users` → `handlers/usersDocument.js`; `application_settings` → `handlers/applicationSettingsDocument.js`; barrel `handlers/index.js`. `applyRemoteMessage.js` only parses the message, applies cursor/`lastModified` guards, and dispatches.
- **Code / infra touched:** `frontend/src/Realtime/{applyRemoteMessage.js,handlers/**}`; `docs/migrations/websocket-realtime/IMPLEMENTATION.md`.
- **Links:** (none)

---

## 2026-04-18 — SPA realtime apply: unified reconcile (tokens, characters, system indexes)

- **Request / context:** Remote `users` / `application_settings` updates should mirror login + Accounts-page behavior (cloud vs local refresh tokens, add/remove additional characters, system indexes) without a fragile “apply then separate side-effects” split; refresh tokens on existing `Character` instances must update when the server pushes a new `rToken` for the same hash.
- **Decision:** Consolidate into [`frontend/src/Realtime/applyRemoteMessage.js`](../../../frontend/src/Realtime/applyRemoteMessage.js): snapshot → Zustand merge → async serialized reconcile. Cloud on: optional `refreshTokens` array in the message compared to pre-apply linked tokens before `setLinkedCharacterRefreshTokens`; character list reconciled against the **effective** store token map; `esiRefreshToken` patched on existing characters when different; cloud off: `updateLocalRefreshTokens` + clear linked. `application_settings`: snapshot `userCloudAccounts` before merge; on toggle run the same branches; debounced system-index fetch from merged structures. Removed standalone `processRemoteDocumentSideEffects.js` / `registerRealtimeSideEffects.js`.
- **Code / infra touched:** `frontend/src/Realtime/applyRemoteMessage.js` (only); deleted `frontend/src/Realtime/processRemoteDocumentSideEffects.js`, `frontend/src/Realtime/registerRealtimeSideEffects.js`; `docs/migrations/websocket-realtime/{IMPLEMENTATION.md,README.md,PLAN-TODO-TRACKER.md,INTERACTIONS.md}`.
- **Links:** (none)

---

## 2026-04-18 — Add dedicated WebSocket metrics dashboard (Grafana)

- **Request / context:** Logs dashboard existed (`WebSocket · logs`), but there was no dedicated websocket metrics dashboard.
- **Decision:** Added a provisioned Prometheus dashboard (`WebSocket · metrics`) for websocket metrics: connected clients/accounts, upgrade success/error rates, upgrade errors by reason, upgrade latency quantiles, connections open/close rates, autosubscribe/doc-update fanout rates, and per-account connected client counts.
- **Code / infra touched:** `observability/grafana/provisioning/dashboards/definitions/websocket-otel-metrics.json`; docs (`IMPLEMENTATION.md`, this log).
- **Links:** (none)

---

## 2026-04-18 — WebSocket upgrades: remove otelhttp; delegate Hijack in request logging

- **Request / context:** After wiring `otelhttp` on `/ws`, connections failed with `websocket: response does not implement http.Hijacker` and `superfluous response.WriteHeader` from otelhttp’s response wrapper.
- **Decision:** Drop `otelhttp` from the websocket service’s `/ws` handler chain. Extend `services/api/middleware/requestlogging.go` `responseWriter` with `Hijack` and `Flush` delegating to the embedded `ResponseWriter` when supported, so logging wrappers remain compatible with WebSocket upgrades (and any other hijacking handlers).
- **Code / infra touched:** `services/websocket/main.go`, `services/api/middleware/requestlogging.go`; `IMPLEMENTATION.md` (this folder).
- **Links:** (none)

---

## 2026-04-23 — Websocket OTel metrics for dashboarding

- **Request / context:** Add OpenTelemetry metrics to websocket service (similar to API metrics) for dashboards: request/error counters, account/client/document visibility, autosubscribe and update sends.
- **Decision:** Added websocket meter/instruments in `services/websocket/server/metrics.go` and initialized telemetry in `services/websocket/main.go` with `telemetry.Init(DefaultConfig("websocket"))`. Instrumented upgrade request/success/error/latency (incl. expired-token rejects), connection open/close by account, autosubscribe requests, and document updates sent. Added observable gauges for connected accounts/clients and per-account/per-client/per-document live state snapshots for dashboard panels.
- **Code / infra touched:** `services/websocket/main.go`, `services/websocket/server/{metrics.go,server.go,types.go,handler.go,reader.go,nats_subscriptions.go,processor.go}`; docs in this folder.
- **Links:** (none)

---

## 2026-04-22 — Realtime expired-token block log level

- **Request / context:** Keep a visible log when reconnect/sync is blocked by expired token, but use warning severity.
- **Decision:** In `frontend/src/Realtime/realtimeClient.js`, expired-token reconnect blocks now emit `console.warn` (initial connect path and close/reconnect path) with `reason: "token_expired"` and `accountId`.
- **Code / infra touched:** `frontend/src/Realtime/realtimeClient.js`; this folder docs.
- **Links:** (none)

---

## 2026-04-22 — Websocket: quieter logs + request tracing aligned with API

- **Request / context:** Reduce **Info** noise on the websocket service; align with structured logging (per-request trace / id).
- **Decision:** Wire `/ws` through **`RequestStartTimeConstructor`** → **`otelhttp`** (`websocket`) → **`RequestLoggingConstructor`** (same middleware as API). Extend **`RequestLoggingConstructor`** so every request gets **`request_id`** (`X-Request-ID` or new UUID) on the scoped logger (API benefits too). Demote routine **Info** lines across **`server/*`**, **`sync/*`**, NATS subscription handlers, queue creation, cleanup, and most shutdown completion lines to **Debug**; keep **Info** for listen start, shutdown start, and successful **`websocket client connected`** after upgrade.
- **Code / infra touched:** `services/websocket/main.go`, `services/websocket/server/{handler,reader,writer,processor,nats_subscriptions,subscription,queue,cleanup,shutdown,bulk_processor}.go`, `services/websocket/sync/{sync_processor,sync_message,sync_queue}.go`, `services/api/middleware/requestlogging.go`; this folder’s docs.
- **Links:** (none)

---

## 2026-04-21 — Centralize app JWT decode / expiry

- **Request / context:** Realtime and Zustand both decoded or inspected the app JWT; avoid duplicated `jose` / expiry logic.
- **Decision:** Add `frontend/src/Functions/Auth/appJwt.js` — `decodeAppJwt`, `getAppJwtExpiryUnix`, `isAppJwtExpired`, `getEffectiveAppAccessExpiryUnix`. **`realtimeClient`** uses `isAppJwtExpired`; **`getDeserialisedSerializedServerToken`** uses `decodeAppJwt`; **`useAccountWebSocket`** pre-expiry timer and **`refreshServerToken`** use `getEffectiveAppAccessExpiryUnix` (store `expires_at` when valid, else JWT `exp`). EVE SSO / ESI tokens stay in existing Character / ESI code paths.
- **Code / infra touched:** `frontend/src/Functions/Auth/appJwt.js` (new), `frontend/src/Realtime/realtimeClient.js`, `frontend/src/Realtime/useAccountWebSocket.js`, `frontend/src/Zustand/account/tokenActions.js`; this folder’s docs.
- **Links:** (none)

---

## 2026-04-20 — Client: stop `/ws` retries on expired JWT + HTTP baseline resync on reopen

- **Request / context:** Prevent expired tokens from driving reconnect requests; allow a clean reopen once a new token exists; **resync** client state with the server after that.
- **Decision:** `realtimeClient` decodes JWT `exp` (via `jose`) with 60s skew—**no** `WebSocket` open and **no** exponential reconnect when expired; `close` / `scheduleReconnect` paths also refuse stale tokens. When the socket **opens** after recovery from that halt or after an **`accessToken` string change** (rotation), call **`resyncRealtimeDocumentsFromServer`**: parallel GET `/api/v1/user/main` and GET `/api/v1/user/application-settings` (`getApplicationSettingsDocument` added next to `getUserAccountDocument`), merge via existing account + `mergeApplicationSettingsFromServer`, refresh cloud `refreshTokens` + `realtimeSync` cursors from `_meta.lastModified`. First successful connect in a session does **not** run the extra GETs (only rotation / post-expiry reopen).
- **Code / infra touched:** `frontend/src/Realtime/realtimeClient.js`, `frontend/src/Realtime/resyncRealtimeDocumentsFromServer.js` (new), `frontend/src/Functions/Endpoints/Pirivate/userDocument.js`; docs in this folder.
- **Links:** (none)

---

## 2026-04-19 — Documentation must track every code change (standing rule)

- **Request / context:** *“Whenever we modify anything make sure it’s reflected in this documentation, include that request in the documentation.”*
- **Decision:** Treat as a **project rule** for this migration folder: any change to realtime-related code, contracts, security, or ops must update **`IMPLEMENTATION.md`** (facts), **`INTERACTIONS.md`** (dated note for decisions / sessions), and **`PLAN-TODO-TRACKER.md`** when checklist items move—same PR when practical or an immediate follow-up commit. The rule and this request are duplicated in [README.md](./README.md#documentation-maintenance-required) and [IMPLEMENTATION.md](./IMPLEMENTATION.md#keeping-this-document-accurate-project-rule).
- **Code / infra touched:** Docs only (`README.md`, `IMPLEMENTATION.md`, `INTERACTIONS.md`, `docs/migrations/README.md`).
- **Links:** (none)

---

## 2026-04-18 — Implementation + subscribe ACL + docs

- **Request / context:** Land WebSocket realtime migration in repo; tighten subscribe authorization to owned documents only; document JWT lifecycle at the socket; keep migration docs current.
- **Decision:**
  - **Internal JWT:** `services/shared/core/internaljwt`; API and websocket share it; removed `services/websocket/auth`.
  - **JetStream:** Durable consumer names include per-replica suffix (`WS_CONSUMER_NAME` → `DOCKER_CONTAINER_NAME` / `CONTAINER_NAME` → `HOSTNAME` → `os.Hostname()`), sanitized.
  - **Workers:** Incoming/outgoing use coordinator-spawned goroutines (no `pond` pools for those paths); sync keeps `pond`.
  - **Autosubscribe:** NATS `doc.subscribe` handler calls `SubscribeClientToDocument` (all account tabs).
  - **Subscribe ACL:** `(*Server).docSubscribeAuthorized` — `users` / `application_settings` require doc id == JWT `account_id`; `jobs`, `archivedJobs`, `groups`, `build_stats` require Mongo `DocumentExistsByID` (`_id` + `_meta.accountID`); all other collections denied. Enforced in `reader.go` and `processor.go`.
  - **JWT / WS:** Validate token on every HTTP Upgrade only; client reconnects when `accessToken` changes and on a timer ~90s before `accessTokenEXP`; `disconnectRealtime` on signout.
  - **Frontend:** `frontend/src/Realtime/realtimeClient.js`, `useAccountWebSocket.js`, `applyRemoteMessage.js`; `frontend/src/Zustand/realtimeSyncSlice.js`; `applyUserDocumentFromRemote` + login cursor seeding in `tokenActions.js`; `App.jsx`, `signout.jsx`.
  - **Docs:** Added [`IMPLEMENTATION.md`](./IMPLEMENTATION.md); expanded [`README.md`](./README.md); updated [`docs/migrations/README.md`](../README.md) status; unit tests `services/websocket/server/subscribe_auth_test.go`.
- **Code / infra touched:** `services/shared/core/internaljwt/**`, `services/api/**` (JWT imports), `services/websocket/server/**`, `frontend/src/Realtime/**`, `frontend/src/Zustand/**`, `frontend/src/App.jsx`, `frontend/src/routes/signout.jsx`, `docs/migrations/**`.
- **Links:** (commits / PRs — fill when merged)

---

## 2026-04-18 — Plan snapshot + sync script

- **Request / context:** Keep a full-text copy of the migration plan in the repo and refresh it whenever the plan changes.
- **Decision:** Add [`PLAN-SNAPSHOT.md`](./PLAN-SNAPSHOT.md) with a short banner; add [`scripts/sync-websocket-migration-plan.sh`](../../../scripts/sync-websocket-migration-plan.sh) to copy a local plan file over the snapshot when needed.
- **Code / infra touched:** `docs/migrations/websocket-realtime/PLAN-SNAPSHOT.md`, `scripts/sync-websocket-migration-plan.sh`, `docs/migrations/websocket-realtime/README.md`.
- **Links:** (none)

---

## 2026-04-18 — Migration documentation folder created

- **Request / context:** Add a repo-local migration folder to track the WebSocket realtime plan, store interactions/requests, and keep a full picture in sync with implementation.
- **Decision:** Use `docs/migrations/websocket-realtime/` with `README.md` (overview + maintenance rules), `INTERACTIONS.md` (this log), and `PLAN-TODO-TRACKER.md` (todo checklist).
- **Code / infra touched:** Docs only (`docs/migrations/*`).
- **Links:** (none)

---

## Outstanding requests (queue)

_Move items into dated sections above when work starts or completes._

- (none yet)

---

## Contract quick-reference

### HTTP (SPA → API)

| Method | Path | Notes |
|--------|------|-------|
| Various | `/api/v1/...` | Private routes use Bearer internal JWT from Zustand; refresh via existing `refreshServerToken` / login flows. |
| POST/GET | `/api/v1/document-locks/*` | Document lock acquire, extend, release, **status**, request, handoff, waitlist; lock ownership identity is JWT **`session_id`** (no rebind endpoint, no `X-WS-Client-ID` requirement for ownership). Full table: [IMPLEMENTATION.md § Document locks](./IMPLEMENTATION.md#document-locks). |

### WebSocket (browser → `services/websocket`)

| Direction | Payload / subject | Notes |
|-----------|-------------------|-------|
| Upgrade | Subprotocol `auth.<base64url(raw JWT)>` or query `token` | JWT validated once per connection (`internaljwt.ValidateInternalJWT`). |
| → Server | `"ping"` | App-level heartbeat; server replies `"pong"`. |
| → Server | `{"type":"subscribe","docIDs":["collection.<mongoId>", ...]}` | **Optional** explicit docs (escape hatch / payloads without `accountID`); each `docID` must pass `docSubscribeAuthorized`. Account-scoped updates do **not** require subscribe. |
| → Server | `{"type":"unsubscribe","docIDs":[...]}` | Same authorization as subscribe. |
| → Server | `{"type":"session_resume","previousClientID":"..."}` | JWT rotation: restore explicit subs + **`resume_ack`**; see [IMPLEMENTATION](./IMPLEMENTATION.md) **Session resume**. |
| → Server | `{"type":"sync", ...}` | Existing sync path. |
| ← Server | `{"type":"connected","clientID":"...","subscription":{"account":true}}` | Sent after upgrade; JWT already implies account-scoped doc delivery. |
| ← Server | `{"type":"subscribe_ack","docIDs":["..."]}` | After explicit **`subscribe`** batch (optional). |
| ← Server | `{"type":"resume_ack","skipBaselineSync":bool,"restoredDocIDs"?:[...]}` | After **`session_resume`** when handoff applied. |
| ← Server | `{"type":"document_lock",...}` | Lock events for the account; SPA dispatches **`eip-document-lock`**. |
| ← Server | JSON `ChangeStreamMessage` | Same shape as core publishes to JetStream (`collection`, `docID`, `operationType`, `document`, `accountID`, …). |

### Browser (SPA)

| Event | Raised from | Typical consumers |
|-------|-------------|---------------------|
| **`eip-document-lock`** | [`realtimeClient.js`](../../../frontend/src/Realtime/realtimeClient.js) | `useDocumentLock`, `useJobPlannerGroupLockSync`, snackbars |
| **`eip-ws-client-id-changed`** | [`wsClientIdentity.js`](../../../frontend/src/Realtime/wsClientIdentity.js) `setRealtimeClientID` | Used for websocket client identity lifecycle/observability; document locks no longer depend on this event. |

### NATS (internal)

| Subject pattern | Producer | Consumer | Notes |
|-----------------|----------|----------|-------|
| `doc.update.>` | `core` change stream (`PublishMessage`) | **`services/websocket`** JetStream durable **`doc-live-updates-<suffix>`** | Payload: `ChangeStreamMessage` JSON (`accountID`, `sourceSessionID`, `sourceClientID`, …). **Every replica** uses a **distinct** durable → **`deliverOutboundDocUpdate`** with self-echo suppression by session first, then client fallback. |
| *(legacy / removed)* `doc.subscribe.*` | *(none — path removed 2026-04-19)* | *(none)* | Historical design used JetStream + API publishes; **no longer produced or consumed**. Shared code may still define subject constants / decode legacy envelopes for compatibility. |
| *(legacy)* `ws.doc.fanout.*` / `ws.doc.subscribe.fanout.*` | *(not used in current watcher)* | *(websocket does not subscribe)* | Constants retained in [`constants.go`](../../../services/shared/core/nats/constants.go) for compatibility. |
| `doc.lock.{accountID}` | API (`PublishMessage`) | **`services/websocket`** JetStream consumer **`doc-lock-<suffix>`** | Lock fan-out to account connections. |

---

## Decisions log (non-dated bullets OK)

- **Plan snapshot:** [`PLAN-SNAPSHOT.md`](./PLAN-SNAPSHOT.md) is the in-repo draft. Run `./scripts/sync-websocket-migration-plan.sh <path-to-plan.md>` when replacing it from an external file so git stays aligned.
- **Implementation doc:** [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) is the source of truth for shipped code paths, subscribe authorization rules, JWT/WebSocket lifecycle, and operations env vars.
- **Docs track code:** Any edit to migration-related code or contracts must update `IMPLEMENTATION.md` / `INTERACTIONS.md` (and tracker or plan snapshot as applicable)—see [README.md](./README.md#documentation-maintenance-required) and the dated entries above (including **2026-04-18** account-scoped / JetStream refresh).
