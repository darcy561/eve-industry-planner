# #21 — Controller evacuate / pin / cordon ops (via #18 / `eip`)

**Roadmap:** [../roadmap.md](../roadmap.md) `#21`  
**Pack:** [../18-capacity-controller/evacuate-ops.md](../18-capacity-controller/evacuate-ops.md) · [nats-control-plane.md](../18-capacity-controller/nats-control-plane.md)  
**Status (mirror):** partial — Phase C evacuate/cordon/drain/uncordon + `eip capacity` **landed** 2026-08-09; Phase D promote **done**; pin/move + census still open; WS managed soak deferred  
**Not live SoT for remainders.** Prefer live: [websocket.md](../../../backend/websocket/websocket.md), [verbs.md](../../../deployment/deployment-tool/cli/verbs.md).

## What changed

- Placement signal plane under **#2**: memory place + NATS `PlacementState` (soft/full/clients/draining).
- Automatic roll drain: websocket `DrainForRoll` publishes `draining`; router hard-skips; clients reconnect — **prerequisite**, not this ticket’s ops surface.
- Soft divert / full hard-skip: NATS flags.
- **Phase C (2026-08-09):** `ws.command.cordon|drain|uncordon`; `PlannedCordon` (soft-stop, Ready OK) / `PlannedDrain` (kick) / `PlannedUncordon`; controller Swarm + Evaluate scale-in playbook; `capacity-controller ctl` + **`eip capacity`** Moby-exec. Automatic Apply needs `capacity_controller_managed: true`.

## How this part works after the change

**#18 capacity controller** owns the write path. **`eip capacity`** reaches the controller via **Moby exec** (not host NATS). Planned cordon/drain/uncordon uses mesh `ws.command.*` to a live `container_id`. Scale-in: cordon → drain → scale. WS YAML stays unmanaged until soak.

## Still open

- Pin / move tenant verbs  
- Cross-replica hosted id census (**parked**)  
- Flip `services.websocket.capacity_controller_managed` after soak  

## Missing live SoT discovered mid-work

_Promoted 2026-08-09 (planned cordon/drain vs roll drain; `eip capacity`)._

## Notes / decisions

- Prefer reconnect over live TCP migrate.
- Instant reassign on connect remains crash/miss fallback — not a substitute for planned evacuate.
- No parallel script/Redis writer beside the controller.
- No publishing NATS to the host for operator verbs.
- Product comments: current-behaviour only (no Phase/# cites).
