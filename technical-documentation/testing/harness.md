# Shared Go test harness (`services/testing`)

Live SoT for cross-cutting **ops soak / harness packages** under [`services/testing/`](../../services/testing/). Import path prefix: `eve-industry-planner/testing/…` (not the Go stdlib `testing` package). Per-service unit depth stays in [services/contents.md](./services/contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Harness unit | From `services/`: `go test ./testing/...` | No Docker for plan/cohort/fanout helpers |
| Ops soak CLI | `go build -o ../.tmp/ws_soak ./testing/ws_soak` then docker on `eip-core` | Needs live stack — [services/websocket.md](./services/websocket.md) § Ops soak |
| Full services suite | `go test ./…` | Includes `./testing/...` |

## Coverage map

| Package | Depth | What it covers |
|---------|-------|----------------|
| `testing/ws_soak/lib` (`soaklib`) | **Tested** (unit) / **ops** (live stack) | Hold / limits / pressure placement; **fanout** phased ramp then JetStream publish; inventory-capped `tenantGen` + `churnPool`; soft stop (freeze → drain expects → stop workers); leave-timeout force-leave (non-fatal); exact delivery (`deliveryTracker`); ready-settle; leave-waits-pending; cheap WS frame parse; JetStream publish (Mongo stubbed). |
| `testing/ws_soak` | CLI | Thin `main.go` → `soaklib.Run` (flags only) |

## Topic-only detail

- **Parent folder** — `services/testing/` holds shared harness products (CLI `main` + reusable `lib/` under the same tree; no separate `services/cmd/` for soaks).
- **Product unit/integration tests** remain next to the code under test (`websocket/server`, `shared/…`). Move something here only when it is reused across services or is an ops soak/harness.
- Conventions for new packages: extend [technical-rules.md](./technical-rules.md) when a second harness lands with shared patterns.
- Unit: `go test ./testing/ws_soak/lib/...`

### Fanout ops conventions

| Item | Behaviour |
|------|-----------|
| Default `-ws-url` | `ws://traefik:80/ws` (browser path). Bypass: `ws://ws-router:8080/ws` |
| Wall | `-ramp` (connect/churn only) + `-duration` (JetStream publish window) |
| Inventory | Capped at `-clients` (default 500); continuous gen does not grow past bootstrap |
| Publish | Until duration ends; `-fanout-messages` is a soft floor warn only (0 = none) |
| Logging | Always pass `-e LOG_LEVEL=warn` (or higher) — `.env` debug floods JetStream publish logs |
| `pending` in reports | Soak `deliveryTracker` open expects — **not** NATS consumer pending or WS outbound queue depth |
| Latency line | First matching WS recv after TrackPub (matched deliveries only) |
| Pass | `wrong=0 dup=0 offline_hit=0` and drain completes; coloc when `-require-coloc` |
| Scale note | High `-fanout-rate` can leave soak-side pending at soft-stop; capacity/coloc can still be healthy |

CLI header comments: [`services/testing/ws_soak/main.go`](../../services/testing/ws_soak/main.go).
