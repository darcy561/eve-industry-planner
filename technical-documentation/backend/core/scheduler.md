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
| `cron.regionMarketOrdersRefresh` | `*/15 * * * *` | Publishes one market region per run, cycling, when the ESI token budget can absorb it |
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

ESI jobs that fire inside the daily maintenance window (11:00–11:15 UTC) do not publish. They call

```go
DeferPublicationUntilAfterDowntime(ctx, natsHandle, jobName, time.Now())
```

which schedules the job to run two seconds after the window closes and reports that it deferred.
Callers: `cron.industrySystemsRefresh`, `cron.adjustedPricesRefresh`,
`cron.cloudStoredEsiRefreshMaintenance`. `cron.regionMarketOrdersRefresh` skips its run instead, and
the cloud-ESI job also uses the window to cap its batch size.

The schedule delivers on `scheduled.{jobName}`, where the schedule runner resolves the id back to the
same handler map — so the deferred run is the same handler, which finds the window closed and
publishes. Schedule mechanics → [../shared/nats.md](../shared/nats.md) § Schedules.

Because the id is the job name, a second tick in the same window replaces the schedule rather than
queuing another. A deferral that cannot be scheduled returns an error instead of publishing during
downtime; the next tick retries it.

## Reading what is waiting

A deferred run is a schedule on the schedule stream, so it survives a core restart and can be listed
or cancelled. There is no `eip` verb for it: inspection is the `nats` CLI against `schedule-stream`.
