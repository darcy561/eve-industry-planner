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
| `commands/release_custom_structures*` | `foldCustomStructures` folding the four keyed lists into one array, in unit form and — as stored BSON rather than through the decoder, since the decoder folds either shape — against real Mongo (`EIP_MONGO_PARITY_LIVE=1`); its place in the release relative to the planner backfill; both settings collections covered; dry run writing nothing, a second run finding nothing to do |
| `commands/release_structure_rig_slots*` | `foldStructureRigSlots` converting a saved structure's combined rig id into two slots, against real Mongo; a structure already holding slots skipped; a stale `rigType` beside slots dropped; a document still holding the four keyed lists left untouched, checked three independent ways (query filter, type assertion, `bson.M` decode) |
| `commands/release_rig_slots*` | `foldRigSlots` converting a stored setup's combined rig id into two slots across `job_documents`, `jobs`, `archived_jobs` and `group_template_payloads`, against real Mongo; a setup already holding a slot skipped; the combined-id table proven against the per-axis rule the SPA reads slots back with |

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
- The three custom-structure prerelease steps run in a fixed order — the lane fold, then the structure rig fold, then the setup rig fold — and `prepare_release_test.go` covers that ordering as well as each step's own place in the release.
