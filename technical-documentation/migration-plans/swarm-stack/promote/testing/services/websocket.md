# websocket — tests

Live SoT for test depth under [`services/websocket`](../../../services/websocket). Behaviour → [websocket.md](../../backend/websocket/websocket.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Service tree | From `services/`: `go test ./websocket/...` | No Docker |
| Server package | `go test ./websocket/server/` | Unit + Integration in same package |
| Integration only | `go test ./websocket/server/ -count=1 -run Integration` | All via `newIntegFixture` |
| Related | `go test ./ws-router/ ./shared/wsplacement/ ./shared/container/` | Place prefer + tenant keys + identity |
| Soak helpers | `go test ./testing/ws_soak/lib/...` | Plan/cohort unit only |

```bash
go test ./websocket/...
go test ./websocket/server/ -count=1 -run Integration
```

## Coverage map

**Depth:** Unit slices + Integration harness (miniredis; injectable Ready deps — not live NATS/Mongo for most cases). Selective JetStream fan-out covered with embedded `nats-server` in-package. Sync / Swarm multi-replica smoke still thin. Optional ops soak: `testing/ws_soak` against a running stack.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `server/config` | `client_cutoff` + `target_clients` defaults and at-threshold |
| `server` (unit) | Drain/refuse (draining/cutoff); soft/full NATS publish + `/placement`; hosted-tenant view; shutdown; outbound flush order; doc-subscribe auth; payload-prefer doc-update id parse |
| `server` (integration) | SoT `newIntegFixture`: connect/Ready/soft/cutoff, hosted+soft, `DrainForRoll`+`please_reconnect`, scopes/resume, doc-lock pulse/viewer/batch/fanout delivery |
| `server` (JetStream E2E) | `TestIntegrationSelectiveFanoutHostPullsNonHostDoesNot`: HostedTenants → FilterSubjects; host pulls tenant-keyed `doc.update`; peer inert pulls 0; empty host → inert |
| `server/doclocklogic` | Parse/ack/pulse/batch classification |
| `server/outgoinglogic` | Suppress self-recipient; decode scopes; alliance/corp downward match |
| `server/natslogic` | Document-lock wire; fanout consumer inactive-threshold; start inert FilterSubjects (not firehose) |
| `server/identity` | JetStream durable names from `container.ID()` |
| `testing/ws_soak` (`main` + `lib`/`soaklib`) | Limits plan / mixed cohort key shapes / divert ratio helpers; NATS soft/full watcher |

### Thin

- Fixture Ready mirrors app wiring — not `app.go` / `main.go` themselves
- NATS/Mongo Ready via flags only (except selective-fanout E2E above)
- Soft router prefer covered in `ws-router` unit tests, not cross-process with websocket in CI
- Formal Grafana pull≈0 gauges / soak profile for selective fan-out (manual stack check OK)

### Little / none

- `sync/` (processor, Mongo, queue, coordinator)
- `server/subscriptionlogic/`, `server/incominglogic/`, `server/model/`
- Automated Swarm multi-replica roll in CI

## Ops soak (not CI)

`services/testing/ws_soak` against `eip up` / `eip dev` (docker network `eip-core`, NATS + `ws-router`; Redis only for session seed):

| Profile | Purpose |
|---------|---------|
| `hold` | Hold N `/ws` clients; reconnect on close / `please_reconnect` |
| `limits` | Sync lowered `target_clients` / `client_cutoff` first; fill one corp home → soft; mixed account/corp/alliance keys assert place off soft via `connected.container_id`; fill → full; mixed keys assert not-on-full |

See command header comments in `services/testing/ws_soak/main.go`. Restore prod thresholds after limits runs.

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
