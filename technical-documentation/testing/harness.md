# Shared Go test harness (`services/testing`)

Live SoT for cross-cutting **ops soak / harness packages** under [`services/testing/`](../../services/testing/). Import path prefix: `eve-industry-planner/testing/…` (not the Go stdlib `testing` package). Per-service unit depth stays in [services/contents.md](./services/contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Harness unit | From `services/`: `go test ./testing/...` | No Docker for plan/cohort/fanout helpers |
| Ops soak CLI | `go build -o ../.tmp/ws_soak ./testing/ws_soak` then docker on `eip-core` | Needs live stack — [services/websocket.md](./services/websocket.md) § Ops soak |
| Capacity soak CLI | `go build -o ../.tmp/capacity_soak ./testing/capacity_soak` | Live stack — [services/capacity-controller.md](./services/capacity-controller.md) § Ops soak |
| Full services suite | `go test ./…` | Includes `./testing/...` |

## Coverage map

| Package | Depth | What it covers |
|---------|-------|----------------|
| `testing/harness` | **Tested** (unit) | Shared `ConnectNATS`, `PollUntil`, `AsynqRedisOpt` / `CapacitySoakNoop` |
| `testing/ws_soak/lib` (`soaklib`) | **Tested** (unit) / **ops** (live stack) | Hold / limits / pressure placement; **fanout**; `tenantGen` + `churnPool`; delivery tracker; JetStream publish (Mongo stubbed). **SoT for WS client seed/dial.** |
| `testing/ws_soak` | CLI | Thin `main.go` → `soaklib.Run` (flags only) |
| `testing/capacity_soak/lib` (`capsoak`) | **Tested** (unit) / **ops** (live stack) | Worker Asynq via harness; websocket/api hold via soaklib (`Accounts==Clients`) + Docker/NATS Observer; `-phase all\|up\|down` |
| `testing/capacity_soak` | CLI | Thin `main.go` → parse profile/phase → `capsoak.Run` |
| `testing/capacity_controller/clusterfake` | **Tested** | Recording in-memory `cluster.Cluster` — not in product binary |

## Topic-only detail

- **Parent folder** — `services/testing/` holds shared harness products (CLI `main` + reusable `lib/` under the same tree).
- **Shared package** — `testing/harness` for connect/poll/Asynq Redis. Domain WS profiles + client SoT stay in `soaklib`; Swarm observe + capacity phases stay in `capsoak` (capsoak calls soaklib hold directly).
- **Product unit/integration tests** stay next to the code under test.
- Unit: `go test ./testing/harness/... ./testing/ws_soak/lib/... ./testing/capacity_soak/lib/...`

### Shared harness conventions

| Item | Behaviour |
|------|-----------|
| NATS | `harness.ConnectNATS` → product `natscore.Connect` (`NATS_URL`) |
| Poll loops | `harness.PollUntil` (+ optional `Alive`) |
| WS hold for other soaks | Call `soaklib.Run` ProfileHold with `Accounts == Clients` (capsoak pattern); do not put soaklib behind harness (import cycle) |
| Asynq Redis | `harness.AsynqRedisOpt` from `config.RedisURL`; task type `harness.CapacitySoakNoop` |

### Capacity soak conventions

| Item | Behaviour |
|------|-----------|
| Profiles | `-profile worker` \| `websocket` (`ws`) \| `api` |
| Phases | `-phase all` (default) \| `up` \| `down` |
| Observe | Prefer `DOCKER_HOST` for **desired**; else NATS health running counts |
| Demo timing | Shorten `scale_*` in `eip.config.yaml`, then `eip sync` |
| WS thresholds | Lower `target_clients` so hold can cross reserve; restore after |
| Worker | Pause → enqueue `harness.CapacitySoakNoop` → scale-up → unpause → scale-down |
| Websocket | soaklib hold (`Accounts==Clients`, auto `-ramp` / `-min-live`) → scale-up → idle → scale-down |
| Api | Same hold; asserts **api** replicas |
| Logging | Prefer `LOG_LEVEL=warn` on `eip-core` |
| Pass | up: effective ≥ `-want`; down: effective ≤ `-min` |

How to run → [services/capacity-controller.md](./services/capacity-controller.md) § Ops soak. CLI: [`services/testing/capacity_soak/main.go`](../../services/testing/capacity_soak/main.go).

### Fanout ops conventions

| Item | Behaviour |
|------|-----------|
| Default `-ws-url` | `ws://traefik:80/ws` (browser path). Bypass: `ws://ws-router:8080/ws` |
| Wall | `-ramp` (connect/churn only) + `-duration` (JetStream publish window) |
| Inventory | Capped at `-clients` (default 500); continuous gen does not grow past bootstrap |
| Publish | Until duration ends; `-fanout-messages` is a soft pub floor warn only (0 = none) |
| Logging | Always pass `-e LOG_LEVEL=warn` (or higher) — `.env` debug floods JetStream publish logs |
| `pending` in reports | Soak `deliveryTracker` open expects — **not** NATS consumer pending or WS outbound queue depth |
| Pass | `wrong=0 dup=0 offline_hit=0` and drain completes; coloc when `-require-coloc` |

CLI: [`services/testing/ws_soak/main.go`](../../services/testing/ws_soak/main.go).
