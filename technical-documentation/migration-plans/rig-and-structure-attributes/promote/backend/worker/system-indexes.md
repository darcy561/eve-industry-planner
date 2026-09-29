# System indexes and factional warfare (`services/worker/tasks/esi/`)

Live SoT for how this server keeps a solar system's industry cost indices current, and which faction
holds a system in factional warfare. Package: [`services/worker/tasks/esi`](../../../services/worker/tasks/esi).
Redis keyspace → [shared/redis.md](../shared/redis.md) § What Redis holds.

## Two datasets, refreshed on their own schedule

`RefreshSystemIndexes` (`refreshSystemIndexes.go`) walks ESI's `/industry/systems/` and stores each
system's cost indices — manufacturing, research time, research material, copying, invention, reaction —
flattened onto one row per system, keyed by solar system id. `RefreshMilitiaSystems`
(`refreshMilitiaSystems.go`) walks `/fw/systems/` and stores which faction, if any, holds each system in
factional warfare.

Both follow the same shape: acquire the dataset's refresh lock so only one refresh runs at a time,
stream the response with the previous ETag, skip the write entirely on a 304, and otherwise store every
row and record a new ETag, a last-updated time, and when ESI says the dataset goes stale next. Both are
scheduled independently — `cron.industrySystemsRefresh` at five minutes to the hour,
`cron.militiaSystemsRefresh` five minutes past it — each publishing its own trigger
(`TriggerRefreshSystemIndexes`, `TriggerRefreshMilitiaSystems`) that the worker's asynq mux hands to its
own handler. Neither cron publishes until the dataset is actually stale, and neither publishes during a
downtime window ESI itself is reporting.

## The two datasets are merged where they are read

`SystemIndexesHandler` (`services/api/v1endpoints/systemIndex.go`), behind `POST
/api/v1/systemindexes/query`, answers a batch of system ids with each one's stored cost indices. For
every id it also reads `DatasetMilitiaSystems` and merges the faction holding that system, if any, onto
the same row as `militiaFactionID` — a client asking for a system's cost index gets its factional
warfare ownership in the same response, with no second request and no second dataset for a caller to
know about. A system neither dataset has a row for still answers, with every figure at its zero value.

## Where every file lives

| Path | Holds |
|------|-------|
| `services/worker/tasks/esi/refreshSystemIndexes.go` | `RefreshSystemIndexes`, `streamIndustrySystems`, `flattenCostIndices` |
| `services/worker/tasks/esi/refreshMilitiaSystems.go` | `RefreshMilitiaSystems`, `streamMilitiaSystems` |
| `services/shared/core/esi/types/types.go` | `SystemIndexes` (carries `MilitiaFactionID`), `MilitiaSystem` |
| `services/shared/redis/dataset.go` | `DatasetIndustrySystems`, `DatasetMilitiaSystems` |
| `services/shared/nats/tasks.go` | `RefreshSystemIndexes`, `RefreshMilitiaSystems` task definitions and triggers |
| `services/worker/asynq/handlers.go` | Wiring each trigger to its handler |
| `services/core/scheduler/esi/systemIndexRefresh.go` | `IndustrySystemsRefresh`, `MilitiaSystemsRefresh` cron handlers |
| `services/core/scheduler/jobs.go` | The two cron entries |
| `services/api/v1endpoints/systemIndex.go` | `SystemIndexesHandler`, the militia merge |

## Topic-only detail

What the SPA does with a system's cost index and factional warfare flag once fetched — including which
militia a setup is costed against, and the install-cost discount a held and upgraded system gives —
is [frontend/industry-facilities/constraints.md](../../frontend/industry-facilities/constraints.md).
Redis dataset lifetimes and the refresh-lock pattern → [shared/redis.md](../shared/redis.md).
