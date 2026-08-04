# websocket — tests

Live SoT for test depth under [`services/websocket`](../../../services/websocket). Behaviour → [websocket.md](../../backend/websocket/websocket.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Service tree | From `services/`: `go test ./websocket/...` | No Docker |
| Server package | `go test ./websocket/server/` | Unit + Integration in same package |
| Integration only | `go test ./websocket/server/ -count=1 -run Integration` | All via `newIntegFixture` |
| Related | `go test ./ws-router/ ./shared/wsplacement/` | Soft prefer + tenant keys |
| Soak helpers | `go test ./cmd/ws_soak/` | Plan/cohort unit only |

```bash
go test ./websocket/...
go test ./websocket/server/ -count=1 -run Integration
```

## Coverage map

**Depth:** Unit slices + Integration harness (miniredis; injectable Ready deps — not live NATS/Mongo). Sync / JetStream subscribe loop / Swarm multi-replica smoke still thin. Optional ops soak: `cmd/ws_soak` against a running stack.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `server/config` | `client_cutoff` + `target_clients` defaults and at-threshold |
| `server` (unit) | Drain/refuse (draining/cordon/cutoff); soft/full Redis; cordon signal/own-slot; hosted-tenant view; shutdown; doc-subscribe auth |
| `server` (integration) | SoT `newIntegFixture`: connect/Ready/soft/cutoff/cordon, hosted+soft, `DrainForRoll`+`please_reconnect`, scopes/resume, doc-lock pulse/viewer/batch/fanout delivery |
| `server/doclocklogic` | Parse/ack/pulse/batch classification |
| `server/outgoinglogic` | Suppress self-recipient; decode scopes; alliance/corp downward match |
| `server/natslogic` | Document-lock wire; fanout consumer inactive-threshold |
| `cmd/ws_soak` | Limits plan / mixed cohort key shapes / divert ratio helpers |

### Thin

- Fixture Ready mirrors app wiring — not `app.go` / `main.go` themselves
- NATS/Mongo Ready via flags only
- Soft router prefer covered in `ws-router` unit tests, not cross-process with websocket in CI

### Little / none

- `sync/` (processor, Mongo, queue, coordinator)
- `server/subscriptionlogic/`, `server/incominglogic/`, `server/identity/`, `server/model/`
- JetStream subscribe→fanout loop in fixture
- Automated Swarm multi-replica roll in CI

## Ops soak (not CI)

`services/cmd/ws_soak` against `eip up` / `eip dev` (docker network `eip-core`, Redis + `ws-router`):

| Profile | Purpose |
|---------|---------|
| `hold` | Hold N `/ws` clients; reconnect on close / `please_reconnect` |
| `limits` | Sync lowered `target_clients` / `client_cutoff` first; fill one corp home → soft; mixed account/corp/alliance keys assert place off soft; fill → full; mixed keys assert not-on-full |

See command header comments in `services/cmd/ws_soak/main.go`. Restore prod thresholds after limits runs.

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
