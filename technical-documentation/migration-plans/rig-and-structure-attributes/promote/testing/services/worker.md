# worker — tests

Live SoT for test depth under [`services/worker`](../../../services/worker). Behaviour → [worker.md](../../backend/worker/worker.md), [market-orders.md](../../backend/worker/market-orders.md), [system-indexes.md](../../backend/worker/system-indexes.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Service tree | From `services/`: `go test ./worker/...` | No Docker; live Mongo tests skip unless gated |
| ESI tasks | `go test ./worker/tasks/esi/` | Market / indexes / grants |
| SDE update | `go test ./worker/tasks/sde/...` | Update + conversion + publish |
| Worker end to end | `go test ./worker/` | In-process NATS + Redis; no Docker |
| Live Mongo, cloud ESI (opt-in) | `bash scripts/testing/live-mongo.sh ./worker/tasks/maintenance` | Runs in a container on the stack network — [harness.md](../harness.md) § Live Mongo |

```bash
go test ./worker/...
```

## Coverage map

**Depth:** Strong on ESI refresh tasks, market order pricing end to end, SDE update/conversion, and
rate limiter. Asynq wiring, migration tasks, SDE rollback, and the remaining maintenance **execution**
are thin or missing.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `tasks/esi` — system indexes | Stream industry systems (304, gzip, JSON errors, retry, rate-limit); task paths (lock, ETag, not-modified) |
| `tasks/esi` — region market orders, the walk | `TestRegionMarketOrdersWalksEveryPage`; 304 page replay from object storage (`TestRegionMarketOrdersReplaysFromStorageWhenPagesAreUnchanged`, and the two `A304With…` cases covering no page store and a page that turns out not to be held); a missing page count treated as one page; a walk with no page store still delivers every order |
| `tasks/esi` — region market orders, percentile maths | Payload validation; sample floor, nearest rank, outlier trimming, empty sides |
| `tasks/esi` — region market orders, per-station derivation | One walk prices every tracked station (`TestOneWalkPricesEveryTrackedStation`); a second station in an already-tracked region costs no ESI call; a walk prices nothing until a station is tracked; a shrunk region stops being priced from; a region with no page store prices from what it streams |
| `tasks/esi` — market source registration and retirement | A registered market is put in the sweep; an unresolvable market is skipped rather than failing the pass; signing in again with nothing new asks for no work; a market nobody asks about for fourteen days is retired without taking a region another market still needs; the four hubs are never retired; a market asked for mid-sweep is kept; a region's orphaned pages are swept by age; a market asked for after retirement is priced from the pages left behind rather than walked again |
| `tasks/esi` — market lifecycle | `TestASavedMarketIsRegisteredWalkedPricedAndRetired` runs the whole path over in-process fakes, from the `MarketSourcesRequest` the API publishes on a settings save through registration, the walk, the derive, and a read back, to retirement — proving the steps join up: what registration leaves behind is what the walk looks for, what the walk stores is what the derive prices from, and the derive keys prices where retrieval reads them. Alongside it: registering a market already priced asks for nothing, and a market coming back is priced without walking again |
| `tasks/esi` — adjusted prices | Stream + task paths |
| `tasks/esi` — session grants | JSON/token validation; ESI errors; corp dedupe; Redis storage through `shared/plannersession` |
| `tasks/esi` — helpers | Retry / ESI verb helpers |
| `tasks/sde/update` | checkUpdates orchestration (nil task, version error, no-update skip, diff+prune); persist-stage labels; integration workflow (build latest SDE, version files, recipe-list types) |
| `tasks/sde/update/conversion` | Full conversion vs published reference; reaction blueprint merge; invention modifier rows/exclusions; blueprint published-formula preference |
| `tasks/sde/publish` | S3 publish order (live then archive) |
| `tasks/archivedjobs` | Build-stat snapshot math, zero-qty error, document ID |
| `asynq` | Timeout from the task's definition and its clamp; concurrency default and cap (50); the request decoded at the mux and refused terminally when absent, null or malformed; terminal errors translated to the queue's sentinel while ordinary errors still retry; handlers checked against the registry in both directions; what `Enqueue` puts on the queue, against a real Redis |
| `worker` (app) | The stop sequence, and that intake starts last so it stops first; a published task reaching its handler end to end over an embedded JetStream and Redis, for a trigger and for a request; an unregistered subject reaching no handler; an undecodable request archived rather than retried |
| `taskrun` | A run is unreadable outside a task and readable through the mux's context wrapping; final-attempt arithmetic |
| `tasks/archivedjobs` — terminal paths | Requests that cannot be served are terminal across all three owner tasks, and a servable owner is not |
| `esi` | Past ESI compatibility-date integration check |
| `tasks/esi` — militia systems | Which faction holds each system is stored from ESI's own shape; a not-modified pass keeps what is held and does not restamp the dataset; a war holding nothing stores nothing |
| `tasks/maintenance` — cloud ESI (live Mongo, opt-in) | The maintenance pass itself: a row with no material is skipped and left standing, a row with no character hash does not break the pass, a refused grant removes its row, two consecutive failures remove a row on the second pass, and a recovered row stores new material with its failure count cleared |

### Thin

| Area | Gap |
|------|-----|
| `tasks/maintenance` | Payload validation, plus the cloud-ESI maintain pass under the live gate — not schema batch execution |
| `tasks/esi` region market orders | A pagination or 304 pass through `RefreshRegionMarketOrders` itself, as opposed to `FetchRegionMarketOrders` beneath it — the lifecycle pass exercises a single page |
| `tasks/sde/publish` | Single ordering test |
| `tasks/sde/update/conversion` | Output writers / index stages largely untested |
| `tasks/archivedjobs` | Snapshot math only — not `process_build_stats` processor |

### Little / none

- `tasks/sde/rollback/`
- Many `tasks/sde/update` stages (download, mapBuild, mongoBlueprints, applyVersion, …) except via checkUpdates/integration

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- When changing a task family, run that package tree (`./worker/tasks/esi/`, `./worker/tasks/sde/...`) before the full `./worker/...` suite.
- Planner session upkeep is not the worker's: the orphan refresh-token sweep runs on a `core` singleton lease — see [core.md](./core.md) and [shared.md](./shared.md).
- The ESI rate limiter is not the worker's: the buckets, the allowance learned from headers and the slot ledger live in `services/shared/esiclient` — see [shared.md](./shared.md).
- The market lifecycle test is what an object-store-backed test needed a `MemoryBackend` to run at all — package tests under `services/shared/core/objectstore` skip without a live store; see [shared.md](./shared.md).
