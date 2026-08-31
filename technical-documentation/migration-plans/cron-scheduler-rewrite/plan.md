# Cron scheduler rewrite — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Why this exists

Core's cron scheduler is the last place in the messaging path that resolves work by hand-written
string. The NATS rebuild removed that seam everywhere else — publishing, task definitions, handler
registration — and in doing so exposed what it costs here: a deferred-run path shipped that could
never have executed, because it looked a handler up by a **task** name while every handler registers
under a **cron** name. Nothing published to it, so nobody found out.

That path is gone. What remains is the scheduler itself, and it wants more than a tidy.

## What a cron job is today

A cron job is three unrelated things that must agree, with nothing checking that they do:

| Piece | Where |
|-------|-------|
| A handler function | registered with `sched.RegisterHandler("cron.industrySystemsRefresh", fn)` |
| A cron expression | a `const cron…Schedule = "*/15 * * * *"` beside it |
| A name tying them together | the same string literal, written twice in the same file |

Ten of these live across four packages under `services/core/scheduler`. No one place says when this
service does things, and a typo in either string produces a job that is registered and never runs, or
scheduled and never found.

## Known problems

- **Handler keys are strings.** `RegisterHandler(name, fn)` has no compile-time link between a name,
  its expression and its function. This is the seam that produced the unrunnable deferred path.
- **Expressions are scattered.** Ten constants across four packages; the schedule of the service is
  not readable in one place.
- **The downtime deferral holds a goroutine and a timer.** `deferTaskPublicationUntilAfterDowntime`
  in `core/scheduler/esi/downtime.go` waits out an EVE downtime window in memory: it survives no
  restart, appears in no listing, and cannot be cancelled. A JetStream schedule now does exactly this
  properly, which makes it the most obvious first caller for one.
- **Two call sites keep a local only to feed that helper.** `systemIndexRefresh.go` and
  `adjustedPricesRefresh.go` hold a `task :=` local solely to pass `task.Name, task.Subject` into the
  deferral. If the helper took a definition, both locals would go.
- **Nothing marks a job as deferrable.** The old ingress had a `Requestable` flag on task definitions;
  it was removed with that path because it had no reader. If a gate is wanted on which jobs may be
  deferred, it belongs on the cron job, not on the task it eventually publishes.

## Phases

Phase 1 is this folder.

### Stage A — A cron job is one declaration

Name, expression and handler declared together, registered from that one declaration, with a test
that every declared job has a handler and every registered handler belongs to a declared job.

### Stage B — One place says when the service acts

The ten expressions move into that declaration set, so the service's schedule can be read, and
changed, in one place.

### Stage C — Downtime deferral becomes a schedule

**This is also what gives the schedule mechanism its first caller.** The NATS rebuild built schedules
and shipped them with no producer; this stage is what makes them real.

#### What the deferral does today

`deferTaskPublicationUntilAfterDowntime` in `core/scheduler/esi/downtime.go`: when a cron fires during
EVE's daily downtime, publication is held until the window ends. It does that with

- a package-level `map[string]time.Time` guarded by a mutex, keyed by task name and subject, recording
  which windows are already deferred so a second cron tick does not queue a duplicate;
- a goroutine per deferral holding a `time.Timer` until two seconds after the window closes, which
  then publishes.

Three consequences, all of them invisible until they matter:

- **A restart loses it.** Core restarting mid-downtime drops every pending publication; the work is
  not re-deferred, it simply never happens until the next tick.
- **Nothing can see it.** A deferred publication exists only as a goroutine. No listing, no metric, no
  log after the initial one.
- **Nothing can cancel it.** A deferral made in error runs anyway.

#### What it becomes

A schedule, keyed by the cron job's name, firing after the downtime window:

```go
natsHandle.ScheduleAt(ctx, jobName, downtimeEnd.Add(2*time.Second), nil)
```

The properties fall out of the mechanism rather than being built:

- **The id is the deduplication.** Scheduling twice under one job name replaces rather than duplicates,
  so the mutex-guarded map of in-flight deferrals is not needed.
- **It survives a restart**, because the server holds it.
- **It can be listed and cancelled** like any other schedule.
- **The runner already exists** — core consumes `scheduled.>` and runs the job the id names, which is
  the same handler the cron would have run.

#### What to decide while doing it

- **Two seconds after the window** is the current fudge. Keep it, or make the margin explicit.
- **The window is computed locally** from `isInEVEDowntime`. A schedule fires from the server's clock,
  so the two must agree on when the window ends; a badly skewed core would defer to the wrong time.
- **The helper's signature.** It takes `taskName, subject` today, and both call sites keep a local
  purely to supply them. Taking the cron job's own name removes both locals and matches what the
  schedule is keyed by.
- **Failure when NATS is down.** The current path defers in memory and would still publish; a schedule
  needs a reachable server. Decide whether a failed deferral publishes immediately or is dropped.

**Done when:** no goroutine holds a deferred publication, a deferral survives a core restart, and
`ListSchedules` shows what is waiting.

### Stage D — Decide what gocron is still for

Deferred runs no longer need it. Whether recurring schedules keep it, or move to the server with the
single-firing property enforced another way, is the design question this project exists to answer —
and the reason it is a rewrite rather than a tidy.

**The constraint that shapes the answer:** only the core primary runs the scheduler, and that is what
stops every replica firing the same cron. Moving a schedule into stream config moves that property out
of our control, which is why the NATS rebuild deliberately left recurring crons alone.

## Wire compatibility

Nothing here changes a message shape. It changes how core decides what to run and when, which is
process-local. A deferred run becomes a schedule on an existing stream, which is additive.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | Done |
| A — one declaration per cron job | Not started |
| B — one place for expressions | Not started |
| C — downtime deferral as a schedule | Not started |
| D — decide gocron's future | Not started |

## Handoff

**Start here:** Stage A. Stages B and C are mechanical once a job is a single declaration; Stage D is
the judgement call and should not be attempted first.
