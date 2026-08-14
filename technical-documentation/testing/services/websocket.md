# websocket — tests

Live SoT for test depth under [`services/websocket`](../../../services/websocket). Behaviour → [websocket.md](../../backend/websocket/websocket.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Service tree | From `services/`: `go test ./websocket/...` | No Docker |
| Server package | `go test ./websocket/server/` | Unit + Integration in same package |
| Integration only | `go test ./websocket/server/ -count=1 -run Integration` | All via `newIntegFixture` |
| Related | `go test ./ws-router/ ./shared/wsplacement/ ./shared/container/` | Place prefer + tenant keys + identity |
| Soak helpers | `go test ./testing/ws_soak/lib/...` | Plan/cohort/fanout unit — [../harness.md](../harness.md) |

```bash
go test ./websocket/...
go test ./websocket/server/ -count=1 -run Integration
```

## Coverage map

**Depth:** Unit slices + Integration harness (miniredis; injectable Ready deps — not live NATS/Mongo for most cases). Selective JetStream fan-out covered with embedded `nats-server` in-package. Sync / Swarm multi-replica smoke still thin. Optional ops soak: `testing/ws_soak` against a running stack (Traefik edge by default).

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
| `testing/ws_soak` (`main` + `lib`/`soaklib`) | Hold / limits / **pressure** / **fanout** (phased ramp + duration publisher; exact ready-recipient delivery; inventory cap; non-fatal leave-timeout; corp/alliance coloc); divert/coloc for placement profiles; Mongo publisher stubbed |

### Thin

- Fixture Ready mirrors app wiring — not `app.go` / `main.go` themselves
- NATS/Mongo Ready via flags only (except selective-fanout E2E above)
- Soft router prefer covered in `ws-router` unit tests, not cross-process with websocket in CI
- Formal Grafana dashboards for selective fan-out (manual stack + soak OK)

### Little / none

- `sync/` (processor, Mongo, queue, coordinator)
- `server/subscriptionlogic/`, `server/incominglogic/`, `server/model/`
- Automated Swarm multi-replica roll in CI

## Ops soak (not CI)

`services/testing/ws_soak` (`main.go` + library `lib` / `soaklib`) against `eip up` / `eip dev` on docker network `eip-core`.

**Default path:** `-ws-url ws://traefik:80/ws` → Traefik → ws-router → websocket (same as browsers). Bypass router-only: `-ws-url ws://ws-router:8080/ws`. Redis is used only to seed sessions.

| Profile | Purpose |
|---------|---------|
| `hold` | Hold N `/ws` clients; reconnect on close / `please_reconnect`; **`-require-coloc`** (default) fails if a shared affinity key lands on >1 backend |
| `limits` | Sync lowered `target_clients` / `client_cutoff` first; fill one corp home → soft; mixed keys assert place off soft; fill → full; mixed keys assert not-on-full; fill cohort must stay co-located |
| `pressure` | Combined: many sticky account/corp/alliance **groups** hold while a fill corp is driven soft→full; mixed keys assert divert / hard-skip; scale with `-clients` / `-groups` / `-group-size` |
| `fanout` | **Phase 1** `-ramp` (default **30s**): connect/churn only — FilterSubjects NATS spike expected, soak pubs held. **Phase 2** `-duration`: JetStream pubs at `-fanout-rate` (default 100/s). Inventory capped at `-clients`. Soft stop: publish/gen stop → freeze churn → drain expects → stop workers. Exact expects on **ready** recipients only (FilterSubjects widen/`DeliverNew` gap accepted). Coloc when `-require-coloc`. Mongo publish stubbed |

```bash
# from services/ after eip up / eip dev (network eip-core; JetStream doc-update-stream)
go build -o ../.tmp/ws_soak ./testing/ws_soak
docker run --rm --network eip-core --env-file ../.env \
  -e LOG_LEVEL=warn -e REDIS_HOST=redis -e REDIS_PORT=6379 -e NATS_URL=nats://nats:4222 \
  -v "$PWD/../.tmp/ws_soak:/ws_soak:ro" --entrypoint /ws_soak alpine:3.20 \
  -profile fanout -publish jetstream -clients 500 \
  -fanout-messages 0 -fanout-rate 100 -fanout-live-ratio 0.65 \
  -fanout-affinity-mix 0.25 -duration 10m -flag-wait 90s -ramp 30s
# default -ws-url ws://traefik:80/ws. Direct router: -ws-url ws://ws-router:8080/ws
```

**Reading fanout reports**

| Field | Meaning |
|-------|---------|
| `pub_rate` | Soak JetStream publish rate in the last report interval |
| `pending` | Open exact-delivery expects in the harness — not NATS backlog / WS output queue |
| `latency` | First matched WS recv after publish stamp |
| `wrong` / `dup` / `offline_hit` | Exact-delivery failures (pass requires all zero) |
| Drain timeout | Soft-stop waited for pending=0; high rate can leave soak-side lag with capacity still healthy |

Shared conventions → [../harness.md](../harness.md). CLI comments → `services/testing/ws_soak/main.go`. Pressure / limits need lowered thresholds via `eip sync` and ≥2 websocket replicas; restore prod thresholds after. Fanout needs live JetStream `doc-update-stream`.

**Dev profiling:** websocket `:19100/debug/pprof/*` when `ENVIRONMENT=development` — [backend websocket.md](../../backend/websocket/websocket.md) § Health. Off on live.

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
