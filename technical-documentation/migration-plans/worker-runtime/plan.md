# Worker runtime — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Why this exists

The worker runs two queue systems in series. JetStream (`worker-task-stream`) is the durable
transport that carries a task from whichever service published it to whichever replica is alive.
**Asynq on Redis is the execution engine**: five priority queues with poll weights, a bounded worker
pool, per-task deadlines, and ESI-aware retry backoff. `processMessage` bridges them — pull from
JetStream, enqueue to asynq, acknowledge.

**Both stay.** Asynq is not a worker-internal detail: `capacity-controller` scales worker replicas
from `asynq.Inspector` pending-by-queue, and core's operator CLI inspects and purges those queues.
JetStream has no priority queues, so replacing asynq means rebuilding weighted polling, retry
backoff, per-task deadlines, a scaling signal and two operator commands — writing a queue engine to
delete one. The seam between the two is worth improving; neither side of it is worth removing.

What this project fixes is everything the seam has deposited in the container around it: a shutdown
sequence that stops the worker being able to work before it stops taking work, a queue library named
in the signature of every task, a shared kernel living under an unrelated package's name, one
dependency bag declared twice, and a registration list written by hand.

## The shutdown order was inverted

Cleanups ran sequentially in the order they were registered (`shared/lifecycle` `Group.Cleanups`),
which for the worker is:

```
telemetry → asynq-client.Close → esi → probes → bus → asynq-server.Shutdown → NATS subscriber stop → deps
```

Three consequences, and the middle one happened on every single stop:

- **Telemetry shut down first**, so nothing about the drain that followed was observable.
- **The asynq client closed while the NATS subscriber was still pulling.** Every message in flight
  then failed to enqueue and was negatively acknowledged, so a clean stop manufactured an error burst
  and a redelivery wave. Nothing was lost — JetStream redelivers — but the shutdown was noisy by
  construction and the noise was indistinguishable from a real fault.
- **The drain budget was the library's, and the stated one did not apply.** `srv.Shutdown()` takes no
  context, so the 5s the lifecycle allowed each step was never enforced on it; what actually bounded
  the drain was asynq's own `ShutdownTimeout`, left at its 8s default, after which in-flight tasks are
  pushed back to Redis. Nothing was killed and nothing was lost — the 60s Swarm grace was never at
  risk — but the number that decided how long a rolled replica gets to finish its work was one nobody
  had chosen.

**Wanted:** intake stops first, in-flight work drains under a bounded wait, the client closes after
the last enqueue, and telemetry outlives all of it.

## A task's signature named the queue library

Handlers are `func(ctx, *asynq.Task, *TaskDependencies) error`, so eleven packages import
`hibiken/asynq` to receive a type most of them use only to reach one unwrap. `archivedjobs` couples
harder: it reads `asynq.GetRetryCount` and `asynq.GetMaxRetry`, and returns `asynq.SkipRetry` in six
places.

That last one is the seam showing through into vocabulary. The codebase has **two ways to say "do not
retry this"** — `eipnats.Terminate` on the JetStream side and `asynq.SkipRetry` on the asynq side —
because it has two queue systems, and a task author has to know which half of the machine they are in
to pick.

**Decided:** a handler receives the decoded request, and one vocabulary covers both engines.

The two terminal names looked like duplicates but were being used for two different things. Six of
the seven sites meant *this input can never be valid* — an owner kind that is not an owner kind will
not become one — which is exactly what `eipnats.Terminate` already meant on the consumer side; those
are now one word. The seventh, in `failure.go`, meant *this has had its attempts*, which no consumer
equivalent exists for because only the engine knows which attempt is running. That one keeps its own
shape and reads the count through `taskrun.Current`.

## The shared kernel was called `esi`

`worker/tasks/esi` owned `TaskDependencies` and the payload decoding, and thirty files across
`archivedjobs`, `migration`, `maintenance`, `jobidentity` and `sde` imported it for them. Nothing
about either was ESI. A reader tracing where a task's Mongo handle came from landed in the package
for market and character work.

The package also declared itself `package tasks` while sitting in a directory called `esi` — the only
one of the nine task packages whose name disagreed with its directory, which is why every importer
had to alias it.

## One dependency bag, declared twice

`WorkerDependencies` existed as a struct in `worker` and as a three-getter interface in
`worker/asynq`, because `worker/asynq` cannot import a main package. Threaded through, that was four
representations of one bag: `stackservices.Clients` → the struct → the interface → `TaskDependencies`.

The interface was solving a problem Stage C had already solved. `taskrun` is an ordinary package, so
`worker/asynq` can name `*taskrun.Dependencies` directly and the main-package boundary never needs
crossing. Both `WorkerDependencies` declarations are gone.

## Registration was written out by hand

`SetupHandlers` was twenty-six closures of identical shape, each forwarding to a package function
with the same signature. A task was wired in three places — its `Definition`, its publish helper, and
its handler registration — and a test existed to catch the drift that arrangement invites.

A handler cannot live on the `Definition`: `shared/nats` is imported by api and core too, and it must
not reach into the worker's task packages. What the registry can decide is the **set**. Handlers are
collected into a map and mounted by walking `Tasks()`, so a definition with no handler and a handler
serving no definition both stop the worker starting. The test that caught this drift is now a boot
failure.

## Phases

Phase 1 is this folder.

### Stage A — Shutdown stops taking work before it stops doing it

Order the worker's cleanups by what they mean rather than by when they were registered: NATS intake
first, then a bounded drain of in-flight tasks, then the client, with telemetry last. State the drain
budget rather than inheriting a library default.

Independent of every other stage, and the only one fixing a live defect rather than a structural one.

**The fix landed in `shared/lifecycle`, not in the worker.** Ordering cleanups is what that package is
for, and every service registers telemetry the same way, so a worker-local ordering hack beside the
shared helper would have left the other three services tearing down telemetry before their own drain.
`Group.Cleanups` now stops runners in reverse registration order, then app stops. api, core and
websocket inherit it — see [overlay.md](./overlay.md) § Starting and stopping for what each gains.

**The orchestrator was undoing the drain.** Every Swarm `restart_policy` was `condition: on-failure`,
and a service asked to stop exits 0 — so Swarm read a clean shutdown as the task having finished its
work and left the service with no replacement. A worker sent SIGTERM outside a rolling update stayed
down until someone noticed. Ordering the stop correctly is worth nothing if nothing comes back.

All four anchors are `condition: any` now — the two in the app fragment, the data one and the
observability one, kept uniform. Nothing there can keep a stack alive that was meant to go, because
shutdown removes services rather than stopping them, and a removed service has no task to restart.
Failure behaviour is unchanged. This is stack YAML rather than worker code, but it was found by
testing this stage and the stage is not true without it.

**Known gap.** The stop sequence is guarded by two tests, but neither can execute the start phases —
they open Mongo, Redis, NATS and an object store — so a runner moved from one phase to another would
change the order without failing anything. Source-line order in `app.go` is not registration order
either: the phase functions are defined in a different order than `run()` calls them, so reading the
file cannot substitute. Closing this means making the registration order data rather than something
that emerges from where a `g.Add` happens to sit, which is a design change and is not done.

### Stage B — A task handler stops naming asynq

Decide the handler signature a task package sees, and adapt at the mux instead of in every task.
Settle the terminal-error vocabulary question in the same stage, since `archivedjobs` is where both
land.

The asynq envelope went with it. Once the mux decodes, the `task_type` it would have decoded *from*
has no reader left — every site needing the type already calls `asynq.Task.Type()`, which is what the
mux routes on. So `Enqueue` stops building a payload and passes the request through, and the request
the publisher wrote is the payload from end to end.

**Two publish helpers were lying.** `PublishRollbackSDEVersion` and `PublishRebuildCurrentSDEVersion`
each took a `buildNumber`, marshalled it, and were served by handlers that never read it — both work
from what the store says is current. Nothing called either helper; the tasks are invoked from the
operator CLI, which sends them no payload. They are now `TriggerRollbackSDEVersion` and
`TriggerRebuildCurrentSDEVersion`, which is what they always did.

### Stage C — The kernel gets a name that says what it holds

Move `TaskDependencies` and payload decoding out of `worker/tasks/esi` into a home named for what it
is, and convert every importer. No forwarding shim in `tasks/esi`.

Runs after B: B changes what the decoding surface looks like, and moving it first would mean moving
it twice. By the time C ran, B had already deleted the decoding, so what moved was the dependency bag
and the retry accessor.

**Landed as `worker/taskrun`** — what a task has while it runs: `Dependencies` (renamed from
`TaskDependencies`, which stuttered against the package), `FromClients`, and `Current`. Thirty
files now import it. `worker/tasks/esi` keeps only ESI tasks and has one importer left, the mux, and
was renamed `package esi` to match its directory so the alias every call site carried is gone.

### Stage D — Registration comes from the registry

Drive handler wiring from task definitions so a task is declared once. Taken **with**
[`../task-dispatch/`](../task-dispatch/plan.md) Stage D, which refused unknown tasks in the same
resolution path.

The registry decides the set of handlers rather than the handlers being a second list to keep in
step. `mount` walks `Tasks()` and refuses to build a mux that does not cover it exactly, in either
direction.

### Stage E — Collapse the duplicate dependency bag

Reduce the four representations to as few as the package boundaries genuinely require, and put the
result where both the composition root and the mux can name it.

**Two remain, and that is the floor.** `stackservices.Clients` is what connecting returns;
`taskrun.Dependencies` is what a task works through, and it is not the same thing — it adds the ESI
client and the entity cipher, which the connect bag does not carry. The composition root builds the
second from the first once, in `prepare`.

`SetupServer` and `SetupHandlers` take `*taskrun.Dependencies`. The subscriber takes the NATS handle
and the asynq client, which is all it ever used. `worker/main.go` is left as the entrypoint and
nothing else.

## Verified on the running stack

Every stage was checked against the live Swarm on the rebuilt images, not only in tests.

| Claim | What the stack showed |
|-------|-----------------------|
| The registry covers the handlers | The worker boots; a mismatch refuses to start |
| Queue weights come from one declaration | `"queues":{"priority_1":20,…}` in the startup log |
| A trigger runs end to end | `drainAccountStatsRebuildQueue` published, enqueued, completed |
| A request survives the collapsed envelope | `rotateRefreshTokenKeys` completed carrying `account_id`, `dry_run`, `active_version` |
| Deadlines come from the definition | That task ran under 19m59s, its own value, not the deleted 60s default |
| Request identity crosses services on headers alone | An api-published `updateAccountSessionGrants` carried `request_id 308d4009…` from the HTTP request through to the worker's log line |
| Stop order | `Stopping processor` precedes `Starting graceful shutdown`; drain budget 29.4s = `DrainTimeout` + 5s |
| A stopped service returns | SIGTERM replaced in ~10s, boots clean, processes tasks |

Over half an hour of ordinary traffic: 23 tasks completed across five task types, **0 failed, 0
nacked, 0 redelivered**, no warnings and no errors.

One artifact worth keeping: `priority_4` holds 15 archived `refreshMarketPrices` tasks from 23 August,
all archived in the same second with `handler not found`. Their stored payload is the double envelope
this project removed. A message like that would now be refused at the subject lookup instead, so the
same mistake fails where it can be read.

## Wire compatibility

**Every stage is process-local.** Nothing here changes a published message, a subject, a stored
document, or an operator command. `capacity-controller`'s `asynq.Inspector` reads and core's
`asynq_queues` / `asynq_purge` commands see the same Redis keys throughout, because the queue names
and the asynq payload shape are untouched.

Stage A changes observable *behaviour* at shutdown — that is the point of it — but not a contract.

## Go modernization in the touch surface

`go fix -diff ./worker/...` at planning reports one in-scope suggestion: `errors.As` →
`errors.AsType` in `worker/tasks/sde/update/httpget.go`. That file is **owned by
[`../go-127-adoption/`](../go-127-adoption/plan.md)**, whose sweep already counts the worker's four
files. Do not duplicate it here; if that project has not reached the worker when Stage B opens the
package, land it as part of that project's slice rather than folding it into this one.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | Done |
| A — shutdown order | Done |
| B — a task handler stops naming asynq | Done |
| C — the kernel gets a name | Done |
| D — registration from the registry | Done |
| E — collapse the duplicate dependency bag | Done |

## Handoff

**Every stage has landed, and the result runs.** What is left is not stage work:

- **Promotion is drafted and waiting for go-ahead** → [promotion.md](./promotion.md). It names every
  live page this owes, what each change replaces, and the text to fold in, so promoting is folding
  rather than writing. Five pages are affected, and one of them — `backend/shared/nats.md` — is also
  owed an edit by [`../task-dispatch/`](../task-dispatch/plan.md); whichever lands second reads the
  other's edit rather than assuming the old text.
- The stop-order tests cannot see a runner moved between start phases; closing that means making
  registration order data rather than emergent. See the known gap under Stage A.
- Tasks needing Mongo are outside the end-to-end harness. `testing/mongolive` is the route, at the
  cost of those runs needing a live stack.

**No open decisions.**
