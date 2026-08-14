# Observe signals

**Roadmap:** #18  
**Phase:** A fixtures; B live Observe

## Where / how (today)

- Controller `cluster.Swarm.Observe`: Moby ServiceInspect/tasks + Redis `asynq.Inspector` + NATS `health.command.ping` + cooldown Redis + YAML.
- Apps (api/worker/websocket/core): `orchestrationprobes.StartBus` **`Enabled: true`** + `StatusFill` for additive `HealthStatus` fields.
- WS streaming flags still via `ws.placement.state` + `/placement` (router).
- Prometheus: **obs** fragment (not Evaluate SoT).

## Correctness need

- Evaluate must work with obs **off**.
- Missing queue depth must hold (no stampede), not invent load.

## Trade-offs

NATS health census for WS snapshots vs only placement pub/sub: health ping is on-demand for controller; placement stays streaming for ws-router.

## Outcome

**Locked.**

| Signal | Source v1 | Used for |
|--------|-----------|----------|
| Desired/running replicas | Moby ServiceInspect / tasks | all roles |
| Replica ready + container status | NATS `health.command.ping` expanded reply | healthy wait; WS clients/flags |
| Worker pressure | **Redis `asynq.Inspector` only** | worker scale |
| WS clients / soft/full/draining | Health census fields (+ placement for router) | WS Evaluate / Drain wait |
| Hosted-tenant **id list** | parked | later |
| Host / Traefik / Prom series | **not used by Evaluate** | dashboards / later |

If Asynq inspector fails → Evaluate hold + Summary reason.
