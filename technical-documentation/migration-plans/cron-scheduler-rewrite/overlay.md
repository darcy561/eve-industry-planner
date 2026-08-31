# Overlay — how core defers a cron run past EVE downtime

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Live SoT will not be edited until this project is complete and promotion is approved.

Landed in Stage C. Where this overlaps live documentation, this file is the truth until promote.

## What changed

The deferral no longer waits in core's memory. It is a schedule on the schedule stream, keyed by the
cron job's name.

[`core/scheduler/esi/downtime.go`](../../../services/core/scheduler/esi/downtime.go) previously held a
package-level map guarded by a mutex and started one goroutine per deferral, each blocked on a
`time.Timer` until the window closed. Both are gone, along with the `deferred_from_downtime` context
value and `computeRunsPer4Hours`, which no code read.

## How it works now

`DeferPublicationUntilAfterDowntime(ctx, sched, jobName, now)` reports whether it deferred:

- Outside the window it schedules nothing and reports `false`; the caller publishes as normal.
- Inside the window it calls `ScheduleAt(ctx, jobName, downtimeEnd+2s, nil)` and reports `true`.

The schedule delivers on `scheduled.{jobName}`, where `runFiredSchedule` in
[`core/scheduler/handler.go`](../../../services/core/scheduler/handler.go) looks the name up in the
same handler map the cron fires from. The deferred run is therefore the *same handler*, which repeats
the downtime check, finds the window closed, and publishes. No separate deferred-run path exists.

Three properties come from the mechanism rather than from code here:

| Property | Why |
|----------|-----|
| One deferral per job per window | The schedule id is the job name; a second tick in the same window replaces the first schedule rather than queuing another |
| Survives a core restart | The schedule is state on the server, not a goroutine in the process |
| Listable and cancellable | `ListSchedules` / `CancelSchedule` in [`shared/nats/schedule.go`](../../../services/shared/nats/schedule.go) |

`sched` is the small `publicationScheduler` interface (one `ScheduleAt` method) rather than
`*nats.NATS`, so the deferral is testable without a server. `now` is a parameter for the same reason:
the behaviour only exists between 11:00 and 11:15 UTC, and passing the instant is what makes it
coverable at all.

## Decisions taken while doing it

- **The two-second margin stays**, as the named constant `downtimeScheduleMargin`. It keeps a run
  clear of the window's closing edge, which matters because the schedule fires on the *server's*
  clock while the window is computed from core's.
- **A deferral that cannot be scheduled is an error**, not a publication during downtime. The old
  in-memory path would have published eventually; a schedule needs a reachable server. Since the
  publication itself also goes to NATS, a server that cannot take the schedule cannot take the
  publication either, so publishing anyway buys nothing. The handler returns the error and the next
  cron tick retries — every caller of this helper ticks at least hourly.
- **The helper takes the cron job's name**, not a task name and subject. It has to: the name is the
  schedule id, and the id is what the runner resolves back to a handler. This also removed the
  `task :=` local that `systemIndexRefresh.go` and `adjustedPricesRefresh.go` kept only to feed the
  old signature, and it fixed a latent disagreement between call sites — the two ESI jobs passed the
  *task* name while `cloud_stored_esi_refresh.go` passed the *cron* name. Harmless while it was only
  a map key; a job-not-found on the schedule runner once it became the id.

## Callers

| Caller | Cron |
|--------|------|
| [`esi/systemIndexRefresh.go`](../../../services/core/scheduler/esi/systemIndexRefresh.go) | `cron.industrySystemsRefresh` |
| [`esi/adjustedPricesRefresh.go`](../../../services/core/scheduler/esi/adjustedPricesRefresh.go) | `cron.adjustedPricesRefresh` |
| [`maintenance/cloud_stored_esi_refresh.go`](../../../services/core/scheduler/maintenance/cloud_stored_esi_refresh.go) | `cron.cloudStoredEsiRefreshMaintenance` |

`esi/regionMarketOrdersRefresh.go` reads the window through `IsInEVEDowntime` and skips its run
rather than deferring it; `maintenance/cloud_stored_esi_refresh.go` also uses it to cap batch size.
Neither is affected.

## Still open

Nothing can *see* a waiting deferral from the operator side: `ListSchedules` has no caller outside
its live tests, and there is no `eip` verb for it. Inspection today is the `nats` CLI against the
schedule stream.
