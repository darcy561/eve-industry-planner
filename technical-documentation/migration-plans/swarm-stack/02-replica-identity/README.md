# #2 — Replica identity decision pack

**Roadmap:** [../roadmap.md](../roadmap.md) `#2`  
**Overlay pointer:** [../overlays/02-replica-identity.md](../overlays/02-replica-identity.md)  
**Design plan:** Gates 1–3 locked — SoT = hostname / `ContainerID[:12]`; helper `container.ID()`; telemetry **`service.instance.id` only** (drop `ws_instance_id`); retire stack `OTEL_SERVICE_INSTANCE_ID` as identity SoT.  
**Resolver (Phase A landed):** [`container.ID()`](../../../../services/shared/container/id.go) from `HOSTNAME`. Telemetry: `service.name` + `service.instance.id` only.

Each doc separates:

1. **Where / how** it is used today (facts)
2. **Does it require a stable identity?** — for **correctness** (routing, delivery, fencing), not habit
3. **Why might stable still be desirable?** — operations / correlation / continuity
4. **Outcome** — locked after discussion

Do not treat historical “we set OTEL slot ids for JetStream” as a requirement — JetStream Outcome rejects slot-stable suffix. Design / rename follows Outcomes + gates.

**Principle (from [ws-container-id](./ws-container-id.md) Outcome):** one shared identifier existed because it was convenient. Each consumer must justify the kind of identity it needs rather than inheriting the same value by default.

## Vocabulary (locked)

| Concept | Canonical name | Do not call it |
|---------|----------------|----------------|
| Process / placement identity | **`container_id`** / Go `ContainerID` / `container.ID()` | slot, replica id as SoT |
| Router view of a websocket task | **`backend`** keyed by `ContainerID` | slot |
| Per-replica capacity thresholds | **`client_cutoff`**, **`target_clients`** (env `WS_CLIENT_CUTOFF` / `WS_TARGET_CLIENTS`) | slot cutoff / slot target |
| Swarm replica ordinal | **`Slot`** (Docker task JSON only; assigned gate) | identity |
| Placement signals | NATS `ws.placement.state` + `GET /placement` (`PlacementState`) | Redis placement flags |
| Place map | In-memory on ws-router (`affinity → container_id`) | Redis place/pin keys |

**Promote drafts (live-doc shape):** [../promote/README.md](../promote/README.md).

## Working correctness sketch (locked Outcomes)

| Consumer | Stable id required for correctness? |
|----------|--------------------------------------|
| [place-pin](./place-pin.md) | **No** — compare place↔registry; stale→reassign; ops slot-across-replace vocab → live SoT (promoted) |
| [soft-full-cordon](./soft-full-cordon.md) | Soft/full/cordon: **instance-specific**; cordon=no-new/keep-existing (refactor kick) |
| [drain](./drain.md) | **No** — instance-specific; must not inherit across replace |
| [jetstream-durables](./jetstream-durables.md) | **No** — unique instance suffix; create/stop cleanup + inactive policy follow-on (#20-ready) |
| [otel-metrics](./otel-metrics.md) | **No** — `service.instance.id` = container id; stack **env** retired; no parallel `ws_*` label |
| [ws-container-id](./ws-container-id.md) | **No** — ephemeral container id; surfaced as `service.instance.id` |
| [probes-bus](./probes-bus.md) | **No** — same container id / `service.instance.id` family |
| [leases](./leases.md) | **No** — unique instance id as holder; invalid on replace |

## Files

| Doc | Consumer |
|-----|----------|
| [place-pin.md](./place-pin.md) | ws-router memory place (`affinity → container_id`) |
| [soft-full-cordon.md](./soft-full-cordon.md) | NATS/`PlacementState` soft / full / clients / draining |
| [drain.md](./drain.md) | `DrainForRoll` + draining flag + `please_reconnect` |
| [jetstream-durables.md](./jetstream-durables.md) | JetStream durable names |
| [otel-metrics.md](./otel-metrics.md) | OTel `service.instance.id` + Prom series (env SoT retired) |
| [ws-container-id.md](./ws-container-id.md) | Process/container identity → `service.instance.id` — [stub](./ws-instance-id.md) for old `ws_instance_id` |
| [probes-bus.md](./probes-bus.md) | Orchestration probes bus `InstanceID` |
| [leases.md](./leases.md) | Redis lease holder id |

## Outcome checklist

- [x] place-pin
- [x] soft-full-cordon
- [x] drain
- [x] jetstream-durables
- [x] otel-metrics
- [x] ws-container-id (was ws-instance-id)
- [x] probes-bus
- [x] leases
