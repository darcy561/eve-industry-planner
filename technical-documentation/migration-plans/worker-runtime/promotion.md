# Worker runtime — promotion

The live-doc content this project owes, drafted so promoting is folding rather than writing. Each
section below names its destination and whether it replaces something or is new.

Process: [`../documentation-rules.md`](../documentation-rules.md) § Promote checklist. Nothing here is
live until that go-ahead; the pages named are still describing the previous shape.

## Where it goes

| Destination | Change |
|-------------|--------|
| [`backend/worker/worker.md`](../../backend/worker/worker.md) | § Task dependencies **replaced**; two sections **added** |
| [`backend/worker/contents.md`](../../backend/worker/contents.md) | Owns widened, two task-map rows |
| [`backend/shared/nats.md`](../../backend/shared/nats.md) | Two paragraphs **corrected** |
| [`testing/services/worker.md`](../../testing/services/worker.md) | Three coverage rows **corrected**, one **added** |
| [`stack/stack.md`](../../stack/stack.md) | Restart condition **added** — no live page states it |

`task-dispatch` promotes into the same `nats.md`. Whichever lands second should read the other's
edit rather than assume the old text.

---

## For `backend/worker/worker.md` — replaces § Task dependencies

## Task dependencies

Handlers take `*taskrun.Dependencies`, not `*stackservices.Clients`. It is built once in the
composition root by `taskrun.FromClients(clients, esi, refs)` and handed to the mux, which passes it
to every handler — `refs` derives entity refs, which the connect bag does not carry.

| Field | Role |
|-------|------|
| `Mongo` | Shared `*eipmongo.Mongo` — [mongo.md](../shared/mongo.md) |
| `Redis` / `NATS` | Stack clients for tasks that need them |
| `ObjectStore` | Static-data / SDE object backend |
| `ESI` | The shared ESI client — [shared/esi.md](../shared/esi.md) |
| `EntityCipher` | Derives entity refs; a missing key stops the worker starting |

`taskrun` also answers what a task can know about its own run — `Current(ctx)` reports the task id,
its queue, and the attempts used against the attempts allowed. That is the only place under
`worker/**` that names the queue library.

**An ESI refusal is flow control, not failure.** asynq's `IsFailure` returns false for a rate-limit
error, the retry delay comes from the refusal's own `RetryIn()`, and both that and the exponential
fallback are spread by a task-derived offset so replicas that failed together do not return together.

Every worker ESI call goes through the shared client, all of it as background work, and none of it
pre-flights a status check — an unavailable server is a downtime refusal from the request itself.

---

## For `backend/worker/worker.md` — new section, after § Task dependencies

## Running a task

```text
publisher ──► task.{area}.{name} ──► JetStream ──► subscriber ──► asynq queue ──► handler
```

**The subject names the task.** The subscriber resolves it through the registry rather than parsing
the last segment, so a subject no definition claims is refused terminally — running unknown work on a
guessed queue under a guessed deadline hid the case worth seeing, which is a task wired incompletely.
The queue and the deadline then come from that definition; there is no default to fall back on.

**The payload is the request.** Asynq carries the task type in its own field, so nothing in the body
repeats it. A handler receives the decoded request, and a payload that is absent or will not decode is
refused at the mux before any handler runs.

**The registry decides the handler set.** A task with no handler, or a handler under a name no task
carries, stops the worker starting. Both used to be silent: asynq accepts a task it cannot route and
discards it, and a handler for no task is simply never reached.

**Saying work cannot succeed.** A handler returns `eipnats.Terminate(…)` — the same word the consumer
that carried the message uses — and the mux translates it for the queue, which archives the task
instead of retrying. Any other error is retried under the queue's backoff.

## For `backend/worker/worker.md` — new section, after § Health

## Starting and stopping

Stops run in reverse of starts, so the worker stops **taking** work before it loses the ability to
**do** it:

```text
NATS intake → drain in-flight → command bus → probes → ESI → asynq client → telemetry → deps
```

The drain is bounded by `asynq.DrainTimeout` (`worker/asynq`), which is what asynq's
`ShutdownTimeout` is set from; the server's fetch loop is stopped before the wait begins, so the drain
is finite. A task overrunning it is pushed back to Redis and runs elsewhere — every task can already
run twice, since both the queue and the stream redeliver. The per-step cleanup budget is derived from
that figure rather than chosen, because asynq's shutdown takes no context and a shorter budget would
not be enforced.

Swarm replaces a service that stops: `restart_policy` is `condition: any`, so a clean exit brings the
task back instead of reading as work completed → [stack.md](../../stack/stack.md).

---

## For `backend/worker/contents.md`

**Owns** becomes: *Application behaviour for `services/worker`: how a published task reaches a
handler, what a handler is given, the start and stop sequence, the Asynq concurrency envelope and
replica/capacity defaults.*

Task map gains:

| I need to… | Read |
|------------|------|
| Understand how a task reaches its handler | [worker.md](./worker.md) § Running a task |
| Know what a clean stop does | [worker.md](./worker.md) § Starting and stopping |

---

## For `backend/shared/nats.md` — corrections

Under **A task is published by name, never by subject**, this sentence is no longer true:

> A zero value means the worker's default, exactly as an omitted JSON field does.

There is no worker default. Replace the paragraph with:

> A task's queue and deadline come from its definition in `tasks.go`; there is no per-publish
> override and no fallback. A subject the registry does not claim names no task, and the worker
> refuses it rather than guessing.

The message shape is worth stating where the envelope is described:

> A task message is one envelope and a payload: `{"type":"task","data":{…}}`, where the data is the
> request the publish helper built. Trace context and request identity travel in the message's
> headers, not in its body.

---

## For `testing/services/worker.md` — coverage corrections

**Tested**, replacing the `asynq` row:

| Area | What the tests cover |
|------|----------------------|
| `asynq` | Per-task timeout from the definition and its clamp; concurrency default and cap; the request decoded at the mux and refused terminally when absent, null or malformed; terminal errors translated to the queue's sentinel while ordinary errors still retry; handlers checked against the registry in both directions; what `Enqueue` puts on the queue, against a real Redis |
| `worker` (app) | The stop sequence, and that intake starts last so it stops first; a published task reaching its handler end to end over an embedded JetStream and Redis, for a trigger and for a request; an unregistered subject reaching no handler; an undecodable request archived rather than retried |
| `taskrun` | A run is unreadable outside a task, and readable through the mux's context wrapping; final-attempt arithmetic |
| `archivedjobs` | Requests that cannot be served are terminal across all three owner tasks, and a servable owner is not |

**Thin** loses its `asynq` row. **Little / none** loses `App wiring: main.go, app.go,
task_subscriber.go`.

Entrypoints gains a row:

| Check | Where | Notes |
|-------|--------|--------|
| Worker end to end | `go test ./worker/` | In-process NATS + Redis; no Docker |

---

## For `stack/stack.md` — addition

No live page states the restart condition. Wherever the deploy anchors are described:

> **`restart_policy` is `condition: any`** on every fragment. A service asked to stop exits 0, and
> `on-failure` reads that as the task having finished its work, leaving the service with no
> replacement. Nothing there keeps a stack alive that was meant to go: shutdown removes services
> rather than stopping them, and a removed service has no task to restart.

---

## Not promoted

Two items stay in [`plan.md`](./plan.md) as recorded gaps rather than becoming live text, because
live docs describe what runs, not what is missing:

- The stop-order tests cannot see a runner moved between start phases.
- Tasks needing Mongo are outside the end-to-end harness.

On promote, both move to whichever project picks them up, or are dropped deliberately.
