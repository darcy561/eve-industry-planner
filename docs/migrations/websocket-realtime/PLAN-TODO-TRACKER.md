# Plan todo tracker (sync with implementation)

Copy status from your tracker of choice; update this file when a todo **starts** or **finishes**.

| ID | Description | Status |
|----|-------------|--------|
| `shared-internal-jwt` | API-first: extract internal RS256 JWT to `services/shared`, wire `api` + `websocket`, drop duplicate `websocket/auth`. | done |
| `nats-per-replica-consumers` | Websocket live delivery: **JetStream** **`doc.update.>`** with **per-replica durable** (`doc-live-updates-*`); **`doc-lock-*`** unchanged. **`doc.subscribe.>`** consumer removed (2026-04-19). Legacy core **`ws.doc.fanout`** / **`ws.doc.subscribe.fanout`** constants are not consumed by websocket. | done |
| `ws-write-pipeline-refactor` | Replace pond/coordinator with per-`docID` ordering (mutex or channel+goroutine). | done |
| `subscription-dual-path-and-registry` | **Account-scoped** registry: JWT → `userConnections`; optional explicit WebSocket **`subscribe`** / **`explicitDocSubscribers`**. JetStream **`doc.subscribe`** path removed (2026-04-19). | done |
| `frontend-realtime-singleton` | `RealtimeClient` + gated connect/logout; same-origin `/ws`. | done |
| `zustand-remote-apply` | `applyRemoteMessage` + `realtimeSync` / `lastModified` guards; **`users`**, **`application_settings`**, **`user_job_groups`**, **`user_job_documents`** (handlers + [`inboundJobDocumentsCoalesce.js`](../../../frontend/src/Functions/Debounce/inboundJobDocumentsCoalesce.js)); strict `<` cursor compare for ties. | done |
| `integration-verify` | Two tabs + optional two-replica WS test. | done |
| `redis-document-locks-spa` | Redis/API document locks; WS `document_lock` → `eip-document-lock`; `useDocumentLock` + header UI; planner group lock sync (`useJobPlannerGroupLockSync`); lock ownership tied to JWT `session_id` across token refresh and reconnect paths (no rebind flow). | done |
| `user-job-documents-realtime` | Mongo **`user_job_documents`** + filtered REST (`/api/v1/job-documents/...`), WS `applyRemoteMessage` + debounced inbound merge, debounced **`PUT`** like groups, login **`bootstrapJobDocumentsLoginStep`**, retire Firebase job listeners / Firestore job writes in favor of API; **`userJobSnapshot`** / **`uploadJobSnapshots`** removed (2026-04-21). | done |
| `org-scoped-realtime-routing` | `corpToClients` / `allianceToClients`, **`upgrade_scopes`** + **`scopes_ack`**, JWT ceilings + **`alliances`** claim, **`scopes`** on `ChangeStreamMessage`, dispatch + `DecodeOutboundMessage`, session handoff org fields. Contract: [ROUTING-AND-SCOPES.md](./ROUTING-AND-SCOPES.md). | done |

**Follow-up (not original plan todos):** subscribe ACL fail-closed + Mongo ownership for `jobs`/`user_job_documents`/`archivedJobs`/`groups`/`build_stats`; client reconnect before JWT expiry; documented in [IMPLEMENTATION.md](./IMPLEMENTATION.md).

**Legend:** `pending` | `in_progress` | `done`
