# Worker service (`eip_worker`)

Live SoT for the **worker** service: per-process Asynq concurrency × Swarm replicas. Code: [`services/worker`](../../../services/worker/) (concurrency clamp: [`asynq/servers.go`](../../../services/worker/asynq/servers.go)). Networks → [network.md](../../stack/network.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Image | `ghcr.io/darcy561/eve-industry-planner-worker:${APP_VERSION}` | [`docker-stack.yml`](../../../docker-stack.yml) `services.worker.image` |
| Replicas | `1` (`EIP_WORKER_REPLICAS`, from config `min`) | Template: [`yamldefaults.DefaultConfig`](../../../deployment-tool/internal/kit/templates/yamldefaults/default.go). Live: `eip.config.yaml` |
| Capacity min / max | `1` / `5` | same (`services.worker.min` / `max`) |
| `concurrency` | `50` (`WORKER_ASYNQ_CONCURRENCY`) | same — binary hard-caps at `MaxConcurrency` **50** |
| `capacity_controller_managed` | `true` | same |
| Volume | `worker_data` → `/data` | stack YAML |
| Networks | `eip-core` only | [network.md](../../stack/network.md) |

Secret attach: `x-secrets-worker`. Full service block → `services.worker` in that YAML.

## Concurrency envelope

```text
cluster_inflight ≈ replicas × ResolveConcurrency(WORKER_ASYNQ_CONCURRENCY)
```

`ResolveConcurrency`: empty/invalid → `50`; values above `50` clamp to `50`. Raising **both** replicas and concurrency multiplies ESI/Redis pressure — prefer fixed concurrency `50` and scale replicas within max until the envelope is reopened in code.

## Traffic

```text
Asynq (Redis) → eip_worker-{slot}
                  probes :19100/ready
```

No Traefik route. Slot identity: `worker-{{.Task.Slot}}`.

## Health

| Endpoint | Role |
|----------|------|
| `GET :19100/healthy` | Liveness |
| `GET :19100/ready` | Readiness (Swarm healthcheck) — Redis Ping, NATS connected, Mongo Ping |

## Starting and stopping

Stops run in reverse of starts, so the worker stops **taking** work before it loses the ability to
**do** it:

```text
NATS intake → drain in-flight → command bus → probes → ESI → asynq client → telemetry → deps
```

The drain is bounded by `DrainTimeout` ([`asynq/servers.go`](../../../services/worker/asynq/servers.go)),
which is what asynq's `ShutdownTimeout` is set from; the server's fetch loop stops before the wait
begins, so the drain is finite. A task overrunning it is pushed back to Redis and runs elsewhere —
every task can already run twice, since both the queue and the stream redeliver. The per-step cleanup
budget is derived from that figure rather than chosen, because asynq's shutdown takes no context and a
shorter budget would not be enforced.

Swarm replaces a service that stops: `restart_policy` is `condition: any`, so a clean exit brings the
task back instead of reading as work completed → [stack.md](../../stack/stack.md).

## Running a task

```text
publisher ──► task.{area}.{name} ──► JetStream ──► subscriber ──► asynq queue ──► handler
```

**The subject names the task.** The subscriber resolves it through the registry rather than parsing
the last segment, so a subject no definition claims is refused terminally — running unknown work on a
guessed queue under a guessed deadline hid the case worth seeing, which is a task wired incompletely.
The queue and the deadline come from that definition; there is no default to fall back on.

**The payload is the request.** Asynq carries the task type in its own field, so nothing in the body
repeats it. A handler receives the decoded request, and a payload that is absent or will not decode is
refused at the mux before any handler runs.

**The registry decides the handler set.** A task with no handler, or a handler under a name no task
carries, stops the worker starting. Both were silent otherwise: asynq accepts a task it cannot route
and discards it, and a handler for no task is never reached.

**Saying work cannot succeed.** A handler returns `eipnats.Terminate(…)` — the same word the consumer
that carried the message uses — and the mux translates it for the queue, which archives the task
instead of retrying. Any other error is retried under the queue's backoff.

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

