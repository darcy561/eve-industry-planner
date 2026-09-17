# Shared Go test harness (`testing`)

Live SoT for cross-cutting **ops soak / harness packages** under [`testing/`](../../testing/) — its own Go module `eve-industry-planner/testing`, sitting beside `services/` and `deployment-tool/` so either product module can share test code. Import path prefix: `eve-industry-planner/testing/…` (not the Go stdlib `testing` package). The module requires `services` (`replace ../services`), and `_test.go` files under `services/` may import it back — a non-test file may not, because the module is absent from the service image build context. Per-service unit depth stays in [services/contents.md](./services/contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Harness unit | From `testing/`: `go test ./...` | No Docker for `keys` / `wait` / `httpfake` / `redisfake` / `redisfixture` / `natsfake` / `gosource` / `serviceboundaries` / plan / cohort / fanout helpers |
| Cross-service guard | From `testing/`: `go test ./serviceboundaries/` | Fails when a service imports another service, or when `services/shared/` imports a service |
| Session cross-service check | From `testing/`: `go test ./sessionhandover/` | Drives one planner session through the API, websocket and worker/core paths each actually uses |
| Ops soak CLI | From `testing/`: `go build -o ../.tmp/ws_soak ./ws_soak` then docker on `eip-core` | Needs live stack — [services/websocket.md](./services/websocket.md) § Ops soak |
| Capacity soak CLI | From `testing/`: `go build -o ../.tmp/capacity_soak ./capacity_soak` | Live stack — [services/capacity-controller.md](./services/capacity-controller.md) § Ops soak |
| Model parity CLI | From `testing/`: `go build -o ../.tmp/model_parity ./model_parity` | Live stack — sweeps every stored document against its Go model; see § Model parity |
| Live Mongo tests | `./scripts/testing/live-mongo.sh [package] [pattern]` | Needs a live stack — see § Live Mongo |
| CI | `shared testing library` job in [test.yml](../../.github/workflows/test.yml) | Separate module — outside the `services` suite |

## Coverage map

| Package | Depth | What it covers |
|---------|-------|----------------|
| `testing/harness` | **Tested** (unit) | Shared `ConnectNATS`, `AsynqRedisOpt` / `CapacitySoakNoop` |
| `testing/mongolive` | **ops** (live stack) | The gate (`EIP_MONGO_PARITY_LIVE`), the two connections a live test can want — `Require` for ordinary work and `RequireWatch` for change streams — `ScratchAccount`, and the `OwnerMeta` / `OwnerDoc` fixture builders |
| `testing/cloudaccount` | **ops** (live stack) | A seeded cloud account for the live tests that refresh and rewrite `users.refreshTokens`: rows with material derived from their own hash so a read-back says plainly whether a value changed, a signed SSO stand-in, a keyring from `testing/keys`, and cleanup at both ends of the run. `Rows` and `Material` read the stored state back |
| `testing/keys` | **Tested** (unit) | Shared test key material: `EntityID` plus `EntityCipher` / `SetEntityID` for entity refs; `RefreshTokenAES` / `SetRefreshTokenAES` for the refresh-token keyring, so a fixture that seeds encrypted rows and the code reading them back agree on one key |
| `testing/wait` | **Tested** (unit) | `For` (test form, fails with the last detail), `ForTicking` (the simulated-time form, advancing a caller-supplied clock between checks instead of sleeping) and `Until` (long-running form, returns an error and reports progress) |
| `testing/httpfake` | **Tested** (unit) | In-memory stand-in for an HTTP dependency a package calls out to: canned and queued replies, custom handlers, recorded calls |
| `testing/redisfake` | **Tested** (unit) | Per-test miniredis plus a wired client, both closed on cleanup; `Server` for direct store access (TTL, FastForward, Exists); `NewForBubble` for a test driving it from inside a `testing/synctest` bubble — see § `redisfake` |
| `testing/redisfixture` | **Tested** (unit) | `redisfixture.New(t)` — a `redisfake.Redis` with the service-facing `*eipredis.Redis` handle already bound (`Handle`), so a test does not hand-roll `eipredis.NewRedis(fake.Client)` itself |
| `testing/natsfake` | **Tested** (unit) | Per-test embedded NATS server with JetStream enabled, and the product handle bound to it. Storage is a per-test temp dir and the server is shut down on cleanup, so streams and durables never outlive the test that made them; `Conn` / `JS` / `URL` for helpers that still take a raw client |
| `testing/gosource` | **Tested** (unit) | Walks every `.go` file under a module root for a test that asserts an invariant which must hold everywhere — the codebase's `,omitempty`/`,omitzero` scalar sweep and its `bson` counterpart both use it, because reflection only reaches types a test names, and the types most likely to carry the mistake are unexported ones nothing imports |
| `testing/serviceboundaries` | **Tested** (unit) | Parses every Go file's imports under each discovered service and fails on a crossing into another service, or on `services/shared/` importing a service. Covers non-test files, `_test.go` files and build-tagged files |
| `testing/sessionhandover` | **Tested** (unit) | One planner session driven through the API's login write and auth middleware, the websocket's upgrade read, the worker's grants update, and the core's maintenance sweep, asserting each stage sees what the previous one wrote |
| `testing/ws_soak/lib` (`soaklib`) | **Tested** (unit) / **ops** (live stack) | Hold / limits / pressure placement; **fanout**; `tenantGen` + `churnPool`; delivery tracker; JetStream publish (Mongo stubbed). **SoT for WS client seed/dial.** |
| `testing/ws_soak` | CLI | Thin `main.go` → `soaklib.Run` (flags only) |
| `testing/capacity_soak/lib` (`capsoak`) | **Tested** (unit) / **ops** (live stack) | Worker Asynq via harness; websocket/api hold via soaklib (`Accounts==Clients`) + Docker/NATS Observer; `-phase all\|up\|down` |
| `testing/capacity_soak` | CLI | Thin `main.go` → parse profile/phase → `capsoak.Run` |
| `testing/model_parity/lib` (`modelparity`) | **Tested** (unit) / **ops** (live stack) | Per-collection sweep (decode, round trip, orphan census), the job corpus the SPA test reads, and `JSONPaths` — the model's own JSON surface by reflection |
| `testing/model_parity` | CLI | Thin `main.go` → parse phase → `modelparity.Run` |
| `testing/fixtures/model-parity` | **Tested** (unit) | `instance-keys.json` — which map keys name an instance rather than a field, embedded for the Go sweep and read by the SPA parity test |

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

## Model parity

`model_parity` answers a different question from the live parity tests under `services/shared/mongo`.
Those assert one behaviour against a scratch account; this sweeps **every** document the stack holds
and reports a census — what the model rejected, what it failed to reproduce, and which stored fields
no model writes back.

| Phase | What it does |
|-------|--------------|
| `census` | Decode each document into its model, encode it back, compare against what was stored |
| `corpus` | Write the job documents as the API serialises them, plus the model's JSON paths beside them |
| `all` | Both |

Exit status is 1 when a model rejected or altered a document. **Orphans do not fail the run**: a field
the model stopped writing years ago is a cleanup, not a regression, and failing on it would leave the
tool permanently red.

An orphan still matters. The upsert builds `$set` from the struct, so a key no model writes stays on
disk untouched while whatever replaced it moves on — the stored figure and the derived one disagree
from then on, and nothing reads the stale one to notice.

Which map keys name an instance rather than a field is shared data, not a rule each side spells for
itself: [`testing/fixtures/model-parity/instance-keys.json`](../../testing/fixtures/model-parity/instance-keys.json)
holds the shapes, the Go sweep embeds them (it runs as a binary inside a container, where the
repository is not present) and the SPA test reads the same file. A shape added on one side alone would
leave the two counting different things without either failing.

Numeric BSON types compare as one value. The same field is `int32` in some documents and `double` in
others depending on when it was written; the driver converts on the way in, so a widened type is not a
difference and reporting it would bury the real findings under every number in the corpus.

### The SPA half

A job has a second boundary: what the API sends becomes a `Job` in the browser and is written back by
`toDocument()`. That leg cannot be driven from Go, so it lives beside the class it tests —
[`frontend/src/Classes/job.parity.test.js`](../../frontend/src/Classes/job.parity.test.js) — and reads
the corpus this tool writes:

```bash
cd frontend
EIP_JOB_CORPUS=../.tmp/model-parity/jobs.jsonl npx vitest run src/Classes/job.parity.test.js
```

Without a corpus it skips rather than standing in for coverage it does not have.

The schema is what makes that test precise. A field the SPA adds is a fault only when the model has
nowhere to put it; a field left out of one document under `omitempty` is not. A single document cannot
tell those apart — only the model's type can, so the paths come from Go reflection.

They are **committed**, at
[`testing/fixtures/model-parity/job-schema.json`](../../testing/fixtures/model-parity/job-schema.json),
for the same reason `instance-keys.json` is: the SPA cannot produce them, and a file written only when
the Go sweep runs goes stale the moment the model gains a field — after which the SPA test reads that
field as one the client invented, and says so on every document carrying it.

`TestJobSchemaFixtureMatchesTheModel` fails when the fixture and `models.Job` disagree, naming what the
model gained or lost, so the staleness is caught where it starts rather than as a false fault on the
other side of the boundary.

`null` and an empty collection are treated as the same thing on that leg. Go marshals a nil slice as
`null` and the SPA builds `[]`; both say the collection is empty. Which of them the wire should settle
on is a separate question from whether anything was lost.

**The corpus carries real account data.** It is written under `.tmp`, which is not tracked, and must
not be committed — the same rule as `.tmp/mongo-parity`.

## Topic-only detail

- **Parent folder** — `testing/` holds shared harness products (CLI `main` + reusable `lib/` under the same tree). Fakes for one product package live next to that package instead — e.g. `services/capacity-controller/cluster/clusterfake`.
- **`httpfake`** — for a package under test that *calls out* over HTTP. Built on `httptest.NewTestServer`, so it has no listener and no loopback socket: callers reach it through `Client()`, and it works inside a `testing/synctest` bubble, where real network I/O never counts as durably blocked and would deadlock the test. Queued replies drain in order and the last repeats, so a poll loop can watch a value change and then settle. Product-specific stand-ins (ESI rate-limit headers, and the Deployment Tool's Engine routes in `internal/docker/enginetest`) are route tables built on that shape, not separate mechanisms. A test that hosts **its own** handler and needs a dialable address — the websocket integration fixture, which opens a real `ws://` connection — still uses `httptest.NewServer`: that is serving the code under test, not faking a dependency.
- **`keys`** — key material every test shares. Entity refs are deterministic, so a value encrypted under one key does not match a lookup derived under another: `keys.EntityCipher(t)` for a cipher, `keys.SetEntityID(t)` where the code resolves `ENTITY_ID_KEY` itself, and `keys.EntityID` for the rare caller with no `testing.TB` (a `TestMain`). A package testing the crypto itself supplies its own key — this is for everything downstream that just needs refs to line up.
- **`wait`** — one polling loop for the repo. `wait.For(t, timeout, cond)` is the test form: `cond` returns whether it holds plus a **detail string describing what it just observed**, and a timeout fails with that detail rather than a bare "never ready". `wait.ForTicking(t, timeout, step, tick, cond)` is the simulated-time form: inside a `testing/synctest` bubble `For`'s own sleep already runs on the bubble's clock, but a fake dependency with a clock of its own — a TTL held by `redisfake`, say — does not move with it, so `ForTicking` calls `tick` between checks instead of sleeping, and the caller supplies what moving time means for its fake. `wait.Until(ctx, opts, try)` is the long-running form the soak tools use — same detail string, returned in the error, plus `Report` / `Alive`. A deadline carries the detail whichever way the loop notices it; a **cancelled** wait returns the context's own error instead, because a caller that stopped waiting has not timed out. Two loop shapes deliberately stay hand-written: a **steady-state** loop that asserts an invariant holds for a period, and a **blocking read** loop that waits on I/O rather than polling.
- **`natsfake`** — every test needing NATS takes `natsfake.New(t)`, which starts the **same server version as production** (`nats-server` is pinned in `services/go.mod` to match the deployed image) inside the test process. It runs the real server rather than a stub because the server's own behaviour is what several tests assert — that a durable's delivery policy cannot be updated, that publishing to a schedule subject replaces rather than appends, that purging a subject cancels a schedule. None of that can be checked against a stub without encoding the answer the test is asking for.
- **`redisfake`** — every test needing Redis takes `redisfake.New(t)`; `.Client` for the wired client, `.Server` to manipulate the store. It owns construction and both cleanups, so no test hand-rolls the miniredis dance. `New` listens on loopback TCP, so a client call is real network I/O and a test using it cannot run inside a `testing/synctest` bubble. A test that needs simulated time takes `NewForBubble(t)` instead: it establishes the server, the client and every pooled connection **before** the bubble opens — over `net.Pipe` rather than a socket — because a dial from inside the bubble starts miniredis goroutines outside it, which is fatal, and because go-redis keeps a package-level timer pool that a dial-triggered wait reaches into, which a second bubble in the same process aborts with a synctest channel error if the pool is not already warm. Call it outside the bubble and use `.Client` inside; `.Advance(d)` steps both the bubble's clock and the fake's own store clock together, which a TTL under test needs — sleeping the whole span first would let a renewal loop run several times against a store where no simulated time had passed yet. This constructor is the single place to change if the arrangement needs to.
- **`redisfixture`** — sits beside `redisfake` rather than on it, because binding the service handle (`eipredis.NewRedis(fake.Client)`) belongs to a package that may import `shared/redis`; `shared/redis`'s own tests reach for `redisfake` directly, and `redisfake` importing back would be a cycle. `redisfixture.New(t)` embeds `redisfake.Redis` (so `.Server` and `.Client` still work) and adds `.Handle`, the bound `*eipredis.Redis` most callers actually want.
- **`gosource`** — `ModuleRoot(t)` finds the directory holding `go.mod` above the test, and `EachFile(t, root, visit)` walks every `.go` file under it with a relative, slash-separated path, so a failure message reads the same on any platform. It exists for a test proving something about every file in a module rather than about one package's own types.
- **`model_parity`** — a sweep rather than an assertion: it reports a census over the whole corpus instead of pinning one behaviour, because the faults it looks for are the ones no single document shows. A model that reproduces every document it decodes is the bar; what the stored data still carries beyond that is reported and left to a deliberate cleanup.
- **`serviceboundaries`** — discovers services by reading `services/` rather than listing them, so a new deployable is guarded from the day it exists; `shared`, `cmd` and the empty `services/services` directory are the named exceptions. Test files and build-tagged files count as imports like any other.
- **`sessionhandover`** — exists because each service's session tests only prove that service agrees with itself once sessions stopped being reached by importing one shared package's code; this test proves the services agree with **each other** through `shared/plannersession`.
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
