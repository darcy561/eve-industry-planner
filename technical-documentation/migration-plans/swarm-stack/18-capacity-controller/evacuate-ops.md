# Evacuate / cordon ops (#21)

**Roadmap:** #21 / #18  
**Phase:** C **done** 2026-08-09 (**pin/move scrapped for now**)

## Where / how (today)

- Automatic SIGTERM roll drain + NATS `draining` (#2 / #8) unchanged.
- Planned path: NATS `ws.command.cordon|drain|uncordon` → websocket `PlannedCordon` (soft-stop, Ready OK) / `PlannedDrain` (kick) / `PlannedUncordon`; `StartWSCommandBus`.
- Controller: `cluster.Swarm` Cordon/Drain/Uncordon via NATS Request; Evaluate scale-in playbook **cordon → drain → scale**; test Fake (`clusterfake`) records Uncordon.
- Operator: `capacity-controller ctl status|plan|cordon|uncordon|drain|evacuate`; host **`eip capacity …`** Moby-exec into ctl.
- Evacuate / automatic Apply: gated by **`capacity_controller_managed`** (template default true). Operator `eip capacity evacuate` is a one-shot WS scale-in. **Pin/move scrapped for now.** Census parked.

## Correctness need

- Safe WS scale-in: do not cold-kill a hot alliance.
- Ops target live **container ids**, not slot ordinals.
- Prefer reconnect over live TCP migrate.

## Trade-offs

Evacuate path is enough for v1 scale-in. Hosted id census not required to evacuate a known container_id.

## Outcome

**Locked** (Phase C landed).

- Scale-in playbook: **Cordon** → **Drain** (via `ws.command.*`) → wait `clients == 0` or websocket PlannedDrain ack (`lifecycle.AppStopGrace`) → Moby **Scale(desired−1)**.
- Tie-break which backend to remove: prefer **draining+empty**, else **lowest clients**, else **newest task**.
- Operator verbs via **`eip capacity`** (Moby exec) → capacity-controller ctl: evacuate / cordon / uncordon / drain / status / plan.
- Optional in-mesh `capacity.command.*` for sims — not the host `eip` path.
- **Pin / move tenant: scrapped for now** (do not implement until explicitly reopened).
- Keep websocket `capacity_controller_managed` as the per-role kill-switch (`false` pauses automatic Apply).
