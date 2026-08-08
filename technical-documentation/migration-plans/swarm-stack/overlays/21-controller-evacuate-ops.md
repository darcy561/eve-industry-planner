# #21 — Controller evacuate / pin / cordon ops (via #18 / `eip`)

**Roadmap:** [../roadmap.md](../roadmap.md) `#21`  
**Status (mirror):** partial — automatic SIGTERM roll drain **landed** under #2 / #8; armed controller/`eip` ops still open  
**Not live SoT.** On overlap with live docs, this overlay wins until promote. Placement behaviour SoT: [ws-router.md](../../../backend/ws-router/ws-router.md), [websocket.md](../../../backend/websocket/websocket.md).

## What changed

- Placement signal plane under **#2**: memory place + NATS `PlacementState` (soft/full/clients/draining).
- Automatic roll drain: websocket `DrainForRoll` publishes `draining`; router hard-skips; clients reconnect — **prerequisite**, not this ticket’s ops surface.
- Soft divert / full hard-skip: NATS flags.

## How this part works after the change (target)

**#18 capacity controller** owns the write path for planned evacuate / pin / cordon / move. **`eip`** is the operator front door to that controller. Ops target **live container ids**; clients reconnect; router re-places. Slot-across-replace vocabulary is rejected.

## Still open

- Armed evacuate / move / pin / cordon verbs on **#18**, exposed via **`eip`**.
- Scale-in playbook: controller evacuates a hot backend before `service scale` down.
- Cross-replica census for “who hosts what” → **parked** on **#18** / this ticket (not needed for #20 selective pull).

## Missing live SoT discovered mid-work

_Draft here in live-doc shape when ops surface lands. Promote with the rest._

## Notes / decisions

- Prefer reconnect over live TCP migrate.
- Instant reassign on connect remains crash/miss fallback — not a substitute for planned evacuate.
- No parallel script/Redis writer beside the controller.
