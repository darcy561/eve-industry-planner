# Task dispatch — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Why this exists

The NATS rebuild made publishing a task typed: a helper per task, the payload checked by the
compiler, the queue and deadline taken from one definition. It stopped at the point the message
leaves. Everything after that is still resolved by string, and the rebuild left three things it
deliberately did not fix because each is a decision rather than a cleanup.

## The subject is authoritative

A task's type used to be carried twice: the worker derives it from the **subject's last segment**,
and the envelope repeated it. Nothing compared them, so a message whose subject and envelope
disagreed was routed by the subject and reported by neither.

**Decided:** the subject is authoritative and the envelope's copy is removed, not checked. The
subject was already the only one read — `getTaskTypeFromSubject` is the sole resolver, and asynq
re-stamps the type from it — so checking the second copy would have been enforcing agreement between
an authority and a field nothing consulted.

## An unknown task is refused

`GetPriorityQueue` and `GetTaskTimeout` used to fall back to `Priority3` and sixty seconds when the
registry had no definition for a name. A task that never reached the registry therefore ran — on the
wrong queue, with the wrong deadline, and without saying so. The failure was invisible precisely when
it mattered, which is when someone had added a task and wired it incompletely.

**Decided: refused, and terminally.** The worker resolves a subject to a `Definition` through
`TaskBySubject` — a lookup, not a parse of the last segment — and a subject no definition claims is
terminated rather than redelivered, because no number of retries will register it. `Enqueue` takes
the definition, so the queue and the deadline come from it and there is no default left to fall back
to. `DefaultWorkerTaskTimeout` is gone.

Resolving by subject also closes a gap the segment parse left open: a real task's name on a subject
it does not live on used to resolve, and now does not.

## The envelope wraps an envelope

`Message{Data: TaskMessage{Data: payload}}` meant the worker unmarshalled the same bytes twice for
every task. The inner envelope once carried a priority and a timeout override; both were gone, so it
held only the duplicated task type described above, and it went with it.

**This is the one breaking change in the set.** A task message is now one envelope and a payload:

```json
{"type":"task","data":{"region_id":10000002,"station_id":60003760}}
```

`Message` stays. Its `Type` is not read for its value on this path, but `decodeEnvelope` treats an
empty `Type` as "no envelope", and that gate is what feeds the trace carrier and log context into
every JetStream consumer's span. The body's trace fields are the fallback for deliveries that arrive
without user headers, so the outer envelope is load-bearing and only the inner one was waste.

It went in as a clean cut, with no tolerant read for the shape it replaced. Two stores would have
carried superseded messages across a deploy — `worker-task-stream` (24h `MaxAge`) and the asynq queue
in Redis (24h retention, plus retries that outlive it) — and both converge on `UnmarshalTaskPayload`,
so a tolerant read would have been one branch in one function. It was not worth carrying: there is no
traffic on this stack whose loss matters, and a compatibility branch that exists for a window nobody
is watching is a branch that never gets deleted.

`UnmarshalTaskPayload` rejects an absent request rather than decoding one. JSON `null` unmarshals into
any struct without complaint, so without that guard a task carrying no request runs on a zero-valued
one and fails somewhere further in, reporting the wrong thing.

`Enqueue` was not touched. It copies `Message.Data` into the asynq payload's `data` field, which is
one layer shallower now without knowing it.

## The envelope carried the trace twice

The trace context and the request identity travelled in two carriers at once: the NATS headers the
publisher injected, and a copy in the message body (`trace_carrier_*`, `log_context`). Every consumer
then reconciled the two, and the bridge did it again on the way to asynq. The stated reason for the
copy was that JetStream may deliver without user headers.

**Decided: headers only.** The premise was testable and does not hold — a task published inside a
span arrives carrying `traceparent` on nats-server 2.14.6, the version `docker-stack.data.yml` pins.
`TestJetStreamDeliversTheHeadersItWasPublishedWith` keeps that honest, so a server version that ever
does drop headers fails loudly rather than silently losing correlation.

The body copy, the enrichment that wrote it, the two merge helpers and the reconciliation in both
`BeginConsumerContext` and `Enqueue` are gone. `Message` is now `{type, subtype, data}` — the shape
the SPA already reads.

Headers rather than the payload, because the mux is generic: it wraps every task without knowing
which one. Context in the payload would mean parsing the payload to find it, which needs either
per-task coupling in generic middleware or a metadata wrapper around the request — and that wrapper
is Stage B's double envelope coming back.

A side effect worth naming: `Handle` unmarshalled **every** JetStream message to look for the body
copy, so each message was parsed twice — once there and once by its handler. That second parse is
gone for document updates, lock events and schedules as well as tasks.

**No history explains the original copy.** `services/shared/nats/` carries none under that path, so
this rests on the evidence above rather than on the reason it was written for.

## The operator CLI names tasks by string

`core/commands/tasks.go` switches on `Name` in five places to trigger any task an operator names with
a payload they supply. That is untypeable by construction — the payload is only known at runtime — so
it holds definitions rather than helpers. Its migration commands also read `Subject` and
`DefaultPriority` from definitions to print what they queued.

**To decide:** whether the CLI gets a purpose-built view (name → publish function) so it stops
reaching into definitions, and whether a publish helper should return what it published so a command
reports from the result rather than re-deriving it.

## Phases

Phase 1 is this folder.

### Stage A — One authority for a task's type

Decide between subject and envelope, and make the other either derived or checked. This gates Stage B,
because collapsing the envelope presumes the subject is authoritative.

### Stage B — Collapse the double envelope

Remove the inner envelope so a task message is one envelope and a payload. Breaking: needs a drain of
`worker-task-stream`, and the worker must be able to read what is already on the stream until it is
empty.

### Stage C — The operator CLI

Give the CLI a dispatch view of its own, and decide whether publish helpers report what they
published.

### Stage D — Unknown tasks are refused

Stop defaulting a task the registry does not know.

Taken with the worker-runtime project's own Stage D, which rewrote the same resolution path. That
project has promoted; how a subject resolves to a task now lives in
[backend/worker/worker.md](../../backend/worker/worker.md) § Running a task.

## Wire compatibility

Stages A, C and D are process-local. **Stage B is breaking** and is the reason this project exists as
its own effort rather than a tidy inside the NATS rebuild. It shipped as a cut, not as a migration:
a message published in the superseded shape does not decode, and nothing was carried to make it.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | Done |
| A — one authority for a task's type | Done — the subject, envelope copy removed |
| B — collapse the double envelope | Done |
| C — the operator CLI | Not started |
| D — unknown tasks are refused | Done |

## Handoff

**Start here:** Stage C, the only stage left — the operator CLI's dispatch view.

Stages A, B and D have already been promoted into live documentation by the worker-runtime project,
which shared their code: [backend/worker/worker.md](../../backend/worker/worker.md) § Running a task
and [backend/shared/nats.md](../../backend/shared/nats.md) both describe the current behaviour. This
folder therefore promotes only what Stage C lands, and is deleted when it does.

Stage B left nothing outstanding.
