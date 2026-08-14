# Packages and reconciliation loop

**Roadmap:** #18  
**Phase:** A packages; B loop under lease; C cordon/drain Apply path

## Where / how (today)

`services/capacity-controller/`: `config/`, `policy/`, `cluster/` (**`Swarm`** Observe/Scale/Cordon/Drain/Uncordon), `executor/`, `ctl/`, `main` under **`lease:capacity:primary`**. Under the lease, **three parallel per-service loops** (worker / websocket / api). Recording Fake lives under `services/testing/capacity_controller/clusterfake` (tests only). Managed worker: Scale via proxy. Evaluate WS scale-in emits cordon → drain → scale; Swarm Apply uses NATS `ws.command.*` when managed. Operator ctl verbs + `eip capacity` Moby-exec.

## Correctness need

- Policy decisions must be deterministic and side-effect free (fixture-testable).
- Docker / NATS mutations must not live inside Evaluate.
- One lease holder only may Apply.

## Trade-offs

Three loops in one binary (not three Swarm services) keeps deploy simple while isolating per-service Observe → Evaluate → Apply + cooldown.

## Outcome

**Locked.**

Landed tree (Phases A–C + per-service loops):

```text
services/capacity-controller/
  main.go           // entry + ctl dispatch
  serve.go          // probes + lease → runServiceLoops
  runtime.go        // deps, policy watch, Swarm client
  loops.go          // errgroup shell + shared serviceLoop tick
  loop_worker.go    // workerLoop + applyWorker (scale)
  loop_websocket.go // websocketLoop + applyWebsocket (scale/cordon/drain)
  loop_api.go       // apiLoop + applyAPI (Scale linked to WS clients)
  ctl/              // status|plan|cordon|uncordon|drain|evacuate
  policy/           // EvaluateService / Evaluate (pure; no Moby imports)
  cluster/          // Cluster + Swarm (Moby Scale; NATS Cordon/Drain/Uncordon)
  // Fake → services/testing/capacity_controller/clusterfake (not product)
  executor/         // Scale / Cordon / Drain helpers (managed gate)
  config/           // YAML load/validate (mirror of eip.config capacity fields)
```

Per-service loop (lease holder):

1. `state := swarm.ObserveService(ctx, svc)`
2. `plan := policy.EvaluateService(svc, state, cfg, time.Now())`
3. service-owned apply (`applyWorker` / `applyWebsocket` / `applyAPI`) using shared executor helpers
4. on mutations → `RecordCooldown(svc)` → Redis `eip:capacity:cooldown:v1:{svc}`
5. `Wait` = max(tick, remaining cooldown / stabilization from plan)

`ctl plan` uses full `Observe` + merged `Evaluate` (no global cooldown gate).

**Types:**

```go
type Service string // "worker" | "websocket" | "api"

type Action struct {
    Service     Service
    Kind        string // "scale" | "cordon" | "drain" | "wait"
    Desired     *int
    ContainerID string
    Reason      string
}

type Plan struct {
    Actions     []Action
    WaitAtLeast time.Duration
    Summary     string
}
```

`policy` never imports `github.com/moby/*`. Cooldown/hysteresis is **per service** (`ServiceState.Cooldown` + YAML `scale_timing.cooldown`); executor does not invent policy.
