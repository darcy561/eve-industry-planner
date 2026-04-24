# WebSocket org routing, `scopes`, and progressive pools

This document is the **canonical contract** for alliance/corporation-scoped realtime delivery and progressive client pools. It complements [IMPLEMENTATION.md](./IMPLEMENTATION.md) (full service map) and [SCOPED-REALTIME-ROUTING-PLAN.md](./SCOPED-REALTIME-ROUTING-PLAN.md) (design history).

## Dispatch precedence (`deliverOutboundDocUpdate`)

For each JetStream `doc.update.*` message, the websocket server unmarshals the JSON **once** ([`outgoinglogic.DecodeOutboundMessage`](../../../services/websocket/server/outgoinglogic/decode.go)) and routes in this order:

1. **`accountID` non-empty** → account fan-out via `userConnections` ([`dispatch.go`](../../../services/websocket/server/dispatch.go)).
2. Else **`corporationID` non-empty** → corporation pool: `corpToClients[corporationID]`; apply downward **`scopes`** filter; then echo suppression + sync skip + non-blocking send.
3. Else **`allianceID` non-empty** → alliance pool: `allianceToClients[allianceID]`; apply **`scopes`** (union of corporation vs account targeting); then same delivery guards.
4. Else → **explicit doc subscribers** only (`subscribe` / `unsubscribe` path).

**Backward compatibility:** Existing account-scoped changestream messages keep **`accountID`** set; they never hit corp/alliance branches.

## `ChangeStreamMessage` / NATS JSON fields

Published by [`services/core/changestream/watcher.go`](../../../services/core/changestream/watcher.go):

| Field | Purpose |
|-------|---------|
| `accountID` | Account-scoped routing (existing behavior). |
| `corporationID` / `allianceID` | Org roots when **no** `accountID` is set on the payload (or when publishers omit account routing for org-wide docs). Extracted from document root or `_meta` (`corporationID` / `corporationId`, `allianceID` / `allianceId`). |
| `scopes` | Optional object: `corporationIDs[]`, `accountIDs[]` (strings or JSON numbers coerced to string). **Empty or absent** → deliver to **all** clients in that org’s pool on the replica. **Alliance path:** union semantics — recipient matches if their **corp membership list** intersects `scopes.corporationIDs` **or** their `accountID` is in `scopes.accountIDs`. **Corporation path:** if `scopes.accountIDs` is set, only those accounts receive the message. |
| `collection`, `docID`, `sourceClientID`, `sourceSessionID` | Unchanged. |

Mongo documents may carry `_meta.scopes` or root `scopes` with the same shape; the watcher copies them into the NATS payload.

## Internal JWT ceiling

[`InternalClaims`](../../../services/shared/core/internaljwt/jwt.go) includes:

- **`corporations`** — `[]int64` (existing).
- **`alliances`** — `[]int64` (optional; for future ESI-backed population).

At websocket upgrade ([`handler.go`](../../../services/websocket/server/handler.go)), the server stores **allowed org id sets** on the client (`allowedCorpJWT`, `allowedAllianceJWT`, string keys) derived from these claims. **`Client.Scopes`** starts **empty** for corporations/alliances until the client upgrades (progressive pools).

## Browser → server: `upgrade_scopes`

Inbound JSON ([`reader.go`](../../../services/websocket/server/reader.go)):

```json
{
  "type": "upgrade_scopes",
  "corporationIDs": ["98000001"],
  "allianceIDs": ["99000001"]
}
```

- The server **intersects** requested ids with the **JWT ceiling** on this connection. Invalid ids are ignored; if nothing remains, no pools are joined.
- On success, **`Client.Scopes`** is updated and **`corpToClients` / `allianceToClients`** reverse indexes are updated ([`org_indexes.go`](../../../services/websocket/server/org_indexes.go), [`scope_upgrade.go`](../../../services/websocket/server/scope_upgrade.go)).

### `scopes_ack` (server → browser)

```json
{
  "type": "scopes_ack",
  "ok": true,
  "subscription": {
    "account": true,
    "corporation": true,
    "alliance": false
  }
}
```

### `connected` (unchanged type, expanded subscription hint)

```json
{
  "type": "connected",
  "clientID": "...",
  "subscription": {
    "account": true,
    "corporation": false,
    "alliance": false
  }
}
```

## Session resume + Redis handoff

[`session_resume.go`](../../../services/websocket/server/session_resume.go) snapshots **explicit doc IDs** and **active corporation/alliance scope lists** on disconnect. Redis payload keys: `corporation_ids`, `alliance_ids` (alongside `docs`). On `session_resume`, explicit subs are replayed; org scopes are **re-intersected** with the **new** JWT ceiling before re-registering pools, then **`scopes_ack`** may be sent.

## Performance characteristics (server)

- **Corp vs alliance index locks:** `corpIndexMu` and `allianceIndexMu` are separate so broadcasting to one corporation does not block alliance index maintenance (and vice versa). When both indexes must be updated together (upgrade, resume, disconnect), the server always locks **`corpIndexMu` then `allianceIndexMu`** to avoid deadlock.
- **Outbound shards:** JetStream `doc.update` consumption enqueues by **partition key** — `account:{id}`, `corporation:{id}`, `alliance:{id}`, or `explicit:{collectionScopedDocID}` ([`outbound_doc_update.go`](../../../services/websocket/server/outbound_doc_update.go)). FNV hash maps the key to one of **`DocUpdateOutboundShardCount`** FIFO channels; each shard has **`DocUpdateOutboundShardQueueCap`** slots. **Order is preserved per partition key** (same account/corp/alliance/explicit id always hits the same shard FIFO). Different keys may run in parallel on different shards. If a shard’s queue is full, that message is delivered **inline** on the consume callback (warn logged) and can reorder relative to other messages **for the same shard**; tune caps to keep this rare.

## Practices (maintainers)

1. **Never widen org delivery from the browser** — only the JWT ceiling + validated `upgrade_scopes` may add a socket to `corpToClients` / `allianceToClients`.
2. **Publishers** that need org fan-out must set **`corporationID` / `allianceID`** on the NATS payload when **`accountID`** must not take precedence; attach **`scopes`** when the update is not org-wide.
3. **Document contract changes** here, in [IMPLEMENTATION.md](./IMPLEMENTATION.md), and append [INTERACTIONS.md](./INTERACTIONS.md); keep [SCOPED-REALTIME-ROUTING-PLAN.md](./SCOPED-REALTIME-ROUTING-PLAN.md) aligned when phases complete.
