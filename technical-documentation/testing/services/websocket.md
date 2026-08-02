# websocket — tests

Live SoT for test depth under [`services/websocket`](../../../services/websocket). Behaviour → [websocket.md](../../backend/websocket/websocket.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Service tree | From `services/`: `go test ./websocket/...` | No Docker |
| Server package | `go test ./websocket/server/` | Cutoff / cordon / subscribe auth |

```bash
go test ./websocket/...
```

## Coverage map

**Depth:** Focused unit slices (cutoff, cordon/drain, outbound matching, some NATS/doc-subscribe auth). Most WS lifecycle, sync, and subscription reconcile paths are untested.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `server/config` | Slot client-cutoff defaults and at-cutoff checks |
| `server` (subset) | Advertised app-version fanout/resolve; cordon/drain signal parse + own-slot filter; doc-subscribe auth (singleton account docs, unknown collection denied, jobs need Mongo) |
| `server/outgoinglogic` | Suppress self-recipient; decode outbound scopes; alliance/corp downward recipient matching |
| `server/natslogic` | Document-lock wire shape / suppress-requested; doc-fanout consumer inactive-threshold config |

### Thin

- Helper/auth/NATS-shape slices only — not full upgrade → subscribe → fanout paths

### Little / none

- `sync/` (processor, Mongo, queue, coordinator)
- `server/subscriptionlogic/`, `server/incominglogic/`, `server/identity/`, `server/model/`
- Most of `server/`: upgrader, reader/writer, processor, NATS subscriptions, handlers, doc-lock presence, session resume, shutdown, metrics
- App wiring: `main.go`, `app.go`

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- Affinity / multi-client load sims are not in this suite (separate harness track when built).
