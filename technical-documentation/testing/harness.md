# Shared Go test harness (`testing`)

Live SoT for cross-cutting **ops soak / harness packages** under [`testing/`](../../testing/) — its own Go module `eve-industry-planner/testing`, sitting beside `services/` and `deployment-tool/` so either product module can share test code. Import path prefix: `eve-industry-planner/testing/…` (not the Go stdlib `testing` package). The module requires `services` (`replace ../services`), and `_test.go` files under `services/` may import it back — a non-test file may not, because the module is absent from the service image build context. Per-service unit depth stays in [services/contents.md](./services/contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Harness unit | From `testing/`: `go test ./...` | No Docker for `keys` / `wait` / `httpfake` / `redisfake` / `natsfake` / plan / cohort / fanout helpers |
| Ops soak CLI | From `testing/`: `go build -o ../.tmp/ws_soak ./ws_soak` then docker on `eip-core` | Needs live stack — [services/websocket.md](./services/websocket.md) § Ops soak |
| Capacity soak CLI | From `testing/`: `go build -o ../.tmp/capacity_soak ./capacity_soak` | Live stack — [services/capacity-controller.md](./services/capacity-controller.md) § Ops soak |
| Live Mongo tests | `./scripts/testing/live-mongo.sh [package] [pattern]` | Needs a live stack — see § Live Mongo |
| CI | `shared testing library` job in [test.yml](../../.github/workflows/test.yml) | Separate module — outside the `services` suite |

## Coverage map

| Package | Depth | What it covers |
|---------|-------|----------------|
| `testing/harness` | **Tested** (unit) | Shared `ConnectNATS`, `AsynqRedisOpt` / `CapacitySoakNoop` |
| `testing/mongolive` | **ops** (live stack) | The gate (`EIP_MONGO_PARITY_LIVE`), the two connections a live test can want — `Require` for ordinary work and `RequireWatch` for change streams — `ScratchAccount`, and the `OwnerMeta` / `OwnerDoc` fixture builders |
| `testing/keys` | **Tested** (unit) | Shared test key material: `EntityID` plus `EntityCipher` / `SetEntityID` for entity refs |
| `testing/wait` | **Tested** (unit) | `For` (test form, fails with the last detail) and `Until` (long-running form, returns an error and reports progress) |
| `testing/httpfake` | **Tested** (unit) | In-memory stand-in for an HTTP dependency a package calls out to: canned and queued replies, custom handlers, recorded calls |
| `testing/redisfake` | **Tested** (unit) | Per-test miniredis plus a wired client, both closed on cleanup; `Server` for direct store access (TTL, FastForward, Exists) |
| `testing/natsfake` | **Tested** (unit) | Per-test embedded NATS server with JetStream enabled, and the product handle bound to it. Storage is a per-test temp dir and the server is shut down on cleanup, so streams and durables never outlive the test that made them; `Conn` / `JS` / `URL` for helpers that still take a raw client |
| `testing/ws_soak/lib` (`soaklib`) | **Tested** (unit) / **ops** (live stack) | Hold / limits / pressure placement; **fanout**; `tenantGen` + `churnPool`; delivery tracker; JetStream publish (Mongo stubbed). **SoT for WS client seed/dial.** |
| `testing/ws_soak` | CLI | Thin `main.go` → `soaklib.Run` (flags only) |
| `testing/capacity_soak/lib` (`capsoak`) | **Tested** (unit) / **ops** (live stack) | Worker Asynq via harness; websocket/api hold via soaklib (`Accounts==Clients`) + Docker/NATS Observer; `-phase all\|up\|down` |
| `testing/capacity_soak` | CLI | Thin `main.go` → parse profile/phase → `capsoak.Run` |

## Live Mongo

Tests gated on `EIP_MONGO_PARITY_LIVE=1` run against the stack's own database. They connect through
`testing/mongolive`, which owns the gate and both client shapes so no test spells either itself:

| Helper | Use |
|--------|-----|
| `Require(t)` | The ordinary client. Skips when the gate is closed, pings before returning, disconnects on cleanup |
| `RequireWatch(t, streams)` | The change stream client, built without a client-wide operation timeout — a long-lived awaitable cursor would otherwise be ended by it. `streams` sizes the pool |
| `Enabled()` | For a test with something to do either way: live documents when reachable, fixtures when not |
| `Skip(t)` | The gate alone, for a test that reaches live data by its own path |
| `ScratchAccount(t, m, id)` | Clears an account's documents now and at test end, so a run that died before cleanup cannot poison the next |
| `OwnerMeta(owner)` / `OwnerDoc(owner)` | The `_meta` block, and the owner block inside it, for a fixture writing BSON directly. They take a `models.Owner`, so a caller cannot supply an id without a kind |

**They run in a container, not on the host.** The Mongo URL carries `replicaSet=`, so the driver treats
the host it is given as a seed, asks the replica set for its members, and connects to the name they
advertise — `mongo:27017`. That name resolves on the stack network and nowhere else, whatever
`MONGO_HOST` says. `scripts/testing/live-mongo.sh` builds a linux test binary and runs it on
`eip-core`, taking credentials from the running stack's secrets:

```bash
./scripts/testing/live-mongo.sh                              # shared/mongo
./scripts/testing/live-mongo.sh ./core/commands              # another package
./scripts/testing/live-mongo.sh ./shared/mongo Watchlist     # one test
```

Running inside the network rather than mapping `mongo` to loopback in a developer's hosts file is
deliberate: it needs no per-machine setup and works the same way in CI.

**An owner is a pair.** `models.AccountOwner` is the only construction that fills both kind and id;
setting `Owner.ID` alone compiles, looks right, and matches no owner-scoped read.

## Topic-only detail

- **Parent folder** — `testing/` holds shared harness products (CLI `main` + reusable `lib/` under the same tree). Fakes for one product package live next to that package instead — e.g. `services/capacity-controller/cluster/clusterfake`.
- **`httpfake`** — for a package under test that *calls out* over HTTP. Built on `httptest.NewTestServer`, so it has no listener and no loopback socket: callers reach it through `Client()`, and it works inside a `testing/synctest` bubble, where real network I/O never counts as durably blocked and would deadlock the test. Queued replies drain in order and the last repeats, so a poll loop can watch a value change and then settle. Product-specific stand-ins (ESI rate-limit headers, and the Deployment Tool's Engine routes in `internal/docker/enginetest`) are route tables built on that shape, not separate mechanisms. A test that hosts **its own** handler and needs a dialable address — the websocket integration fixture, which opens a real `ws://` connection — still uses `httptest.NewServer`: that is serving the code under test, not faking a dependency.
- **`keys`** — key material every test shares. Entity refs are deterministic, so a value encrypted under one key does not match a lookup derived under another: `keys.EntityCipher(t)` for a cipher, `keys.SetEntityID(t)` where the code resolves `ENTITY_ID_KEY` itself, and `keys.EntityID` for the rare caller with no `testing.TB` (a `TestMain`). A package testing the crypto itself supplies its own key — this is for everything downstream that just needs refs to line up.
- **`wait`** — one polling loop for the repo. `wait.For(t, timeout, cond)` is the test form: `cond` returns whether it holds plus a **detail string describing what it just observed**, and a timeout fails with that detail rather than a bare "never ready". `wait.Until(ctx, opts, try)` is the long-running form the soak tools use — same detail string, returned in the error, plus `Report` / `Alive`. Two loop shapes deliberately stay hand-written: a **steady-state** loop that asserts an invariant holds for a period, and a **blocking read** loop that waits on I/O rather than polling.
- **`natsfake`** — every test needing NATS takes `natsfake.New(t)`, which starts the **same server version as production** (`nats-server` is pinned in `services/go.mod` to match the deployed image) inside the test process. It runs the real server rather than a stub because the server's own behaviour is what several tests assert — that a durable's delivery policy cannot be updated, that publishing to a schedule subject replaces rather than appends, that purging a subject cancels a schedule. None of that can be checked against a stub without encoding the answer the test is asking for.
- **`redisfake`** — every test needing Redis takes `redisfake.New(t)`; `.Client` for the wired client, `.Server` to manipulate the store. It owns construction and both cleanups, so no test hand-rolls the miniredis dance. One caveat it also owns: miniredis listens on loopback TCP, so a client call is real network I/O and a test using this fixture cannot run inside a `testing/synctest` bubble. This constructor is the single place to change if that becomes necessary.
- **Shared package** — `testing/harness` for NATS connect / Asynq Redis; polling lives in `wait`. Domain WS profiles + client SoT stay in `soaklib`; Swarm observe + capacity phases stay in `capsoak` (capsoak calls soaklib hold directly).
- **Product unit/integration tests** stay next to the code under test.
- Unit, from `testing/`: `go test ./harness/... ./ws_soak/lib/... ./capacity_soak/lib/...`

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

How to run → [services/capacity-controller.md](./services/capacity-controller.md) § Ops soak. CLI: [`testing/capacity_soak/main.go`](../../testing/capacity_soak/main.go).

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

CLI: [`testing/ws_soak/main.go`](../../testing/ws_soak/main.go).
