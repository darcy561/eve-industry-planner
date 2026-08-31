# NATS rebuild — behaviour overlay

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).

While this project is active, this file is the overlay on top of live SoT: where it describes a
surface, it wins for that in-flight work. Where it is silent, live documentation remains the truth.

Each stage fills its section as it lands — what changed, and how that part works afterwards. Empty
sections mean the stage has not landed.

## Current behaviour (before this project)

There is no live SoT topic for NATS. Services open a connection and a JetStream context through
`stackservices` and carry both; publishing and consuming go through free functions in
`services/shared/core/nats`; task identity comes from `services/shared/tasks` but is re-passed as
separate subject and name arguments at each call site. The shape and its problems are described in
[plan.md](./plan.md) § Starting position.

Deferred one-time task runs are requested on `scheduler.schedule` and executed by gocron inside core,
persisted to Redis and restored on boot. No caller publishes such a request.

## Stage A — handle and errors

_Landed._

### The handle

`nats.NATS` holds one connection and the JetStream context bound to it, built by `Open(ctx)` at the
composition root or by `NewNATS(conn, js)` in tests. `Conn()` exposes the connection for core-NATS
subscribe, request and reply work; `JS()` exposes the JetStream context for stream and consumer
management; `Connected()` reports link state and `Ping(ctx)` round-trips to the server; `Close()`
drains and closes.

`stackservices.Clients` carries `NATS *eipnats.NATS` and no longer has a `JetStream` field, so a role
receives one object rather than a pair that has to match. The same collapse happened in every
dependency bag that carried both: `apideps.Deps`, `documentlock.Deps`, the scheduler's
`contract.Dependencies`, the worker's `TaskDependencies`, the changestream `Watcher`, and
`TaskScheduler`.

### Publishing takes the handle

`PublishMessage`, `PublishTask` and `PublishEmpty` take `*NATS` in place of a JetStream context plus
an optional trailing connection. `PublishTask`'s `opts ...any` type switch is gone; a priority
override is now a plain trailing string. Every publish site lost its connection argument.

`documentlock.PublishLockEvent` and `PublishDocLockNotification` take the handle for the same reason.

Stream and consumer management still takes a raw JetStream context — those helpers are Stage B's to
reshape, and their call sites pass `NATS.JS()` until then. `core/scheduler/helpers/receiver.go` is
the one place still holding a `jetstream.JetStream` parameter.

Core-NATS subscribers that were never JetStream users keep taking a `*natslib.Conn` and are handed
`NATS.Conn()`: the health census bus, the websocket command bus, the SDE cache warmer, core metrics
registration, ws-router and capacity-controller.

### Where the package lives

`services/shared/nats`, beside `services/shared/mongo`. Every caller imports it as `eipnats`,
matching `eipmongo`; the previous `natscore` alias is gone. `telemetry/natsprop` stays where it is.

### One retry, one classifier

`Retry(ctx, policy, name, fn)` runs an operation with exponential backoff, and `IsRetryable(err)`
decides whether a failure is worth another attempt. Two policies are declared beside them:
`PublishRetry` (5 attempts, 500ms → 5s) and `AckRetry` (3 attempts, 100ms → 400ms), preserving the
timings each path used before. `ConnectRetry` (5 attempts, 5s) covers boot.

Backoff waits are a `select` on the timer and `ctx.Done()`, so cancellation and shutdown are prompt.
Every retried path — publish, ack, nak, in-progress heartbeat, and connect — goes through this one
function; none of them sleep uncancellably any more.

`IsRetryable` matches with `errors.Is` against the nats and jetstream sentinels, treats `net.Error`
as transient, and keeps a four-entry string backstop for server responses that arrive as plain
messages. Client cancellation is never retryable.

`ErrNotConnected` replaces the message string a disconnected publish used to produce, so callers
match a sentinel rather than prose. `shared/dependency` classifies NATS failures by calling
`IsRetryable` instead of holding its own copy of the error-string list.

### Acknowledgement takes a context

`AcknowledgeMessage`, `NackMessage`, `NackMessageWithDelay` and `InProgressMessage` now take a
`context.Context` as their first argument, and their logs carry the request identity bound to it.
Previously each opened `context.Background()`, so ack-side log lines were unattributable.

### Connect

`Connect(ctx)` and `ConnectJetStream(ctx)` retry under `ConnectRetry` and honour cancellation. The
connection adds `ReconnectOnFlusherError` (a write-side failure now triggers a reconnect) and
`ReconnectErrHandler` (failed reconnect attempts are logged, so a flapping connection is visible).
The JetStream context sets a default API timeout, replacing the fixed per-publish timeout — a caller
whose context already carries a deadline now keeps it.

### Removed

`PublishSchedule`, `SubjectDocUpdateFanout`, `SubjectDocSubscribeFanout`, `SubjectDocSubscribe`,
`SubjectDocUnsubscribe`, `MessageTypeSubscription`, `SubscriptionRequest`, `StatusMessage`,
`ErrorMessage`, and three of the four `TaskName*` labels. `ScheduleRequest` and `MessageTypeSchedule`
remain until Stage E retires the path that decodes them.

### Shared test fixture

`testing/natsfake` starts an in-process NATS server with JetStream enabled and returns the product
handle bound to it, tearing both down with the test. It replaces the embedded-server setup that
`shared/nats` and `websocket/server` each carried their own copy of.

`shared/nats`'s live test moved to an external `nats_test` package, because the fixture imports the
package under test and an in-package test cannot import it back.

A `jetstream.Msg` fake for ack and nak assertions stays in `shared/nats` — one package uses it, so it
is not shared code.

Owed at promote: a `testing/natsfake` row in the shared harness coverage map.

## Stage B — streams and consumers as specs

_Landed._

### Streams are declared, then bound

`StreamSpec` declares a stream this app owns — name, subjects, retention, and which durables belong
on it. `Specs()` lists them, and each has a constructor (`TaskStreamSpec`, `SchedulerStreamSpec`,
`DocUpdateStreamSpec`) so a caller reads the declaration rather than assembling one.

The handle binds them as named fields — `NATS.Tasks`, `NATS.Scheduler`, `NATS.DocUpdate` — the way
`Mongo` binds collections. Binding touches no server; `Stream.Ensure(ctx)` performs the upsert and
caches the result, so repeated calls cost one round trip.

`Stream.Consumer(ctx, cfg)` creates or updates a durable, and `Stream.Reconcile(ctx, keepExact…)`
runs the keep policy the spec carries. Retention and the fan-out crash backstop
(`DocFanoutInactiveThreshold`) are properties of the spec rather than constants scattered across the
services that use them.

### Ownership is stamped, and reconcile acts on it

Streams and consumers this app creates carry `eip.owner` metadata, and consumer reconcile now gates
on it: a durable without the stamp is counted and skipped, never deleted. Deletion is therefore
limited to durables this app made, so a KV or object-store backing consumer, or an operator's own,
is safe on a shared stream.

### Abandoned durables are the server's job

The peer sweep no longer guesses. Previously a durable matching a live prefix but showing no waiting
pulls was deleted as an orphan, which is why the websocket boot path slept five seconds first — long
enough for peers to have pulls outstanding and not be mistaken for dead. Both are gone.

What remains is three layers with no heuristic between them:

| Layer | Covers |
|-------|--------|
| Graceful | A replica deletes its own `doc.update` and `doc.lock` durables on drain and shutdown |
| Reconcile | Deletes owned durables of a naming generation no longer in the keep policy; stamps `InactiveThreshold` on the rest |
| Server | `InactiveThreshold` reaps a durable that stops pulling, which is exactly the crashed-replica case the sweep was guessing at |

The cost is latency: a crashed replica's durable now lingers up to `DocFanoutInactiveThreshold`
(one hour) instead of until the next peer boot. The benefit is that a live replica can no longer be
mistaken for a dead one. If the lingering proves too slow, the threshold is one constant on the spec.

### One consume loop

`Consume(consumer, subject, processor, opts…)` returns a stop function that waits for in-flight
handlers rather than abandoning them. `WithConcurrency(n)` bounds how many run at once — one by
default, which preserves per-consumer ordering. `ConsumeUntil` is the same thing driven by a stop
channel, which is how the websocket and scheduler call sites are shaped.

The worker's own fetch loop is deleted: its batching, semaphore, idle sleep and the missing
in-progress heartbeat are all covered by the shared loop at `WithConcurrency(20)`, the concurrency it
already used. `task_subscriber.go` drops from 242 lines to 140.

### Removed

`EnsureStreams`, `StreamConfig`, the three per-stream ensure wrappers, `GetOrEnsureStream`,
`GetOrCreateConsumer`, the three keep-policy constructors, and the three stream-subject vars. Stream
configuration drift is now the server's `CreateOrUpdateStream` / `CreateOrUpdateConsumer`, and a
`DeliverPolicy` change uses `ResetConsumer` instead of deleting a durable and losing its ack floor.

## Stage C — typed tasks and topics

_Not landed._

## Stage D — call-site cutover

_Not landed._

## Stage E — publish path evaluation

_Not landed._

## Stage F — scheduled messages

_Not landed._
