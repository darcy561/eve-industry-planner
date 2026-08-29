# Migration: WebSocket realtime (users + application_settings + job groups)

**Historical project folder.** Current JetStream publish/filter behaviour (tenant-keyed `doc.update`, selective `FilterSubjects`, inert empty hosts) is live SoT: [backend/websocket/websocket.md](../../backend/websocket/websocket.md) § JetStream doc fan-out and [backend/core/core.md](../../backend/core/core.md). Swarm follow-on: [swarm-stack/overlays/20-selective-fanout.md](../swarm-stack/overlays/20-selective-fanout.md). Tables below may still describe the pre-selective firehose path.

This folder is the **workspace home** for everything tied to the WebSocket / Mongo change-stream / NATS realtime work. Keep it **updated as you implement** so anyone can see the full picture without replaying ad-hoc design discussions.

**Implementation reference (code paths, subscribe ACL, JWT lifecycle, ops):** [implementation.md](./implementation.md).

## Plan snapshot in the repo

| Location | Role |
|----------|------|
| **[`plan-snapshot.md`](./plan-snapshot.md)** | **Working snapshot** of the migration plan—edit in place in git, or overwrite from another file when needed. |

**Optional:** replace the snapshot from a plan file you maintain locally:

```bash
./scripts/sync-websocket-migration-plan.sh /path/to/plan.md
```

This README is the pointer; [interactions.md](./interactions.md) is the living log.

## Documentation maintenance (required)

**Whenever you change anything** that touches this migration (websocket server, NATS subjects/consumers, internal JWT, subscribe ACL, core change-stream publishing, SPA `Realtime/*`, `realtimeSync`, auth/signout wiring, docker/env for WS, or contracts in the quick-reference), **update these docs in the same PR** when practical, or in a **follow-up commit immediately after**—do not leave the repo and the migration folder out of sync.

| What changed | Where to reflect it |
|----------------|---------------------|
| Org routing, `scopes`, `upgrade_scopes`, JWT org claims | [routing-and-scopes.md](./routing-and-scopes.md) + [implementation.md](./implementation.md) |
| Behaviour, paths, env vars, security rules | [implementation.md](./implementation.md) |
| Document lock HTTP routes and session-based identity semantics (`session_id`, `eip-document-lock`) | [implementation.md](./implementation.md) § Document locks; [interactions.md](./interactions.md) dated entry |
| NATS subject prefixes (`doc.update`, `doc.lock`; legacy **`doc.subscribe`** / **`ws.doc.fanout`** / **`ws.doc.subscribe.fanout`** constants for decode/compat only) | [implementation.md](./implementation.md), contract table in [interactions.md](./interactions.md) |
| **Docker / Traefik / Redis handoff / sticky `/ws`** | [implementation.md](./implementation.md) (**Deployment** + **Session resume**) |
| Decisions, API/WS/NATS contract tweaks, session context | [interactions.md](./interactions.md) (append a dated entry at the top) |
| Todo / checklist state | [plan-todo-tracker.md](./plan-todo-tracker.md) |
| Plan snapshot only | [plan-snapshot.md](./plan-snapshot.md) via `./scripts/sync-websocket-migration-plan.sh <path>` |

This requirement is recorded in [interactions.md](./interactions.md) (dated entry) so future contributors inherit the same rule.

## Files in this folder

| File | Purpose |
|------|---------|
| [implementation.md](./implementation.md) | **Code reference:** shipped paths, subscribe ACL, JWT lifecycle, **session resume**, **Docker/Traefik/Redis deployment**, env vars, verification. |
| [plan-snapshot.md](./plan-snapshot.md) | Full plan text; optionally refresh via [`scripts/sync-websocket-migration-plan.sh`](../../../scripts/sync-websocket-migration-plan.sh). |
| [interactions.md](./interactions.md) | **Append-only log**: requests, decisions, PRs, endpoints, WS message shapes, dates. Update with every meaningful change. |
| [plan-todo-tracker.md](./plan-todo-tracker.md) | Checklist aligned to plan todos (sync status here + in your issue tracker if you use one). |
| [scoped-realtime-routing-plan.md](./scoped-realtime-routing-plan.md) | Design history and phased plan; **implementation contract** for shipped routing lives in [routing-and-scopes.md](./routing-and-scopes.md). |
| [routing-and-scopes.md](./routing-and-scopes.md) | **Canonical:** `doc.update` routing precedence, `scopes`, JWT ceilings, **`upgrade_scopes` / `scopes_ack`**, changestream fields, session handoff org fields. |

## How to keep in sync (checklist)

1. **Same change as code:** apply the table in **Documentation maintenance (required)** above.
2. **Before / after a work session:** append a short entry to `interactions.md` (date, what changed, links to commits or PRs).
3. **When scope shifts:** note the decision and any plan delta (even if `plan-snapshot.md` is not edited yet).
4. **New HTTP routes, NATS subjects, or WS JSON types:** update the quick-reference in `interactions.md` and any tables in `implementation.md`.
5. **After replacing the plan from an external file:** run `./scripts/sync-websocket-migration-plan.sh <path>` so [`plan-snapshot.md`](./plan-snapshot.md) matches, then commit if the diff is meaningful.

## High-level scope (from plan)

- **Core:** Mongo change stream → **JetStream** `doc.update.{collection}.{docID}` with `ChangeStreamMessage` JSON (`accountID`, `sourceClientID`, …).
- **Websocket:** JWT upgrade registers the connection for **account-scoped** delivery and stores **JWT org ceilings**; each replica consumes **`doc.update.>`** via **per-replica JetStream durable** → **`deliverOutboundDocUpdate`** (account path, then **corp/alliance pools** + optional **`scopes`**, then explicit-doc fallback). Browser **`upgrade_scopes`** joins org pools (see [routing-and-scopes.md](./routing-and-scopes.md)). Document locks unchanged (**JetStream** `doc.lock.>`). Optional explicit browser **`subscribe`** / **`subscribe_ack`** when the UI needs docs that are not account-scoped in the payload.
- **API:** Shared internal JWT with websocket; **no** NATS subscription-envelope publish—per-document interest is **WebSocket-only** where needed.
- **Frontend:** Module singleton `RealtimeClient` (**no baseline subscribe** after connect), `useAccountWebSocket`, **`applyRemoteMessage`** for **`accounts`**, **`account_settings`**, **`account_job_groups`**, and **`account_job_documents`** (monotonic `realtimeSync` + `_meta.lastModified` guards; tie-break uses **strict `<` on cursor** so equal timestamps are not dropped), plus handlers under `Realtime/handlers/` and [`inboundJobDocumentsCoalesce.js`](../../../frontend/src/Functions/Debounce/inboundJobDocumentsCoalesce.js).

## Implemented in repo (summary)

| Area | Notes |
|------|--------|
| **Internal JWT** | [`services/shared/core/internaljwt`](../../../services/shared/core/internaljwt); API + websocket import it; duplicate `websocket/auth` removed. |
| **JetStream live path** | Websocket consumes **`doc.update.>`** (`doc-live-updates-<suffix>`) so **every** replica receives every update; outbound routing in **`dispatch.go`**. **`doc.lock`** uses **`doc-lock-<suffix>`**. Legacy **`doc.subscribe`** subject constants exist in shared NATS code for compatibility only; **nothing publishes or consumes them.** Per-replica suffix aligns OTel **`ws_instance_id`**. |
| **WS worker model** | Inbound client→Mongo still uses coordinator + per-`docID` mutex; outbound NATS→browser is direct send from dispatch. Sync still uses `pond`. |
| **Explicit doc subscribe** | Browser **`subscribe`** / **`unsubscribe`** updates **`explicitDocIDs`** when a screen needs IDs not covered by account-scoped delivery. |
| **Subscribe ACL** | Fail closed; `accounts`/`account_settings` by JWT; `account_jobs`/`account_job_documents`/`account_archived_jobs`/`groups`/`account_production_totals` via Mongo `_meta.accountID`. See [implementation.md](./implementation.md). |
| **JWT lifecycle (client)** | Reconnect when `accessToken` changes; **`stashRealtimeSessionResumeHint`** + **`session_resume` / `resume_ack`** may skip baseline GETs on rotation; timer ~90s before `accessTokenEXP`; **no reconnect** while JWT is expired; signout disconnects without stashing. |
| **Deployment (VPS)** | Compose **`websocket.replicas: 2`**; Traefik **sticky cookie `eip_ws_affinity`** on `/ws`; **Redis** keys `ws:session_handoff:v1:…` for cross-replica handoff. See [implementation.md](./implementation.md). |
| **Observability** | Websocket OpenTelemetry metrics for upgrade requests/errors, active accounts/clients/docs, and document updates sent (see [implementation.md](./implementation.md)). |
| **Frontend realtime** | [`frontend/src/Realtime/`](../../../frontend/src/Realtime/) + `realtimeSync` slice + `App.jsx` / `signout.jsx` wiring. |
| **Document locks** | Redis-backed locks + API [`v1endpoints/documentlocks`](../../../services/api/v1endpoints/documentlocks/); ownership from JWT **`session_id`** (no client-id rebind flow); websocket **`document_lock`** → **`eip-document-lock`**; Zustand [`documentLockSlice`](../../../frontend/src/Zustand/documentLockSlice.js); [`useDocumentLock`](../../../frontend/src/Hooks/useDocumentLock.js); planner [`useJobPlannerGroupLockSync`](../../../frontend/src/Hooks/useJobPlannerGroupLockSync.js). See [implementation.md § Document locks](./implementation.md#document-locks). |

Details, tables, and verification steps: **[implementation.md](./implementation.md)**.
