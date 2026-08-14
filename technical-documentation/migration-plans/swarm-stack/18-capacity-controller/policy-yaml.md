# Policy YAML (#19 consume)

**Roadmap:** #19 / #18  
**Phase:** A load/validate; B hot-reload in service

## Where / how (today)

Schema SoT remains in [`deployment-tool/internal/config`](../../../../deployment-tool/internal/config/config.go); defaults in [`yamldefaults`](../../../../deployment-tool/internal/kit/templates/yamldefaults/default.go). `eip sync` applies min→replicas, concurrency, cutoff, `target_clients`, etc. Controller mirrors load/validate under `services/capacity-controller/config` (no DT import); Swarm mount + reload landed ([config-mount.md](./config-mount.md)). DT still does not drive Evaluate.

## Correctness need

- One operator YAML surface — no second policy file.
- Controller must not import deployment-tool packages ([config-mount.md](./config-mount.md)).

## Trade-offs

Managed+armed can fight manual `eip sync` min writes; document operator rule rather than invent a second sync mode in v1.

## Outcome

**Locked.**

| Key | Evaluate behaviour |
|-----|-------------------|
| `services.*.capacity_controller_managed` | false → never Apply for that service |
| `services.*.min` / `max` | clamp desired |
| Worker pressure | [worker-thresholds.md](./worker-thresholds.md) (per-queue `queue_scale_up_pct`) |
| `services.websocket.reserve_capacity` | scale-up when avg clients > `target_clients * (1 - reserve)` (Apply when managed) |
| Planned Drain wait | websocket `PlannedDrain` + `lifecycle.AppStopGrace` (controller waits for ack; no YAML `drain_timeout`) |
| `scale_timing.cooldown` | after Apply for a service, suppress further Apply **for that service only** until elapsed (Redis `eip:capacity:cooldown:v1:{service}`) |
| `scale_timing.scale_up_stabilization` / `scale_down_stabilization` | signal must be sustained before scale |

**Operator note:** when managed, controller owns desired replicas for that service; operators change min/max/policy via YAML; `eip sync` may still write labels/min but controller re-converges.
