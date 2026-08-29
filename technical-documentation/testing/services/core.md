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

**Depth:** Strong for primary election, health/ready, singleton orchestration, changestream resume plumbing. Scheduler job bodies, CLI/commands, and metrics are largely untested.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `leadership` | Dual-replica exactly-one-publisher; bounded takeover on stop |
| `primarycontroller` | Redis required; acquire/stop notifications; dual-replica leader/standby takeover |
| `servicemanager` | Standby ack-ready; leader start failure; lose-primary stops work |
| `health` | Live check; nil deps; standby handoff `/ready` (200/503); election-loop-down fails ready |
| `changestream` | Resume-token round-trip / invalid; collection-group validation; empty-groups stop; cancel sleep; tenant-keyed `doc.update` subject shape helpers |
| `singleton` | Job catalogue validity; doclock subscriber wiring; start/stop; single-leader-per-job; transient recovery |
| `scheduler` | In-flight job cancel when scheduler stops |
| `scheduler/maintenance` | Cron registration for cloud-ESI refresh / inactive cleanup / session prune; microbatch plan math; Mongo user-filter contracts |
| `startup` | `EnsureLiveSDEExists` present/missing |
| `primaryhandoff` | Resume-token Redis key naming |
| `migration/firestoreimport` | Project ID from service-account JSON |

### Thin

- `scheduler/maintenance` — registration/filters/plan tested; job body implementations untested
- `scheduler` — shutdown cancel only; handler/registry/under-primary largely untested
- `changestream` — main watch loop mostly untested beyond empty-groups stop
- `startup` — prepare / refresh-token keys / schema report untested

### Little / none

- App wiring: `main.go`, `app.go`
- Scheduler work: `scheduler/esi/`, `scheduler/sde/`, `scheduler/archivedjobs/`, `scheduler/contract/`, `scheduler/helpers/`
- `commands/` (+ CLI), `metrics/` (+ subpackages), `sdeensure/`

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- Failover property suite is the densest automated gate for core control-plane changes.
