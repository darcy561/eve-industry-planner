# core — tests

Live SoT for test depth under [`services/core`](../../../services/core). Behaviour → [core.md](../../backend/core/core.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Service tree | From `services/`: `go test ./core/...` | No Docker |
| Leadership / primary | `go test ./core/leadership/ ./core/primarycontroller/ ./core/servicemanager/` | Common failover slice |

```bash
go test ./core/...
```

## Coverage map

**Depth:** Strong for primary election, health/ready, singleton orchestration, changestream resume plumbing. Scheduler job bodies and CLI/commands are largely untested; of the metric groups only the ESI bucket gauge is covered.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `leadership` | Dual-replica exactly-one-publisher; bounded takeover on stop |
| `primarycontroller` | Redis required; acquire/stop notifications; dual-replica leader/standby takeover |
| `servicemanager` | Standby ack-ready; leader start failure; lose-primary stops work |
| `health` | Live check; nil deps; standby handoff `/ready` (200/503); election-loop-down fails ready |
| `changestream` | Resume-token round-trip / invalid; collection-group validation; empty-groups stop; cancel sleep; tenant-keyed `doc.update` subject shape helpers |
| `singleton` | Job catalogue validity; doclock subscriber wiring; auth-session-maintenance `RunLoop` running a pass before the first tick and stopping on cancel; start/stop; single-leader-per-job; transient recovery |
| `scheduler` | In-flight job cancel when scheduler stops |
| `scheduler/maintenance` | Cron registration for cloud-ESI refresh / inactive cleanup; microbatch plan math; Mongo user-filter contracts |
| `startup` | `EnsureLiveSDEExists` present/missing |
| `primaryhandoff` | Resume-token Redis key naming |
| `metrics/esi` | Bucket rows read from live state; the gauge callback emits no spans while collecting |

### Thin

- `scheduler/maintenance` — registration/filters/plan tested; job body implementations untested
- `scheduler` — shutdown cancel only; handler/registry/under-primary largely untested
- `changestream` — main watch loop mostly untested beyond empty-groups stop
- `startup` — prepare / refresh-token keys / schema report untested
- `commands` — `seedMarketLocationLane` and `moveMarketsToTheirOwnLane` each have a live-Mongo, opt-in test (`EIP_MONGO_PARITY_LIVE=1`) asserting the stored BSON rather than the decoder, since a nil slice and an empty one decode alike; no unit test exercises either without a live database

### Little / none

- App wiring: `main.go`, `app.go`
- Scheduler work: `scheduler/esi/`, `scheduler/sde/`, `scheduler/archivedjobs/`, `scheduler/contract/`, `scheduler/helpers/`
- `commands/` (+ CLI) otherwise, `metrics/` (+ subpackages), `sdeensure/`

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- Failover property suite is the densest automated gate for core control-plane changes.
- The orphan refresh-token sweep itself is `shared/plannersession/maintenance`, not a `core` package — its tests live with it, see [shared.md](./shared.md). `singleton` here only covers the lease/loop wiring that runs it hourly.
