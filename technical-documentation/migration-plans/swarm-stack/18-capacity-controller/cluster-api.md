# Cluster API (#30)

**Roadmap:** #30 / #18  
**Phase:** A fake; B Moby Swarm; C NATS Cordon/Drain/Uncordon

## Where / how (today)

`cluster.Cluster` interface + live **`cluster.Swarm`**: Moby Observe/Scale via capacity proxy; **Cordon/Drain/Uncordon** via NATS Request on `ws.command.*`. Recording Fake for tests: [`testing/capacity_controller/clusterfake`](../../../../services/capacity-controller/cluster/clusterfake/). Deployment Tool still mutates Swarm via **Moby** for `eip sync`. App services must not import `deployment-tool`.

## Correctness need

- Policy must not depend on Moby types.
- Dry-run (#27) needs a recording impl.
- Production Apply uses the capacity socket proxy only (Scale) + mesh NATS (planned WS commands).

## Trade-offs

Duplicating thin inspect/scale helpers vs sharing with DT: **duplicate or future `services/shared`** — never import DT.

## Outcome

**Locked** (Phases A–C landed).

```go
type Cluster interface {
    Observe(ctx context.Context) (State, error)
    Scale(ctx context.Context, svc Service, desired int) error
    Cordon(ctx context.Context, containerID string) error
    Drain(ctx context.Context, containerID string) error
    Uncordon(ctx context.Context, containerID string) error
}

type State struct {
    Services map[Service]ServiceState
}

type ServiceState struct {
    DesiredReplicas int
    Running         int
    Backends        []BackendState
    QueueDepth      int // worker: Asynq pending; 0 if unknown
    ActiveTasks     int // worker: Asynq active (for thresholds)
    Concurrency     int // worker per-process concurrency from YAML
    Managed         bool
    Min, Max        int
    Cooldown        CooldownState // per-service Apply hysteresis
}

type BackendState struct {
    ContainerID       string
    Clients           int
    Soft, Full, Draining bool
    Healthy, Ready    bool
    HostedTenantCount int // count only
}
```

- **Swarm impl:** Moby client via `DOCKER_HOST=tcp://capacity-docker-proxy:2375`. Service names `eip_worker` / `eip_websocket` / `eip_api` (stack-prefixed as deployed). No `docker` CLI. Cordon/Drain/Uncordon = NATS `ws.command.*` ([nats-control-plane.md](./nats-control-plane.md)); not Moby kill. `ObserveService` + Redis cooldown keys `eip:capacity:cooldown:v1:{service}` for per-service loops.
- **Hard boundary:** `services/capacity-controller/**` must not import `eve-industry-planner/deployment-tool/...`.
- **Fake/recording:** `services/capacity-controller/cluster/clusterfake` — in-memory State + append-only Apply log (includes Uncordon); not in the product binary.
- Grow `Pin` / tenant move later — not in v1 interface body.
