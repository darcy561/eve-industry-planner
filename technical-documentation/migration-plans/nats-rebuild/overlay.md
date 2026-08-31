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

### Streams are declared, and undeclared ones are removed

`Specs()` is the allowlist. `NATS.ReconcileStreams` deletes streams carrying this app's ownership
stamp that no longer appear in it, so retiring a stream means deleting its spec. Core runs it at boot,
since it owns stream lifecycle. Unstamped streams — KV, object-store backing, an operator's own — are
counted and skipped.

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
`DeliverPolicy` change still deletes and recreates the durable, because the server refuses to update
that field; `ResetConsumer` resets delivery state rather than policy and does not apply.

## Stage C — typed tasks and topics

_Partially landed: typed task definitions, payload relocation, span attributes, and the requestable
flag. Async batch publishing, the asynq handler adapter, and typed topics with request/reply are
still open._

### A task is its payload type

`tasks.Define[T](Definition{…})` binds a task's name, subject, default priority and timeout to the
payload its subject carries. `RefreshRegionMarketOrders.Publish(ctx, nats, req)` will not compile with
the wrong struct, where before any value could be published to any subject and the mismatch surfaced
as a decode failure on the worker.

`Definition` is the non-generic record the registry holds, because the worker resolves priority and
timeout by name at runtime and a generic type cannot key a map. `Task[T]` embeds it, so a caller that
needs the record passes `.Definition` — the operator task CLI, which triggers any task by name with
an operator-supplied payload, is deliberately one of those.

A task carrying no data is `Task[None]`, and publishing `None{}` sends the trigger envelope those
subjects already used, so the wire is unchanged.

### One package

`shared/tasks` is gone. Definitions, payloads and the transport they depend on live in
`services/shared/nats`, because a task exists to be published and neither half was ever used without
the other. Publishing is a method on the handle — `n.Publish`, `n.PublishTask`, `n.PublishEmpty` —
and a task is a typed helper wrapping it, which is also the shape `Mongo` uses.

Two files that were never task definitions moved out instead: the Redis refresh-lock helper to
`shared/core/redis`, and asynq queue weights to `shared/queuescale` — shared because the worker sizes
its queues from them and the capacity controller scales replicas from them, and one service must
never import another.

### Span attributes come from the payload

A payload declares its own attributes by implementing `SpanAttributes()`. This replaces a switch on
task-name strings in the transport package that mapped five unrelated tasks onto one request struct
because they happened to share an `account_id` — correct by coincidence, and wrong for the next task
added to that list.

The asynq-side span no longer adds payload attributes: recovering the concrete type from a name
needed a registry of decoders, which was more machinery than the attributes were worth. The publish
span still carries them.

### Batches publish without waiting on each ack

`NATS.Batching()` returns a handle that publishes asynchronously; `Wait` collects the acks and is
where a failure is reported. The publish helpers are unchanged — a batch is the same handle in a
different mode — so a fan-out loop keeps calling `PublishEncodeJobIdentity` and only its ending
differs.

The four per-account loops use it: the job-identity encode sweep, the archived-jobs and user-accounts
Firestore scans, and the user job documents scan. Each publishes thousands of messages and previously
paid a round trip per message.

Two client defaults are overridden, since both would otherwise bite silently: the async ack timeout
is set (the client leaves it off, so a lost ack would hang a batch forever), and `Close` waits on
`PublishAsyncComplete` before draining, because closing first fails everything in flight.

Retry is deliberately not applied to a batched publish. A retry of a publish whose ack has not been
seen would duplicate the message; a batch reports the failure instead and the caller re-runs the sweep.

### Handlers are registered through their definition

`handle(mux, task, fn)` registers an asynq handler under the name in the task's definition, so the
one place a task name is written as a string is the definition itself. A test builds the mux and
asserts every registered task has a handler: a task published with nothing to run it is accepted by
asynq and then discarded, which is invisible until someone notices the work never happened.

### Topics get the same treatment as tasks

Core NATS — fan-out and request/reply, no persistence, no delivery guarantee — now has a helper pair
per subject, the same shape the tasks took:

| Subject | Helpers |
|---------|---------|
| SDE build changed | `PublishSDEBuildUpdated`, `SubscribeSDEBuildUpdated` |
| Websocket placement load | `PublishPlacementState`, `SubscribePlacementState` |
| Health census | `GatherHealth`, `SubscribeHealthPings` |
| Planned cordon / drain / uncordon | `RequestWSCommand`, `SubscribeWSCommands` |

`GatherHealth` is the one that earned a primitive of its own. The census is a scatter-gather — every
replica answers, and how many answer is the question — so it needs an inbox and a collection window
rather than a request/reply. The capacity controller was building that by hand: its own inbox,
`PublishRequest`, a deadline loop and an envelope decoder. All four now live in one place, and the
controller asks a question instead.

Subscribers receive decoded payloads. A message that will not decode is dropped with a warning inside
the helper, so each of the four call sites lost its own unmarshal-and-return-on-error preamble, and
the websocket placement hook is typed rather than passing a subject and bytes.

No service holds a raw `*nats.Conn` any more. The one remaining `Conn()` is ws-router logging which
server it connected to.

### One list of requestable tasks

`Requestable` was a field on the definition; with the deferred-run ingress gone it had no reader, and
it is removed. The scheduler's `requestableTaskTypes` map of three string literals went with it.

## Files are named for their subject

File names said what shape a thing was rather than what it was about, and pairs distinguished only by
a plural — `task.go` / `tasks.go`, `topic.go` / `topics.go`, `messages.go` / `message_helpers.go` /
`message_loop.go` — carried no meaning at all.

| File | Holds |
|------|-------|
| `store.go` | the handle |
| `connect.go` | connecting, and the JetStream context |
| `publish.go` | publishing, and the producer span |
| `batch.go` | the batching handle |
| `retry.go` | retry and its error classification |
| `envelope.go` | the message envelope and what rides in it |
| `ack.go` | acknowledgement, negative acknowledgement, heartbeat |
| `consume.go` | the consume loop |
| `handler.go` | the handler contract that decides a message's fate |
| `consumer_context.go` | the context, span and outcome log around one message |
| `spec.go` | stream, subject and durable names, and the specs built from them |
| `stream.go` | a bound stream, and stream reconcile |
| `consumer_reconcile.go` | durable ownership and cleanup |
| `consumer_filters.go` | filter subjects on a durable |
| `subjects.go` | building and reading subjects |
| `tasks.go` | task definitions, the registry, and a publish helper each |
| `task_requests.go` | task payloads |
| `topics.go` | core-NATS topics: publish, subscribe, request, reply |
| `schedule.go` | deferred work |

Test files follow the file they test, so `consumer_filters_live_test.go` sits beside
`consumer_filters.go` rather than under a name inherited from a package that no longer exists.

## Stage D — call-site cutover

_Not landed._

## Stage E — publish path evaluation

_Not landed._

## Stage F — scheduled messages

_Not landed._
