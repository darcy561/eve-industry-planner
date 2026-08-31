# NATS rebuild — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

Give the shared NATS layer the same shape the Mongo layer received: one handle, names as a single
source of truth, one retry with one error classifier, and composite work owned by the package rather
than assembled at call sites. Message payloads become typed through generics so a subject and its
payload cannot drift apart.

The measure of success is that a service publishes or consumes a message without touching
`jetstream.JetStream`, a `*nats.Conn`, a subject string, or an ack call.

## Starting position

`services/shared/core/nats` is ~2,400 lines across 19 files. `go fix -diff` on it is clean, so there
is no language-modernisation debt in the package itself — the problems are structural.

### No handle

Everything is a free function taking `(ctx, js, subject, …)` with a `*natslib.Conn` threaded
alongside. `stackservices.Clients` carries `NATS` and `JetStream` as two fields and both travel
together through schedulers, watchers, dependency bags and endpoints. `PublishTask` accepts
`opts ...any` and recovers a connection and a priority from a type switch.

### Envelopes are stringly typed and doubled

`Message{Type,Data}` wraps `TaskMessage{TaskType,Data,Priority,TimeoutSeconds}` wraps the payload.
Type checking is an optional `MessageType() string` interface consulted at decode time. The worker
unmarshals the same bytes three times: once in the subscriber, once in `asynq.Enqueue`, once more
for span attributes.

### The task definition is forked four ways

`shared/tasks.Task` is the intended source of truth, but publish sites re-pass `task.Subject` and
`task.Name` as separate arguments; `publish_task_span.go` switches on hardcoded task-name strings and
maps five unrelated tasks onto one request struct because they share an `account_id`; the scheduler
keeps `requestableTaskTypes` as literal strings; and `constants.go` holds a fourth copy as
human-readable `TaskName*` labels.

### Payload structs live in the transport package

`messages.go` is 370 lines, most of it worker task request structs. Transport owns domain payloads it
has no business knowing, which is also why `doc_update_subject.go` hand-copies the
`account:` tenant prefix rather than importing `wsplacement`.

### Three retry implementations, all matching on strings

The publish retry list is duplicated verbatim in `shared/dependency`'s `isNetworkMessage`. Ack, nack
and in-progress each carry their own three-attempt 100/200/400ms loop. All of them `time.Sleep` and
open with `context.Background()`, so they block uncancellably and drop request identity from their
logs.

### Two consume loops

`StartMessageProcessingLoop` uses `Consume` and carries a comment explaining why fetch-in-a-loop is
wrong; the worker subscriber is a hand-rolled fetch loop with its own batching, semaphore and idle
sleep, and no in-progress heartbeat.

### Stream and consumer setup is copy-paste

Three ensure functions differ only in a literal `MaxAge`. `GetOrEnsureStream` takes the ensure
*function* alongside the name that implies it. Both websocket subscriptions ensure the doc-update
stream twice.

### Consumer boilerplate is repeated per call site

Four near-identical processors each unmarshal an envelope, begin a consumer context, decode, and
choose between finish-and-ack and finish-and-nack.

### Dead surface

Zero callers: `SubjectDocUpdateFanout`, `SubjectDocSubscribeFanout`, `SubjectDocSubscribe`,
`SubjectDocUnsubscribe`, `MessageTypeSubscription`, `SubscriptionRequest`, `StatusMessage`,
`ErrorMessage`, `PublishSchedule`, and three of four `TaskName*` labels.

## What the client already does for us

Client and server are both pinned at the current release (see § Versions are pinned, not floated), so
every feature below is simply available — nothing in this project is written behind a version check.
Moving the client from v1.52.0 to v1.53.1 added only `WithPublishAsyncAckHandler` plus fixes; the
value below is in APIs that were already available and unused.

| We hand-roll | Client API | Notes |
|---|---|---|
| Subject diffing then `UpdateStream`; consumer delete+recreate | `CreateOrUpdateStream` / `CreateOrUpdateConsumer` | Removes most of `jetstream.go` |
| Delete+recreate a durable on `DeliverPolicy` drift | `ResetConsumer` / `ResetConsumerToSequence` | v1.52.0, server 2.14; keeps the durable and its name |
| `context.WithTimeout(ctx, 5s)` per publish | `WithDefaultTimeout` | One setting on the handle |
| Name-prefix and `NumWaiting==0` guessing about durable ownership | `ConsumerConfig.Metadata` | Server 2.10; reconcile on stamped facts instead of naming conventions |
| One blanket `MaxAge` per stream | `WithMsgTTL` | Server 2.11; per-definition retention override — see § Retention is a property of the definition |
| Serial per-account publish loops in batch fan-out | `PublishAsync`, `WithPublishAsyncTimeout`, `PublishAsyncComplete` | Adopted for batch loops only — see § Async publishing |
| gocron duration jobs plus Redis persistence for deferred runs | `AllowMsgSchedules` + `WithScheduleAt` | Stage E |

Deliberately **not** adopted: consumer priority groups (`PriorityPolicyPinned` elects one active
client per group, which is the wrong shape for per-replica websocket durables that each hold their
own tenant filters; overflow and prioritized policies are micro-optimisations we have no measurement
to justify). `PauseConsumer` / `ResumeConsumer` are a good fit for websocket cordon and drain, but
that surface belongs to the capacity-controller work, not here.

`WithMsgID` publish dedup is also rejected. It only suppresses a duplicate **publish** inside the
stream's `Duplicates` window — the server default of 2 minutes, which we do not override — so it
misses the re-runs it was proposed for, which are hours or days apart. Widening that window would
grow the server's dedup index for every message on the stream. `WithExpectLastSequenceForSubject` is
optimistic concurrency for a problem this project does not have.

Core connection options adopted with the Stage A connect rewrite: `ReconnectOnFlusherError` (a
write-side failure does not currently trigger a reconnect) and `ReconnectErrHandler` (failed
reconnect attempts are currently unlogged, so a flapping connection is invisible). `WriteBufferSize`
and `IgnoreDiscoveredServers` are skipped — no measurement, and a single server.

## Decisions

### The package moves to `services/shared/nats`

The package sits at `services/shared/core/nats` while the Mongo layer it is modelled on sits at
`services/shared/mongo` — Mongo moved up out of `shared/core/` during its own rebuild. NATS follows,
to `services/shared/nats`, with `telemetry/natsprop` left where it is.

This lands in Stage A alongside the handle so the import churn happens once rather than twice.

Coordination: the module-split project plans an `eip/nats` module from these packages and carries an
open question about whether that move flattens the `shared/core/` prefix. For this package the answer
is now settled ahead of it — flattened.

### Versions are pinned, not floated

The NATS server ran on the floating `nats:2` tag, so the deployed feature set could change under us
between rolls. A stack that can silently move majors forces every new API to be written behind a
capability check, and makes "does this feature exist here" a runtime question rather than a fact.

**Decision:** pin the server image to an exact version and keep the Go client on the matching current
release, upgrading both deliberately. Nothing in this project is gated on a server version or an
advertised API level.

| Piece | Pinned at | Where |
|-------|-----------|-------|
| Server image | `nats:2.14.6` | `docker-stack.data.yml` |
| Go client | `github.com/nats-io/nats.go v1.53.1` | `services/go.mod` |
| Embedded test server | `github.com/nats-io/nats-server/v2 v2.14.6` | `services/go.mod` |

The embedded test server matches the deployed one on purpose: tests that exercise a 2.14 feature —
message schedules in Stage E above all — must run against the version that will serve them.

The other data-plane images (`mongo:8`, `redis:8`, `traefik:v3`) still float on their major tag. That
is outside this project's scope, but the same reasoning applies to them.

### The one-time scheduler has no callers

`ScheduleRequest` was never a way to register a recurring cron — it carries `job_id`, `task_type`,
`run_at` and `data`, with no cron expression. It requests **one deferred run** of one of three ESI
refresh tasks, and is served by a JetStream stream, a durable consumer, a consume loop, gocron
duration jobs, Redis persistence under `scheduler:onetime:*`, and a boot-time restore.

Nothing publishes to it. `PublishSchedule` has zero callers across the whole repository; the subject
appears only in its own constant, the receiver that subscribes to it, and a doc comment; the request
struct is never constructed, only decoded. The Redis keys can only be written by that path, so they
cannot be non-empty either.

**Decision:** remove the path and replace the capability with JetStream message schedules. Recurring
cron registration stays as it is — those crons are gated on the core primary lease, and moving the
schedule into stream config would move that single-firing property out of our control.

### A scheduled message is not a scheduled handler

The deferred unit today is *run core's handler at T*, and those handlers do real work at fire time:
the region market orders refresh re-checks EVE downtime, re-checks the Redis token budget, and takes
the next round-robin region index before it builds a payload. A server-side schedule defers a
*message*, so its payload is frozen at request time.

Scheduled messages therefore target a **core-consumed trigger subject**, not a worker task subject.
JetStream owns the timer and its durability; core still runs the handler at T with its fire-time
logic intact. Because a schedule's target must be a subject on the same stream, the schedule stream
carries both the schedule subjects and the trigger subjects.

### Async publishing

`PublishAsync` returns a future rather than waiting for the server's ack. The client bounds this
itself: `WithPublishAsyncMaxPending` (default 4000) caps the in-flight window, and a publish that
would exceed it blocks for `WithStallWait` (default 200ms) before returning `ErrTooManyStalledMsgs`.
`PublishAsyncComplete()` closes when every outstanding publish is acked.

Two client defaults must be overridden wherever async is used:

- `WithPublishAsyncTimeout` is **disabled by default**, so a future whose ack never arrives waits
  forever. Set a finite timeout.
- `CleanupPublisher` fails all pending publishes, so shutdown must wait on `PublishAsyncComplete()`
  first or a roll drops in-flight messages.

**Adopted for the batch fan-out loops** — the per-account publish loops in the job-identity encode
sweep, the inactive-account cleanup, the schema-version sweep and the Firestore scans. These publish
N messages serially by construction, so each pays a full round trip plus retry backoff. Async
pipelines them into one window with a single join at the end.

The failure handling improves as well, independently of speed. The encode sweep currently returns on
the first publish error, abandoning the run with a partly published batch and no record of where it
stopped. Collecting per-message outcomes lets the loop finish and report exactly which accounts
failed.

### Retention is a property of the definition

Streams carry a default retention in their spec — the stream's `MaxAge`, which is what nearly
everything uses and the only setting most definitions need. `doc-update-stream` is one hour;
`worker-task-stream` and the schedule stream are twenty-four.

A definition may **override** that for its own messages. The override is declared on the task or
topic definition, beside `DefaultPriority` and `DefaultTimeout`, and applied per published message
with `WithMsgTTL`. A per-message TTL overrides the stream default in either direction, so a
definition can hold its messages longer than the stream's default as well as shorter.

Any stream carrying a definition that overrides retention must set `AllowMsgTTL` (server 2.11) in its
spec; the spec is the place that fact is recorded.

No definition overrides retention today, and none is being given one speculatively — the mechanism
exists so that a task type which needs a different lifetime says so in one place, rather than the
stream's blanket value being changed for everything sharing it.

### The changestream publisher is not this project's to change

The document-update publish path belongs to
[changestream-tenant-scale](../changestream-tenant-scale/plan.md), whose Phase B moves the
synchronous publish off the watch loop onto per-tenant workers. That project owns the scheduling and
ordering decisions; this one does not touch them.

Two properties are load-bearing today and both come from publishing synchronously on the watch loop:

- **Ordering.** Doc-update messages carry the full document, so a reordered pair leaves a client
  showing stale data until that document changes again. The client documents that async publishes
  "can be stored in the stream out of order in case of retries".
- **At-least-once delivery.** The watcher advances the Mongo resume token only after a successful
  publish — "prefer dup over miss". An async publish returns before the ack, so a naive swap would
  advance the token for a change that was never stored, losing it with nothing to replay.

**Constraint carried into this project.** The `doc.update.{tenantString}.{collection}.{docID}` subject
shape is locked. Stage B and Stage C may change how subjects are built and bound, never what they
spell.

**Coordination point.** That project's baseline names the publish helper this project rewrites. Stage
A changes the shape of the call its Phase B will make, so the two must not land blind to each other —
whichever runs second builds on the other's surface.

### Durable cleanup is carried forward, not simplified away

Two different jobs live in the stream and consumer code today, and only one of them is the
boilerplate this project removes.

**Resolving and reconciling configuration** — `EnsureStreams` comparing subject sets before calling
`UpdateStream`, `GetOrCreateConsumer` detecting config drift, `GetOrEnsureStream`, and the
`subjectsAsSetEqual` helper behind them — is replaced wholesale by `CreateOrUpdateStream` and
`CreateOrUpdateConsumer`, with `ResetConsumer` for the delivery-policy case that currently forces a
delete and recreate. The server performs the upsert; we stop reimplementing it.

**Removing durables nobody owns** is not the same job and the server does not do it for us. It stays.
It exists because abandoned per-replica durables are retained indefinitely, hold pending counts, and
inflate the fan-out dashboards. Three layers cover it today and the rebuilt package owes all three:

| Layer | Today | After |
|-------|-------|-------|
| Graceful | `deleteOwnDocFanoutConsumers` deletes this container's `doc.update` / `doc.lock` durables on drain and shutdown | Same behaviour, owned by the stream type |
| Peer sweep | `ReconcileStreamConsumers` with a keep policy: durables of another naming generation are deleted, same-prefix durables with no waiting pulls are deleted as orphans, kept ones get `InactiveThreshold` stamped | Same coverage; ownership identified differently, see below |
| Server backstop | `InactiveThreshold` (1 hour) so a crashed replica's durable is reaped without a peer pass | Unchanged |

The worker and scheduler keep policies (one shared durable each, anything else deleted) carry forward
unchanged.

**What Stage B may change is how ownership is decided, never how much is cleaned up.** The peer sweep
currently infers ownership from a name prefix and treats zero waiting pulls as abandonment, which is
why the websocket boot path sleeps five seconds before running it — so peers have pulls outstanding
and are not mistaken for orphans. Stamping `ConsumerConfig.Metadata` with the owning container makes
the *generation* question a recorded fact rather than a naming convention. It does not by itself
answer *liveness*, so the sweep still needs a signal for "this owner is gone".

**Open question for Stage B:** whether `InactiveThreshold` alone is a sufficient reaper for crashed
replicas, letting the peer-orphan pass and its boot delay be dropped, or whether the peer sweep is
still wanted for faster cleanup. Decide with the metadata design, not before it.

**This cleanup fixed a real failure.** Before it, abandoned durables accumulated without any reaper —
development reached several thousand dead consumers, because every replica restart left its durables
behind and nothing removed them. The fix is verified there; it has not yet reached live, so
production has neither the failure nor the fix.

Two consequences for this project. It is proven behaviour, not a precaution, so it is not a candidate
for removal as speculative machinery. And because live has never run it, a rebuild that dropped or
weakened it would still look correct against production — the regression would only appear as
accumulating durables later. Stage B therefore owes tests covering all three layers, and the observed
accumulation rate is the yardstick for the open question above: any reduction in coverage has to hold
up against a replica restart cycle as fast as development's.

### Stages B and E cut over hard

Stage B changes durable configuration and Stage E removes a stream. Both are reconciled by
allowlist, and the reconcile deletes what it does not recognise — so during a rolling deploy an old
replica and a new one would delete each other's durables. Rather than build a compatibility window
for that, **both cut over hard**: the roll churns durables, and messages in flight during the window
are dropped.

That is acceptable because of what is on these streams:

| Dropped | Consequence |
|---------|-------------|
| `doc.update` | A tab shows stale data until that document changes again or the client reloads |
| `doc.lock` | A tab briefly misses a lock or unlock event; corrected by the next event |
| `task.>` | Scheduled work re-runs on its next cron tick |

The one case that does not self-correct: a **manually triggered** one-off task batch (an operator sweep
issued from core commands) loses whatever had not yet been enqueued, and is re-issued by running the
command again. Nothing on these streams is a user-visible write, and nothing is the only copy of
anything.

**Rollback** means redeploying the previous build. Durables churn a second time with the same
consequences above; there is no state to restore, because a deleted durable cannot be usefully
recreated anyway — a fresh one starts from `DeliverNew` and skips whatever was pending.

### Stream removal follows the same policy as durable removal

Stage E does not delete `scheduler-stream` by hand. An old replica's boot path would recreate it, and
a one-off deletion is not a rule anyone can read later.

Instead the **stream specs are the allowlist**, exactly as the keep policy is for durables:
`ReconcileStreams` deletes streams that carry our ownership stamp but no longer appear in the specs.
Retiring a stream is then deleting its spec, and the reconcile does the rest on next boot.

Ownership is stamped with `StreamConfig.Metadata` (server 2.10, same mechanism as consumer metadata).
The reconcile deletes **only** streams carrying that stamp — never an unstamped stream, so anything
created outside this package (KV or object-store backing streams, or an operator's own) is left
alone. Deleting a stream destroys its messages, which is acceptable under the hard-cutover decision
above and is the reason the stamp check is not optional.

### Payloads live with their task

Task request structs move out of `shared/core/nats` and sit beside their task definition. The
transport package keeps envelope, connection, streams, consumers, retry and subjects.

### Generic at the edges, concrete in the registry

A task definition gains its payload type — `tasks.Define[T](spec)` — so `Publish` and `Handle` are
type-checked against the subject. The worker resolves priority and timeout by task-name string at
runtime, and a generic type cannot go in `map[string]Task`, so the definition embeds a non-generic
record that the registry holds. This split is deliberate: generic at publish and handle sites,
concrete wherever lookup is by name.

## Wire compatibility

Stages A–D and F are **additive**: the JSON envelope is unchanged, so a partially rolled fleet keeps
working. Two changes are not, and are held separately:

- **Collapsing the double envelope** (`Message{Data: TaskMessage{Data: payload}}` into one) is
  **breaking** and needs a stream drain. `worker-task-stream` has a 24h `MaxAge`, so it is feasible
  as a deliberate cut once the typed layer makes the second envelope visibly redundant. Not in scope
  until then.
- **Dropping `MessageTypeSubscription` decoding** is breaking only for messages already on a stream,
  and there is no publisher in-tree.

Persisted shapes: removing the one-time scheduler abandons the `scheduler:onetime:*` Redis key space
and the `scheduler-stream` stream and its `scheduler` durable. Both are provably empty.

## `go fix -diff` on the touch surface

Run over the packages this project plans to edit. Clean: `shared/core/nats`, `shared/tasks`,
`shared/stackservices`, `shared/orchestrationprobes`, `shared/telemetry/natsprop`.

One in-scope finding: `shared/dependency/unavailable.go` uses `errors.As` with a declared variable
where `errors.AsType[net.Error]` now applies. Apply it with the Stage A edit to that file.

Other diffs reported under these package patterns belong to files this project does not touch
(`shared/core/documentlock/atomic.go`, `core/changestream/resume.go`, `core/scheduler/esi/downtime.go`,
`worker/ratelimiter/errors.go`, `websocket/sync/sync_processor.go`, `api/helper/sso/jwt.go`). They are
out of scope and are not modernised here.

## Phases

Phase 1 is this folder. Later stages run only after that gate.

### Stage A — handle and errors

`nats.NATS` holding the connection and JetStream context with named stream fields, built by `NewNATS`
the way `NewMongo` binds collection constants — the type is named for the technology, matching
`mongo.Mongo`, and takes the import alias `eipnats` beside `eipmongo`. `stackservices.Clients` keeps
its `NATS` field and changes its type to `*eipnats.NATS` instead of holding a connection and context
pair; `Conn()` is the named escape hatch, as `Coll()` is for Mongo.

"Bus" is deliberately not used for this type: it already means a subscription surface for one subject
family (`orchestrationprobes.StartBus`, `StartWSCommandBus`) and should keep that narrower meaning.

One `Retry` and one `IsRetryable`, context-aware, replacing the publish retry loop and the three ack-side loops;
`shared/dependency` calls `IsRetryable` rather than keeping a second copy of the string list. Dead
surface removed. The package moves to `services/shared/nats` in the same change.

The handle carries readiness — a `Ping` equivalent to the Mongo handle's, with the health deps that
currently reach for the raw connection moving onto it.

Four observability behaviours must survive the rewrite, none of which are load-bearing for
correctness and all of which a rewrite can therefore drop silently: the producer span on publish, the
consumer span with its attached debug steps, the access-shaped completion log, and the duplication of
trace context into the JSON body as a fallback for when JetStream delivers without user headers.

Done when: no service holds a `jetstream.JetStream` or `*natslib.Conn` outside the composition root,
and no NATS retry logic exists outside the package.

### Stage B — streams and consumers as specs

`StreamSpec` values (name, subjects, retention, keep policy) as the source of truth, with a `Stream`
type owning ensure, consumer creation, filter reconcile and durable hygiene on top of
`CreateOrUpdateStream` / `CreateOrUpdateConsumer` / `ResetConsumer`. Durable ownership moves from
name prefixes to consumer `Metadata`. One `Consume` with optional bounded concurrency; the worker's
fetch loop is deleted.

Durable cleanup is preserved in full — see § Durable cleanup is carried forward, not simplified away.

Done when: no call site names a stream twice, there is one consume loop in the repository, and the
graceful, peer and backstop cleanup paths are covered by tests.

### Stage C — typed tasks and topics

`tasks.Define[T]`, `Publish`, and `Handle`. Payload structs relocated beside their definitions. Span
attributes come from an optional method on the payload type, retiring the task-name switch.
`requestableTaskTypes` becomes a field on the definition.

Batch fan-out loops move to async publishing at the same time, since they are being rewritten onto
`Publish` anyway.

The asynq boundary closes with the same definition. Worker handlers register through a generic
adapter — `tasks.Handle(definition, func(ctx, req T) error)` returning an `asynq.Handler` — so the
task-name string comes from the definition rather than being retyped at the handler, and the payload
type is checked at both ends. Handlers stay in worker packages; `shared/tasks` does not import them.
A test iterates every definition and asserts a handler is registered, so a task that can be published
with nothing to run it fails the build rather than a production message.

Core NATS is covered by the same typed surface, not left raw: publish, subscribe, and **request/reply**
including the scatter-gather census the capacity controller currently hand-rolls with
`PublishRequest` and its own inbox. Reply encoding keeps the existing `Respond` helpers.

Done when: no publish site passes a subject string, no task-name string literal exists outside its
definition, no per-account fan-out loop publishes serially, and no service builds a NATS inbox by
hand.

### Stage D — call-site cutover

The four processors move onto the typed handler; ack, nack and terminate become the handler's return
value. `message_helpers.go` reduces to the primitives the handler needs. No forwarding wrappers are
left behind.

### Stage E — scheduled messages

Remove `ScheduleRequest`, `PublishSchedule`, `MessageTypeSchedule`, `ScheduleOneTimeJob`, the
one-time job Redis persistence and restore, the `scheduler-stream` stream and its durable.

Replace with a schedule stream carrying `AllowMsgSchedules`, whose subjects cover both schedule
holders and the trigger subjects they target. A deferred run is published with `WithScheduleAt` and
`WithScheduleTarget`; core consumes the trigger subject and runs the existing handler.

**Management surface.** The server has no API for listing or inspecting schedules, so the package
provides one on top of how schedules are stored — one schedule per subject, with `Nats-Rollup: sub`
applied by the server:

| Operation | Mechanism |
|---|---|
| Identify | The schedule's **subject is its handle**. A schedule id is chosen by the caller and forms the last token. |
| Create | Publish with `WithScheduleAt` / `WithScheduleEvery` / `WithScheduleCron` plus `WithScheduleTarget`. |
| Modify | Publish a new schedule to the same subject — the rollup replaces the prior one. |
| Cancel | Purge that subject, or delete the message by sequence. |
| Cancel and act atomically | Publish to the target with `Nats-Schedule-Next: purge` and `Nats-Scheduler` set to the schedule subject. The scheduler subject may not equal the publish subject; the server rejects that with error 10212. |
| List | `Stream.Info` with a subject filter returns the schedule subjects that hold messages. |
| Inspect | `GetLastMsgForSubject` returns the schedule message and its `Nats-Schedule*` headers. |

Done when: a deferred task can be created, listed, modified and cancelled through the shared package,
and no gocron duration job or Redis schedule key remains.

### Stage F — promote

New live SoT at `backend/shared/nats.md` alongside `backend/shared/mongo.md` (there is no NATS live
topic today), a testing topic, and `backend/shared/contents.md` task-map rows.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | Done |
| Version pinning (server image, client, embedded test server) | Done |
| A — handle and errors | Done |
| B — streams and consumers as specs | Not started |
| C — typed tasks and topics | Not started |
| D — call-site cutover | Not started |
| E — scheduled messages | Not started |
| F — promote | Not started |

## Handoff

**Start here:** Stage A. It gates every later stage, because the handle is what Stages B and C hang
off.

**Open questions carried into Stage A:**

- Whether the envelope collapse is worth its stream drain, revisited once Stage C lands.
- Whether the doc-update stream wants per-message TTL instead of one blanket `MaxAge` (Stage E).

**Verification owed before Stage E ships:** the schedule cancellation and replacement behaviour above
is taken from the client source and ADR-51, not from a run against our own server. Confirm it against
`nats-server v2.14.6` with a throwaway client before the removal lands.
