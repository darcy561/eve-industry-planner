# Worker runtime — behaviour overlay

How the parts this project touches work **after** each stage lands. Live docs remain the truth
wherever this file has no section. Sections fill in as stages complete — see
[plan.md](./plan.md) § Stage status.

## Starting and stopping

**A stop is the mirror of a start.** `lifecycle.Group.Cleanups` stops runners in **reverse
registration order**, then runs app stops. A runner therefore comes down before whatever it was built
on top of, and the app-layer stops — telemetry, metric unsubscribes — come down last, after the work
they record.

This is shared behaviour: api, core, websocket and worker all register through the same group. Two
things follow for services other than the worker. Telemetry now outlives each one's drain rather than
being torn down first, so a shutdown is observable. And the websocket goes unready before it closes
client sockets rather than after, because its probes are registered before its server and reverse
order now puts them second.

The worker's stop resolves to:

```
NATS intake → drain in-flight tasks → command bus → probes → ESI → asynq client → telemetry → deps
```

Intake first is the point of the order: the worker stops **taking** work before it loses the ability
to **do** it. Nothing can reach the asynq client after the subscriber has stopped, so closing it late
is safe, and the drain in between is finite because nothing is being added to it.

**The drain is bounded by `asynq.DrainTimeout`** (`worker/asynq`), which is what asynq's
`ShutdownTimeout` is set from. The server is told to `Stop()` — ending its fetch loop — before
`Shutdown()` waits, so the wait is against a closed intake rather than a queue still handing out work.
A task that overruns the budget is pushed back to Redis and runs again on another replica; every task
can already run twice, since both the queue and the stream redeliver.

The worker's per-step cleanup budget is derived from `DrainTimeout` rather than chosen independently,
because asynq's shutdown takes no context: a step budget shorter than the drain would not be enforced,
it would just be untrue.

**A service that stops is replaced.** Swarm's `restart_policy` is `condition: any` on every fragment,
so a clean exit brings the task back rather than reading as work completed. Draining correctly and
being restarted are the same requirement: a worker that shuts down tidily and stays down has still
lost its replica. Nothing there interferes with `eip shutdown`, which removes services rather than
stopping them.

## What a task handler receives

**The request the publisher sent, decoded, and nothing else.**

```go
func RefreshRegionMarketOrders(ctx context.Context, req eipnats.RegionMarketOrdersRequest, deps *taskrun.Dependencies) error
```

The type is named twice — once by the publish helper that builds it, once by the handler's signature
— and `handle` in `worker/asynq` holds the two together, so a publisher and a handler that disagree
no longer compile. Before this, both ends independently asked for a type and nothing checked they
matched; a mismatch decoded into a zero-valued request and the task ran on empty input.

A task carrying no request registers through `handleTrigger` and takes no request parameter. Its
queue name is the whole instruction.

**Decoding happens once, at the mux.** `decodeRequest` refuses a payload that is absent, JSON `null`,
or unparseable, and refuses it *terminally* — none of those become valid on a retry. A handler is
never reached with a request it cannot use, so handlers no longer carry nil-task guards or decode
error branches.

**The payload is the request.** Asynq carries the task type in its own field, which is what the mux
routes on and what every logging and metrics site reads, so nothing in the payload repeats it:

```
NATS    {"type":"task","data":{"region_id":10000002,"station_id":60003760}}
asynq   type=refreshRegionMarketOrders  payload={"region_id":10000002,"station_id":60003760}
```

## Saying that work cannot succeed

**One word, both engines: `eipnats.Terminate`.** A task returns it the same way the consumer that
carried the message does, and `worker/asynq` translates it to the sentinel the queue understands.
Task authors no longer pick a vocabulary based on which half of the machine they are writing for.

It means *this cannot succeed on a retry* — a request that will not decode, an owner kind that has no
archive. It does not mean *this attempt failed*: an ordinary error is returned as-is and the queue
retries it under its own backoff.

**Attempt state is separate, and asked for by name.** How many tries a task has had is not part of
its request, changes between attempts, and only the engine knows it, so `taskrun.Current(ctx)`
reports it. Only `archivedjobs` needs it — to record a failure against the queue entry on the last
attempt, so a read can tell a user their figures are stale rather than showing a recalculation that
never resolves.

That accessor is the single place the queue library is named in task code. Everything else in
`worker/tasks/**` is now free of it.

## How the worker is assembled

Two dependency shapes, which is the fewest the boundaries allow:

```
stackservices.Connect ──► Clients ──► taskrun.FromClients ──► taskrun.Dependencies
                             │                                        │
                             ▼                                        ▼
                    probes, subscriber                        every task handler
```

`Clients` is what connecting returns. `taskrun.Dependencies` is what a task works through and is not
the same thing — it carries the ESI client and the entity cipher, which the connect bag does not. The
composition root builds the second from the first once, in `prepare`.

`SetupServer` and `SetupHandlers` take `*taskrun.Dependencies`; the task subscriber takes the NATS
handle and the asynq client. There is no worker-owned dependency struct and no interface bridging the
main package — `taskrun` is an ordinary package, so `worker/asynq` names it directly.

## Where a task's shared dependencies live

**`worker/taskrun`** — what a task has while it runs. Two things, because a handler needs both and
neither belongs to any one task area:

- `Dependencies` — the stack clients and the ESI limiter a handler works through, built once at the
  mux by `FromClients` and passed to every handler.
- `Current(ctx)` — what the engine knows about the attempt in progress: the task's queue id, the
  queue it came from, and the attempts used against the attempts allowed. `Run.FinalAttempt()` asks
  the comparison rather than each caller writing it.

`worker/tasks/esi` holds ESI tasks and nothing else. It is imported by the mux, and by nothing under
`worker/tasks/**`. Its package is `esi`, matching its directory like every other task package, so
call sites name it directly rather than through an alias.

`taskrun` is also where the queue library is named. `Current` reads what asynq put on the context; no
other file under `worker/tasks/**` imports `hibiken/asynq`.

**It reports the run, not one fact about it.** A task's attempt state is not part of its request —
a publisher does not set it and it changes between attempts — so it is read from the context rather
than passed in. Returning the whole `Run` means the next thing a task needs to know about its own
execution is a field, not another accessor beside the first.

## How a handler reaches its definition

**The registry decides the set.** Handlers are collected into a map keyed by task name, and `mount`
puts them on the mux by walking `eipnats.Tasks()`. A definition with no handler, or a handler under a
name no definition carries, **stops the worker starting** — `SetupHandlers` returns an error and
`setupServer` never runs the server.

Both failures used to be silent. A task with nothing to run it is accepted by asynq and then
discarded; a handler serving no task is simply never reached. Neither says anything at the time, so
the work just does not happen and nobody learns why until someone notices.

A handler cannot live on the `Definition` itself: `shared/nats` is imported by api and core as well,
and must not reach into the worker's task packages. So the handler map stays worker-owned, and what
the registry contributes is the check that it is complete.

## What happens to a task nobody registered

**It is refused, terminally.** The worker resolves a subject through `eipnats.TaskBySubject` — a
lookup in the registry, not a parse of the subject's last segment — and terminates a message whose
subject no definition claims, because redelivering it cannot register it.

Nothing defaults any more. `Enqueue` takes the `Definition`, so the queue and the deadline are the
task's own; there is no fallback queue and no fallback deadline to run unknown work under.

The lookup is also stricter than the parse it replaced: a real task's name sitting on a subject it
does not live on used to resolve to that task, and now resolves to nothing.

## Testing the worker end to end

`services/worker/e2e_test.go` runs the worker's whole pipeline in one process. The harness
(`e2e_harness_test.go`) starts an embedded NATS with JetStream, a miniredis behind both asynq and the
tasks' own storage, and a stand-in ESI — then brings up **the real worker**: `SetupServer` builds the
mux through the real registration path, and `SubscribeScheduledTasks` runs the real consumer.

Nothing about the worker is stubbed. A task is published through the same helper api and core use,
resolved by the same subscriber, queued by the same bridge, and run by the same handler. That is what
these cover which unit tests cannot: a message's meaning changing between the side that sends it and
the side that runs it.

| Test | What only an end-to-end run shows |
|------|-----------------------------------|
| A trigger runs its task | Publishing is the whole instruction; the work happening is the proof it arrived |
| A published request reaches the task that runs it | The fields a publish helper takes are the fields the handler reads, across two queues and two encodings |
| A subject naming no task never reaches a handler | The refusal happens before anything downstream sees it |
| An undecodable request is archived rather than retried | The queue acted on a terminal error — the translation from the word a task uses to the sentinel asynq understands |

**These have teeth.** Reintroducing the double-wrapped payload the envelope collapse removed makes
the request test fail with "the task saw nothing at all"; the trigger test correctly stays green,
because a trigger has no request to mangle.

**What is not covered.** Tasks needing Mongo — the archived-jobs statistics family, the migrations —
do not run here, because the harness has no Mongo in it. `testing/mongolive` gates a test on the
stack's Mongo and is the way to extend this, at the cost of the run needing a live stack.

The live testing topic, [`testing/services/worker.md`](../../testing/services/worker.md), does not
describe any of this yet and is stale in two other ways since these stages: the asynq package is no
longer "timeouts/concurrency only", and app wiring is no longer untested. It is live SoT, so it is
updated on promote rather than now.
