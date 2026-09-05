# Plan: Scoped alliance / corporation realtime routing

**Status (2026-04-22):** Core server paths, JWT ceiling fields, changestream metadata, **`upgrade_scopes`**, reverse indexes, session handoff extensions, and documentation are **implemented**. Treat **[routing-and-scopes.md](./routing-and-scopes.md)** as the **canonical wire + behaviour contract**; this file remains the phased design and backlog (optional lazy per-org workers, further publisher coverage, SPA wiring).

This document describes how to evolve the **current** websocket + NATS setup toward **alliance- and corporation-rooted** delivery with a **`scopes`** metadata field for **downward** fan-out (specific corporations within an alliance, specific accounts within a corporation), **progressive** client pools (account-first connect, upgrade when the UI needs org data), and optional **lazy per-org** workers. It is a **git-tracked implementation plan**; keep it updated as work lands.

**Related docs:** [routing-and-scopes.md](./routing-and-scopes.md) (**contract**), [implementation.md](./implementation.md) (full service map), [interactions.md](./interactions.md) (decision log), [plan-todo-tracker.md](./plan-todo-tracker.md) (checklist).

---

## Goals

- Route each `doc.update` payload from JetStream to the correct **local** websocket clients on **each replica** (no cross-replica client map; sticky `/ws` remains client-only).
- **Collection (or equivalent)** determines the **root** of routing: **alliance-rooted** vs **corporation-rooted** vs existing **account-rooted** behaviour.
- **`scopes` in message metadata** narrows recipients **downward** from that root:
  - **Alliance-rooted:** optional lists of **corporation IDs** and/or **account IDs** under that alliance (sideways only *inside* the alliance).
  - **Corporation-rooted:** optional **account IDs** under that corporation.
  - **Missing or empty `scopes`:** full fan-out under that root (every pooled client for that alliance or corporation on this process).
- **No sideways routing between alliances.** Payload must never widen delivery outside the document’s alliance/corporation root.
- **Progressive pools:** initial connect is **account-level** only; clients join **corporation / alliance** index pools only after an **authorized** scope upgrade (or equivalent), so idle users do not pay for org-wide traffic.
- **Throughput:** replace **O(all clients)** corp/alliance scans with **inverse indexes**; decode JSON **once** per outbound message where practical.

---

## Non-goals (for this plan)

- Choosing or configuring the load balancer (beyond noting **sticky websocket** already used in deployment docs).
- Changing JetStream stream topology unless required for new subjects (prefer reusing `doc.update.*` with richer JSON).

---

## Product semantics (routing rules)

### Alliance-rooted documents

1. **Root:** one alliance identifier carried in the outbound JSON (field names should match what publishers and `DecodeRouteInfo` already use, e.g. `allianceId` / `allianceID`).
2. **Candidates:** every **connected** client on this replica that is registered in the **`allianceId → {clientIDs}`** pool for that alliance.
3. **Filter with `scopes`:**
   - If `scopes.corporationIDs` is non-empty: deliver only to clients whose **allowed** corporation memberships intersect that list **and** who are still in the alliance candidate set (EVE: character in a corp that is in that alliance).
   - If `scopes.accountIDs` is non-empty: deliver only to clients whose **`AccountID`** is in that list, intersected with the alliance candidate set.
   - If **both** lists are present: pick and document one rule for v1 — **recommended:** treat filters as **union** (recipient matches if they match corporation scope **or** account scope), unless a product case requires **intersection** (stricter “corp slice AND account subset”). Document the choice in [interactions.md](./interactions.md) when implemented.

### Corporation-rooted documents

1. **Root:** one corporation identifier in the payload.
2. **Candidates:** clients in the **`corporationId → {clientIDs}`** pool.
3. **Filter:** if `scopes.accountIDs` is non-empty, only those accounts (typically all tabs for that account).

### Account-rooted documents (today)

Keep existing behaviour: `accountID` in payload → `userConnections` fan-out with source suppression and sync rules (`dispatch.go`).

---

## Current baseline in repo (as of plan authoring)

| Area | Location / behaviour |
|------|---------------------|
| Account fan-out | `userConnections` + `broadcastToAccountClients` in `services/websocket/server/dispatch.go` |
| Corp / alliance fan-out | `broadcastToCorporationScope` / `broadcastToAllianceScope` iterate **all** `s.Clients` and check `client.Scopes` from `services/websocket/server/model/scopes.go` |
| Route parsing | `services/websocket/server/outgoinglogic/outgoing.go` — `RouteInfo` / `DecodeRouteInfo` (account, corporation, alliance, source ids); **no message-level `scopes`** yet |
| Connect | `services/websocket/server/handler.go`: JWT via `internaljwt.ValidateInternalJWT`; claims include **`Corporations []int64`**; **`client.Scopes` initialised empty** |
| Inbound WS JSON | `services/websocket/server/reader.go`: `session_resume`, `sync`, `subscribe`, `unsubscribe` — **no scope-upgrade message** |
| NATS → local | `services/websocket/server/nats_subscriptions.go` → `deliverOutboundDocUpdate` |
| Writers | Per-client `Send` channel + `writer` goroutine (`handler.go`, `writer.go`) |

---

## Phase 1 — Message contract and single decode

**Objective:** One agreed JSON shape for publishers and one parse path on the websocket.

1. **Specify wire format** for JetStream `doc.update` bodies (same JSON the browser receives). Include:
   - Root ids for alliance / corporation paths (align with existing `allianceId` / `corporationId` keys used in `DecodeRouteInfo`).
   - **`scopes`** object: `corporationIDs`, `accountIDs` (string arrays; normalise EVE id types at parse boundary).
2. **Extend `outgoinglogic`** (`outgoing.go`): add decoded `scopes` (and optionally a wrapper type such as `DecodedOutbound`) with **one** `json.Unmarshal` (or decode once into a struct) used by dispatch.
3. **Refactor `dispatch.go`:** remove duplicate `DecodeRouteInfo` in the account broadcast path; pass the decoded struct through.

**Publishers:** Update every code path that publishes `doc.update.*` (shared NATS helpers and change-stream consumers) to attach `scopes` when the change is not org-wide.

---

## Phase 2 — JWT claims and `Client.Scopes` ceiling

**Objective:** Server only adds clients to org pools for orgs the user is allowed to access.

1. **`internaljwt.InternalClaims`** (`services/shared/core/internaljwt/jwt.go`): add **alliance IDs** (parallel to `Corporations`) wherever the API mints tokens; keep **`Corporations`** as the **ceiling** for corporation access.
2. **Normalise IDs** when populating `model.RealtimeScopes` on `Client` (handler or small helper): JWT may use `int64`; indexes/maps should use a **single canonical string** (or int64 consistently) to avoid mismatch with JSON payloads.
3. **Progressive connect:** on first connect, continue registering **`userConnections`** only; **leave corp/alliance `Scopes` empty** until upgrade so corp/alliance NATS traffic does not target those connections.

---

## Phase 3 — Inverse indexes (replace full `Clients` scan)

**Objective:** Recipient lookup is **O(pooled clients for that org)** on this replica, not **O(all websocket clients)**.

1. **`Server`** (`services/websocket/server/types.go`, `server.go`): add maps, for example:
   - `allianceToClients map[string]map[string]bool` — alliance id → client id set  
   - `corpToClients map[string]map[string]bool` — corporation id → client id set  
   With mutexes sized for expected contention (dedicated mutexes preferred over holding `ClientsMu` across fan-out).
2. **Register / unregister helpers:** call from scope upgrade and from disconnect (`reader.go` defer) so indexes always match **`Client.Scopes`** (and JWT ceiling). On disconnect, remove the client from **every** org entry it joined.
3. **Refactor** `broadcastToCorporationScope` / `broadcastToAllianceScope` in `dispatch.go` to iterate **only** the relevant map entry.

---

## Phase 4 — Downward filtering with `scopes`

**Objective:** After building candidates from the index, apply **`scopes`** so individual corps/accounts receive targeted updates.

1. In `deliverOutboundDocUpdate` (or dedicated helpers): apply **root** then **scopes** filter as in **Product semantics** above; then existing **echo suppression** (`ShouldSuppressRecipient`), **sync** skip policy, **`TrySendNonBlocking`** (`outgoinglogic/broadcast.go`).
2. **Invalid `scopes`:** log + metric; policy: strip invalid entries or drop message (document choice).
3. Extend or add small pure functions in `outgoinglogic` for “candidate client matches scopes” to keep `dispatch.go` readable and testable.

---

## Phase 5 — Scope upgrade on the wire

**Objective:** UI starts account-only; user enters corp/alliance section → client joins org pools.

1. **New JSON `type`** in `reader.go` (e.g. `upgrade_scopes` / `realtime_scopes`) with requested corporation/alliance ids.
2. **Authorization (required):** do not trust the browser alone. Pick one approach and document it in [interactions.md](./interactions.md):
   - **Option A — Reconnect with richer JWT:** User opens section → API mints new internal JWT with expanded `Corporations` / alliances → **new websocket** (matches existing “reconnect on token rotation” model). Index membership is applied in **`handler.go`** from claims when you choose to enable non-empty scopes at connect for that path.
   - **Option B — Same socket, server verification:** Upgrade message triggers a **server-side check** (HTTP call to API, or DB/session read) using `SessionID` / `AccountID` before mutating `Client.Scopes` and indexes.
3. On success: update **`Client.Scopes`**, update **corp/alliance maps**, send an ack message (new type or extend existing patterns).
4. **Post-upgrade data:** trigger **baseline sync** for that section (reuse `sync` handling in `reader.go` / `sync` package) so the client does not miss history that only existed before pool membership.

---

## Phase 6 — Session resume and token rotation

**Objective:** Indexes and scopes stay consistent across **`session_resume`** and JWT rotation.

1. Extend **`session_resume.go` / `ApplySessionResume`** (and Redis handoff if used) so restored connections **re-register** corp/alliance indexes from **current** JWT and/or persisted handoff state.
2. If upgraded scopes are **only in memory** on the old socket, define whether the client must **re-send upgrade** after resume or whether handoff persists upgraded org lists (document in [implementation.md](./implementation.md) when implemented).

---

## Phase 7 — Optional lazy per-org workers

**Objective:** Isolation and ordering **after** correctness and indexes are proven.

1. Create **per-active-alliance / per-active-corp** mailboxes only when the first client enters a pool; **bounded queues**; teardown when refcount hits zero (use **delayed delete** or refcounting to avoid races with quick reconnect).
2. Optionally decouple NATS callback from fan-out: callback **enqueues** `(rootType, rootID, rawBytes)`; workers drain by shard or by org id.

---

## Phase 8 — Observability and tests

- Extend **`metrics.go`**: index sizes, recipients per dispatch path, scope-narrowed vs full broadcasts, send-buffer drops, rejected upgrades.
- **Unit tests** in `outgoinglogic` for decode + scope matching.
- **Integration tests** for register → dispatch → unregister on disconnect and upgrade edge cases.

---

## Implementation order (dependency)

```
Phase 1  Contract + decode (scopes) + single unmarshal in dispatch
    ↓
Phase 2  JWT (alliances) + id normalization + progressive empty Scopes at connect
    ↓
Phase 3  allianceToClients / corpToClients + disconnect cleanup
    ↓
Phase 4  dispatch: index-based fan-out + scopes filter
    ↓
Phase 5  reader: upgrade message + auth + post-upgrade sync
    ↓
Publishers emit scopes on doc.update
    ↓
Phase 6  session_resume + handoff alignment
    ↓
Phase 7  (optional) per-org queues / worker pool
    ↓
Phase 8  Metrics + tests
```

---

## Primary files to touch

| File / area | Work |
|-------------|------|
| `services/websocket/server/outgoinglogic/outgoing.go` | Extended decode + scope types |
| `services/websocket/server/outgoinglogic/broadcast.go` | New predicates if needed |
| `services/websocket/server/dispatch.go` | Routing, indexes, scopes filter, remove double decode |
| `services/websocket/server/types.go`, `server.go` | New maps + mutexes |
| `services/websocket/server/handler.go` | Optional seed from JWT; normalise ids |
| `services/websocket/server/reader.go` | New inbound message type |
| `services/websocket/server/session_resume.go` | Scope / index consistency on resume |
| `services/shared/core/internaljwt/jwt.go` (+ API minting) | Alliance claims; corp ceiling |
| Doc update publishers (change-stream / NATS) | Attach `scopes` when not org-wide |
| `frontend/src/Realtime/` (or equivalent) | Reconnect or upgrade message when entering org sections |

---

## Documentation maintenance

When behaviour or contracts change, update **[implementation.md](./implementation.md)**, append a dated note to **[interactions.md](./interactions.md)**, and adjust **[plan-todo-tracker.md](./plan-todo-tracker.md)** if you track tasks there. If this plan’s phases move, edit **this file** in the same PR when practical.
