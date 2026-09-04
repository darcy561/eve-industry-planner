# Scheduler (`services/core/scheduler`)

Live SoT for core's recurring jobs: what runs, when, and what fires it. Code:
[`services/core/scheduler`](../../../services/core/scheduler/).

The scheduler runs **only on the core primary**, started and stopped by `primarycontroller` through
`servicemanager` — that is what stops every replica firing the same job. Primary lease →
[core.md](./core.md) § Primary lease.

## A job is one declaration

[`jobs.go`](../../../services/core/scheduler/jobs.go) is the whole schedule. Each row names the job,
its expression, and the function that builds its handler; the registry registers and schedules from
that same row, so a handler cannot exist without a cron and a cron cannot name a handler that was
never built. Nothing else declares a job.

| Job | Runs | What it does |
|-----|------|--------------|
| `cron.drainAccountStatsRebuildQueue` | `*/2 * * * *` | Publishes one dispatch task; the worker reads the rebuild queue and fans out per owner |
| `cron.cloudStoredEsiRefreshMaintenance` | `*/10 * * * *` | Rotates encrypted cloud ESI refresh tokens, batch size sized from the eligible cohort, staggered across the window |
| `cron.regionMarketOrdersRefresh` | `*/15 * * * *` | Publishes every market region whose order book has gone stale, oldest first, when the budget can absorb each |
| `cron.adjustedPricesRefresh` | `20 * * * *` | Triggers the adjusted-prices refresh |
| `cron.industrySystemsRefresh` | `50 * * * *` | Triggers the industry system-index refresh |
| `cron.schemaVersionMaintenance` | `0 * * * *` | Upgrades legacy schema versions in batches, one collection per run |
| `cron.pruneExpiredAccountSessions` | `0 */4 * * *` | Publishes the Redis session prune |
| `cron.checkSDEUpdates` | `0 17 * * *` | Checks for a new Static Data Export |
| `cron.inactiveAccountPlannerCleanup` | `0 8 * * 1` | Publishes planner cleanup for accounts inactive over two years, bookmarked through the user set |

**Expressions are UTC.** The scheduler is created with `gocron.WithLocation(time.UTC)`, so a declared
hour means the same thing wherever core runs.

**A job's name is its id.** The name in the table is the handler key, the cron tag, and the id a
schedule defers under. The builder receives it rather than holding a second copy:

```go
func(deps contract.Dependencies, jobName string) contract.TaskHandler
```

Adding a job is one row plus a builder in the owning package (`esi/`, `maintenance/`, `sde/`,
`archivedjobs/`). Those packages never touch the scheduler; registration is the registry's job.

## What fires a job

Recurring jobs fire in process, on gocron, under the primary lease. Scheduling a name with no
registered handler is an error, so a mismatch fails startup rather than producing a job that never
runs.

A tick is not retried: a failed run waits for the next one. Jobs are sized accordingly — the queue
drain runs every two minutes precisely so a failure costs one interval.

`Stop` shuts gocron down with a 15s bound and **cancels in-flight jobs**, so losing the primary lease
does not leave work running.

## Deferring past EVE downtime

ESI jobs do not publish while CCP's servers are not answering. They call

```go
DeferPublicationUntilAfterDowntime(ctx, natsHandle, jobName, esi)
```

which asks the limiter whether the servers are answering and, if not, schedules the job for its next
probe and reports that it deferred. Callers: `cron.industrySystemsRefresh`,
`cron.adjustedPricesRefresh`, `cron.regionMarketOrdersRefresh`,
`cron.cloudStoredEsiRefreshMaintenance`.

**Downtime is observed, not scheduled.** CCP publish a window, but it is an estimate that runs long
as often as short, so nothing here reads a clock. The limiter concludes an outage from calls failing
across sources and reopens when anything answers — details in [../shared/esi.md](../shared/esi.md)
§ Downtime is observed, never scheduled.

The retry time is the limiter's next probe, which widens while an outage lasts, so a long maintenance
produces fewer deferrals rather than one per cron tick. One schedule id per job, so a later deferral
replaces the earlier one rather than stacking up pending runs.

The schedule delivers on `scheduled.{jobName}`, where the schedule runner resolves the id back to the
same handler map — so the deferred run is the same handler, which finds the servers answering and
publishes. Schedule mechanics → [../shared/nats.md](../shared/nats.md) § Schedules.

## Refreshing only what has gone stale

A public refresh runs when ESI says its data stopped being current, not on a fixed cycle. Each
refresh records `now + max-age` under its dataset, and the scheduler reads that before publishing. A
304 records a freshness too — it is ESI restating how long the answer stays good, and honouring it is
what stops the next tick paying a token to be told the same thing.

Adjusted prices and industry systems each refresh one dataset, so a run inside the window is deferred
to the moment it expires. Region market orders sweep instead: each tick publishes every hub past
`regionSweepInterval` (one hour), oldest first, so a budget too tight for all of them spends on the
oldest. A hub is never walked inside its own max-age, which is what keeps a shorter interval safe to
set.

Nothing spaces the hubs out deliberately, but they separate on their own: the dispatcher walks one
book at a time, so passes finish seconds apart and a hub whose hour elapses just after a tick waits
for the next. Within a few hours each owns a tick of its own.

Affordability is measured, not estimated: a region pagination is costed from the page count the last
pass recorded, and `CanAfford` is asked of the bucket the run will actually spend from.

The cron schedule is the backstop — it fires when nothing has recorded a freshness, and recovers the
cycle if a deferral is lost.

## Reading what is waiting

A deferred run is a schedule on the schedule stream, so it survives a core restart and can be listed
or cancelled. There is no `eip` verb for it: inspection is the `nats` CLI against `schedule-stream`.
