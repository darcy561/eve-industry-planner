# worker — tests

Live SoT for test depth under [`services/worker`](../../../services/worker). Behaviour → [worker.md](../../backend/worker/worker.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Service tree | From `services/`: `go test ./worker/...` | No Docker |
| ESI tasks | `go test ./worker/tasks/esi/` | Market / indexes / grants |
| SDE update | `go test ./worker/tasks/sde/...` | Update + conversion + publish |
| Rate limiter | `go test ./worker/ratelimiter/` | Bucket / ESI client Do |
| Worker end to end | `go test ./worker/` | In-process NATS + Redis; no Docker |

```bash
go test ./worker/...
```

## Coverage map

**Depth:** Strong on ESI refresh tasks, SDE update/conversion, and rate limiter. Asynq wiring, migration tasks, SDE rollback, and most maintenance **execution** are thin or missing.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `ratelimiter` | Token bucket / flood exhaustion & recovery; concurrent stress; cleanup goroutine; ESI client Do/429; group naming & token parsing; error typing |
| `tasks/esi` — system indexes | Stream industry systems (304, gzip, JSON errors, retry, rate-limit); task paths (lock, ETag, not-modified) |
| `tasks/esi` — region market orders | Payload validation; percentile maths (sample floor, nearest rank, outlier trimming, empty book sides) |
| `tasks/esi` — adjusted prices | Stream + task paths |
| `tasks/esi` — session grants | JSON/token validation; ESI errors; corp dedupe; Redis storage |
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

### Thin

| Area | Gap |
|------|-----|
| `tasks/maintenance` | Payload validation only — not cloud-ESI maintain / prune sessions / schema batch execution |
| `tasks/esi` region market orders | Percentile maths and payload validation only — not the pagination pass, 304 page replay, or station filtering |
| `tasks/sde/publish` | Single ordering test |
| `tasks/sde/update/conversion` | Output writers / index stages largely untested |
| `tasks/archivedjobs` | Snapshot math only — not `process_build_stats` processor |

### Little / none

- `tasks/migration/` (Firestore→Mongo imports, encrypt tokens, cloud-account migration, …)
- `tasks/sde/rollback/`
- Many `tasks/sde/update` stages (download, mapBuild, mongoBlueprints, applyVersion, …) except via checkUpdates/integration

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- When changing a task family, run that package tree (`./worker/tasks/esi/`, `./worker/tasks/sde/...`) before the full `./worker/...` suite.
