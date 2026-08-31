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

_Not landed._

## Stage C — typed tasks and topics

_Not landed._

## Stage D — call-site cutover

_Not landed._

## Stage E — publish path evaluation

_Not landed._

## Stage F — scheduled messages

_Not landed._
