# Messaging (`services/shared/nats`)

Live SoT for the shared NATS handle used by api, core, worker, websocket, ws-router and
capacity-controller. Package: [`services/shared/nats`](../../../services/shared/nats).

Stack image / data fragment → [stack contents](../../stack/contents.md). API handler wiring →
[deps.md](../api/deps.md). Worker task bag → [worker.md](../worker/worker.md).

## Defaults

| Piece | Default | Change |
|-------|---------|--------|
| Client | `github.com/nats-io/nats.go` | `services/go.mod` |
| Server | `nats:2.14.6` — pinned, not floating | `docker-stack.data.yml` |
| Connect | `Open` — 5 attempts, 5s apart, cancellable | `services/shared/nats/connect.go` |
| Reconnect | unlimited, 2s apart, also on a write-side failure | same |
| JetStream API timeout | 5s, when a caller's context carries no deadline | same |
| Publish retry | 5 attempts, 500ms → 5s | `services/shared/nats/retry.go` |
| Acknowledgement retry | 3 attempts, 100ms → 400ms | same |
| Async ack timeout | 30s | `services/shared/nats/batch.go` |

Nothing is gated on a server version. The image is pinned to an exact release and the client is kept
on the matching one, so a feature is either available or the pin changes.

## Wiring

```text
stackservices.Connect* ──► Clients.NATS (*eipnats.NATS)
                              │
         ┌────────────────────┼────────────────────┬────────────────────┐
         ▼                    ▼                    ▼                    ▼
   apideps.Deps        TaskDependencies    contract.Dependencies   Server.Stack
   (API handlers)      (worker tasks)      (core schedulers)       (websocket)
         │                    │                    │
         ▼                    ▼                    ▼
   Publish helpers / Stream fields / Consume
```

The composition root opens NATS through `stackservices`. Every role receives the handle; none holds a
`jetstream.JetStream` or a `*nats.Conn` of its own.

## Handle surface

Type **`NATS`**: one connection, the JetStream context bound to it, and the streams this app owns as
named fields.

| Field or method | Role |
|-----------------|------|
| `Tasks` / `DocUpdate` / `Schedules` | the streams, bound from their specs; binding touches no server |
| `Publish` / `PublishTask` / `PublishEmpty` | the publish primitives the task helpers wrap |
| `Batching()` / `Wait` | publish many without waiting on each ack; `Wait` reports what failed |
| `Conn()` | the raw connection, for core-NATS work the handle does not cover |
| `JS()` | the raw JetStream context, for stream and consumer helpers |
| `Connected()` / `Ping(ctx)` | link state, and a round trip that does not trust it |
| `Close()` | waits for in-flight async publishes, then drains |

## Two kinds of messaging

Both run over the same connection, and which one a subject uses decides what happens when nobody is
listening. This is the first thing to establish when a message did not arrive.

| | Core NATS | JetStream |
|---|---|---|
| Persistence | none | messages are stored on a stream |
| If no one is listening | the message is gone | it waits, and is delivered later |
| Delivery | at most once, no acknowledgement | at least once, explicitly acknowledged |
| Redelivery on failure | never | yes, with backoff, up to the consumer's limit |
| Used for | state that is only true now, and request/reply | work that must happen, and updates a client must not miss |

## JetStream streams

| Stream | Subjects | Retention | Consumed by |
|--------|----------|-----------|-------------|
| `worker-task-stream` | `task.>` | 24h | worker, one shared durable `task-worker` |
| `doc-update-stream` | `doc.update.>`, `doc.lock.>` | 1h | websocket, one durable per replica: `doc-live-updates-{id}`, `doc-lock-{id}` |
| `schedule-stream` | `schedule.>`, `scheduled.>` | unlimited | core, one durable `schedule-runner` |

Retention is chosen for what the stream carries. Tasks keep a day so a worker outage does not lose
work. Document updates keep an hour because delivery is live — a replica absent that long has no
clients waiting. A schedule is state rather than traffic, so it is kept until it fires or is cancelled.

Durables differ in where they start, which matters after a restart:

| Durable | Starts from | Why |
|---------|-------------|-----|
| `task-worker` | last message | a restarting worker should not replay a day of tasks |
| `doc-live-updates-{id}` | new messages only | a replica serves the clients it has now |
| `doc-lock-{id}` | last message | a replica needs the current lock state, not just the next change |
| `schedule-runner` | all messages | a schedule that fired while core was down must still run |

A stream is declared once — name, subjects, retention, and which durables belong on it — in `spec.go`,
and bound to the handle as a named field. `Ensure` performs the upsert and caches it; `Consumer`
creates or updates a durable; `Reconcile` removes durables that should not be there.

**`Subscribe` is how a consumer starts.** It ensures the stream, creates or updates the durable, and
starts the loop, so a call site is a consumer config, a handler, and one call. `Reconcile` is
deliberately not part of it: a service owning more than one durable on a stream — the websocket owns
two on `doc-update-stream` — reconciles once for the whole set after both exist, because reconciling
for one durable at a time would delete the others.

**`Specs()` is the allowlist.** `ReconcileStreams` deletes streams carrying this app's ownership stamp
that no longer appear in it, so retiring a stream means deleting its spec. Core runs it at boot.
Unstamped streams — KV, object-store backing, an operator's own — are never candidates.

**`DeliverPolicy` is immutable.** The server rejects an update to it, so a change recreates the
durable. Everything else updates in place.

## Core-NATS topics

Nothing here is stored. A subscriber that is not listening has missed it, which is the point: these
say what is true now.

| Subject | Shape | Published by | Received by |
|---------|-------|--------------|-------------|
| `core.metrics.sde.build.updated` | fan-out | worker, after an SDE build changes | core (metrics gauge), api (static-data cache) |
| `ws.placement.state` | fan-out | each websocket replica, as its load changes | ws-router, to place new clients |
| `health.command.ping` | request, many replies | capacity controller | every replica of every role |
| `ws.command.cordon` / `.drain` / `.uncordon` | request, one reply | capacity controller | the websocket replica named in the request |

Each has a helper pair — `PublishSDEBuildUpdated` / `SubscribeSDEBuildUpdated` and so on — so no call
site writes a subject. Subscribers receive a decoded payload; a message that will not decode is
dropped with a warning rather than reaching a handler.

**The health census is a scatter-gather, not a request/reply.** Every replica answers, and how many
answer is the question being asked, so `GatherHealth` opens an inbox and collects for a fixed window
rather than waiting for one response. A replica that does not answer is simply absent from the result.

## Publishing

Three ways, and the difference is what happens before the call returns.

| | Waits for the server | Retried | Failure surfaces |
|---|---|---|---|
| **JetStream, synchronous** — the default | yes, for the storage acknowledgement | 5 attempts, 500ms → 5s | at the call |
| **JetStream, batched** — `Batching()` | no | no | at `Wait` |
| **Core NATS** — topic helpers | no, there is nothing to wait for | no | only a connection error |

**A task is published by name, never by subject.** Each task has one helper taking the fields that
task needs:

```go
eipnats.PublishRefreshRegionMarketOrders(ctx, natsHandle, regionID, stationID)
eipnats.TriggerCheckSDEUpdates(ctx, natsHandle)
```

A zero value means the worker's default, exactly as an omitted JSON field does. A task's queue and
deadline come from its definition in `tasks.go`; there is no per-publish override.

**A loop that publishes many** takes a batching handle. The helpers are the same; only the ending
differs:

```go
batch := natsHandle.Batching()
for _, id := range accounts {
    if err := eipnats.PublishEncodeJobIdentity(ctx, batch, id, collection, dryRun); err != nil { … }
}
if err := batch.Wait(ctx); err != nil { … }   // where a publish failure is reported
```

Until `Wait` returns, nothing in that batch is known to have been stored. A batched publish is
deliberately not retried: retrying one whose acknowledgement has not been seen would store it twice.
`Close` waits for outstanding acknowledgements before draining, so a shutdown does not discard them.

## Consuming

**JetStream** is consumed by a durable pull consumer through one loop. `Consume` returns a stop that
waits for in-flight handlers rather than abandoning them, and `WithConcurrency(n)` bounds how many
messages are handled at once — the worker uses 20, everything else handles one at a time, which is
what preserves order per consumer. `WithStopChannel(ch)` drives that stop from a channel instead, for
a service whose shutdown is already shaped as one.

`Handle(tracer, span, handler)` wraps a handler so a consumer does not open its own context, log its
own outcome, or acknowledge for itself. What the handler returns decides the message:

| Return | Message |
|--------|---------|
| `nil` | acknowledged |
| `Terminate(…)` | acknowledged, never redelivered — it will not succeed on a retry |
| any error | negatively acknowledged, redelivered with backoff |

Two consumers do not use that wrapper, and both are on the websocket fan-out path. Document updates
are acknowledged by the shard worker that delivers them, not where they are received, so the message
outlives the consumer callback. Lock notifications report their own delivery outcome — recipients,
suppression, an idle replica — which the generic outcome cannot express.

**Core NATS** is consumed by a subscription callback. There is no acknowledgement, no redelivery and
no backlog: a handler either runs as the message arrives or the message is gone. Subscribing returns
a stop function; a service holds it for the life of the process.

## Durable cleanup

Per-replica fan-out durables are removed in three layers, with no guesswork between them:

| Layer | Covers |
|-------|--------|
| Graceful | a replica deletes its own durables on drain and shutdown |
| Reconcile | deletes owned durables of a naming generation no longer in the keep policy |
| Server | `InactiveThreshold` (1h) reaps a durable that stops pulling — the crashed-replica case |

Only durables carrying the ownership stamp are ever deleted. A crashed replica's durable lingers up
to the threshold rather than being detected by a peer, which is the trade that makes it impossible to
delete a live replica's durable by mistake.

## Schedules

A schedule is a message the server holds until a time you name. It lives on `schedule.{id}` and delivers on
`scheduled.{id}`; the **id is its identity**, so scheduling again under the same id replaces it and
cancelling takes the same id.

| Operation | Call |
|-----------|------|
| Create or replace | `ScheduleAt(ctx, id, at, payload)` |
| Cancel | `CancelSchedule(ctx, id)` — absent is not an error |
| Inspect | `LookupSchedule(ctx, id)` — reports the server's fire time |
| List | `ListSchedules(ctx)` |

Core consumes `scheduled.>` and runs the cron job the id names, through the same registry the crons
use. Recurring crons are not schedules: they run on gocron under the core primary lease, because that
is what stops every replica firing them.

**Nothing schedules work today.** The stream, the `schedule-runner` durable and the consumer are all
live, and no caller creates a schedule — so an empty stream and an idle durable are the expected
state here, not a symptom. The first caller will be the ESI downtime deferral, which currently holds
its wait on an in-memory timer.

## Errors and retry

- `Retry` is context-aware; backoff waits end on cancellation rather than sleeping through it.
- `IsRetryable` matches sentinels with `errors.Is` and network failures with `errors.AsType`, keeping
  a short message fallback for server responses that arrive as plain text. `shared/dependency` calls
  it rather than keeping its own list.
- `ErrNotConnected` reports a disconnected connection at the moment an operation needed it.
- Acknowledgement keeps its context's values but not its cancellation: an ack is owed to the server
  whatever became of the work that produced it.
- A batched publish is not retried — retrying one whose ack has not been seen would duplicate it.

## Readiness

api, core, worker, websocket and capacity-controller report NATS in their ready checks through
`Connected()`. `Ping(ctx)` round-trips to the server for a check that does not trust link state.

## Topic-only detail

- Import alias `eipnats`.
- A new task is a definition plus one publish helper in `tasks.go`, its payload in `task_requests.go`,
  and a handler registered through the definition in `worker/asynq`. Tests fail if any of the three is
  missing.
- Files are named for their subject: `publish.go`, `consume.go`, `ack.go`, `subjects.go`,
  `consumer_reconcile.go`. There is no `nats.go`.
