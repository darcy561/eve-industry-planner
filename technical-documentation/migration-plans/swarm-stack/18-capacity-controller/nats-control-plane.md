# NATS control plane

**Roadmap:** #18 / #21  
**Phase:** B health bus; C **done** — ws.command + eip exec

## Where / how (today)

- [`orchestrationprobes.StartBus`](../../../../services/shared/orchestrationprobes/bus.go): `Enabled: true` on api/worker/websocket/core (+ controller self-bus); `StatusFill` fills additive [`HealthStatus`](../../../../services/shared/core/nats/messages.go) fields.
- Controller Observe scatter-gathers `health.command.ping`.
- Placement pub/sub `ws.placement.state` unchanged (ws-router).
- Planned WS control: `ws.command.cordon` / `drain` / `uncordon` (req/reply; no queue group). Websocket `StartWSCommandBus` → `PlannedCordon` / `PlannedDrain` / `PlannedUncordon`.
- Host **`eip capacity …`** → Moby exec → `capacity-controller ctl …` (same class as `eip cli`). NATS stays mesh-only on `eip-core`.

## Correctness need

- Controller needs on-demand per-instance status without Redis place keys.
- Planned evacuate must target a live `container_id` without SIGTERM-only roll drain.
- Host `eip` must not require publishing NATS to the host.

## Trade-offs

Moby exec for operator verbs matches `eip cli`; keeps NATS off the host attack surface. Optional in-mesh `capacity.command.*` still useful for sims.

## Outcome

**Locked** (landed through Phase C).

### Controller → fleet (Observe)

- Enable `StartBus` when Observe needs it.
- Controller Requests `health.command.ping` (scatter-gather; no queue group on responders).
- Expand [`HealthStatus`](../../../../services/shared/core/nats/messages.go) additively (`omitempty`):

```go
// Additive fields (sketch):
AppVersion string
Clients int; Soft, Full, Draining bool  // websocket
HostedTenantCount int                   // count only — not id list
ActiveTasks int                         // worker optional
```

- Bus gains a status hook so apps fill fields without `orchestrationprobes` importing websocket/worker.
- **Not in reply:** hosted-tenant id lists, place map, Docker task JSON, secrets.

### Controller → websocket (Phase C landed)

- Subjects `ws.command.cordon` / `drain` / `uncordon` (req/reply).
- Payload includes target `container_id`; responder handles only if `container.ID()` matches; Responds ack.
- Distinct from roll `DrainForRoll` (SIGTERM) — planned evacuate uses these commands.
- Semantics: **Cordon** = soft-stop (placement draining + upgrade refuse; Ready stays OK); **Drain** = kick clients; **Uncordon** = clear planned soft-stop when not mid roll/kick.

### Host `eip` → controller

- **Moby exec** into running capacity-controller task (`capacity-controller ctl …`) — same class as [`core_cli.go`](../../../../deployment-tool/internal/ops/core_cli.go). Verb: **`eip capacity`**.
- **Reject:** publish NATS to host for operator verbs; Traefik capacity admin HTTP.
- `eip` must not ServiceUpdate/scale managed elastic services itself when controller owns them.

### Optional in-mesh → controller

- `capacity.command.*` (status / plan / evacuate / cordon / uncordon) — lease holder Responds; for #29 sims / mesh callers. **Not required for `eip`.**

### Division

| Path | Owner |
|------|--------|
| `ws.placement.state` | Streaming for **ws-router** |
| `health.command.ping` | On-demand census for **controller** |
| `ws.command.*` | Planned cordon/drain/uncordon |
| Moby exec (`eip capacity`) | Host **eip** operator verbs |
