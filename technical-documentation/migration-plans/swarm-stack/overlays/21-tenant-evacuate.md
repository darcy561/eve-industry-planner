# #21 — Tenant rebalance / evacuate / move (WS placement control plane)

**Roadmap:** [../roadmap.md](../roadmap.md) `#21`  
**Status (mirror):** partial — Redis place/cordon/pin/drain overlays **retired by #2**; SIGTERM drain + NATS `draining` **landed** (#2 / #8); armed evacuate/pin ops still open  
**Not live SoT.** On overlap with live docs, this overlay wins until promote. Placement behaviour SoT: [ws-router.md](../../../backend/ws-router/ws-router.md), [websocket.md](../../../backend/websocket/websocket.md).

## What changed

- Historical Redis cordon/pin/drain PUBLISH path removed under **#2** (placement signal foundation).
- Roll drain path: websocket `DrainForRoll` publishes `draining` on NATS; router hard-skips; clients get `please_reconnect`.
- Soft divert / full hard-skip: NATS `PlacementState` (not Redis keys).

## How this part works after the change

Default place = router memory + NATS flags (#2). Ops must target **live container ids**. Slot-across-replace vocabulary is rejected.

## Still open

- Armed evacuate / move / pin / cordon verbs on **#18** / `eip` (do not restore Redis placement keys).
- Scale-in playbook that evacuates a hot backend before `service scale` down.
- Cross-replica census for “who hosts what” → **#20 / #18**.

## Missing live SoT discovered mid-work

_Draft here in live-doc shape when ops surface lands. Promote with the rest._

## Notes / decisions

- Prefer reconnect over live TCP migrate.
- Instant reassign on connect remains crash/miss fallback — not a substitute for planned evacuate.
