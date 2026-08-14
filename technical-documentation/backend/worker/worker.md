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

## Task dependencies

Worker Asynq handlers take `*TaskDependencies`, not `*stackservices.Clients`. Built at the asynq mux composition root via `FromClients(clients, esi)`.

| Field | Role |
|-------|------|
| `Mongo` | Shared `*eipmongo.Mongo` — [mongo.md](../shared/mongo.md) |
| `Redis` / `NATS` / `JetStream` | Stack clients for tasks that need them |
| `ObjectStore` | Static-data / SDE object backend |
| `ESIClient` | Rate-limited ESI HTTP |

