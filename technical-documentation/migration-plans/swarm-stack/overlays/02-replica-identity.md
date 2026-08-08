# #2 — Replica identity contract (prod)

**Roadmap:** [../roadmap.md](../roadmap.md) `#2`  
**Status (mirror):** **done** (2026-08-07) — code + limits soak + live SoT promote  
**Live SoT:** [backend/websocket](../../../backend/websocket/websocket.md), [backend/ws-router](../../../backend/ws-router/ws-router.md), [stack/stack.md](../../../stack/stack.md) § Replica identity, [stack/config.md](../../../stack/config.md), [testing/services](../../../testing/services/websocket.md). Snapshot: [../promote/](../promote/README.md).

## Decision pack

Per-consumer where / how / why + Outcome (all locked):

→ **[../02-replica-identity/](../02-replica-identity/)**

## What changed

- Shared `container.ID()` from `HOSTNAME`; OTel `service.instance.id` only (dropped `ws_instance_id` / stack env identity SoT).
- JetStream durables / leases / probes use the same container id; graceful durable delete on roll drain.
- Placement signal plane: no Redis place/pin/soft/full/cordon/drain keys. Soft/full/clients/draining = NATS `ws.placement.state` + `GET /placement`. Place map = in-memory on ws-router (`affinity → container_id`).
- Place-miss pick = lowest live client count; prefer newest bake; hard-skip full/draining.
- `DrainForRoll`: draining publish → delete durables → stop intake → flush outbound → kick → stop workers.
- Env rename: `WS_TARGET_CLIENTS` / `WS_CLIENT_CUTOFF` (no `WS_SLOT_*`).
- Soak observes place via `connected.container_id` + NATS flags (Redis kept only for session seed). Limits soak recorded 2026-08-07 (soft divert 15/15, full probe 12/12).

## How this part works after the change

See live SoT paths above.

## Still open

None for #2. Pre-stop evacuate / pin ops surface → **#21 / #18** (live container ids; do not restore Redis placement keys).

## Missing live SoT discovered mid-work

Promoted 2026-08-07.

## Notes / decisions

See Outcomes in [../02-replica-identity/](../02-replica-identity/).
