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

Replace the in-memory timer with a JetStream schedule keyed by the job's name. Deferred work then
survives a restart and can be listed and cancelled like anything else. The two locals that exist only
to feed the current helper go with it.

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
