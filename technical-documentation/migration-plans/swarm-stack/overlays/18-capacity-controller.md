# #18 — Capacity controller (singleton Swarm service)

**Roadmap:** [../roadmap.md](../roadmap.md) `#18`  
**Decision pack:** [../18-capacity-controller/](../18-capacity-controller/)  
**Status (mirror):** **done** — Phases A–D + docs promote + **WS managed soak signed off** (2026-08-09). **Pin/move scrapped for now.**  
**Live SoT:** [capacity-controller.md](../../../stack/capacity-controller.md) (+ stack/config/network/verbs/websocket/testing).

## What changed

- Phases A–D landed (controller, lease, Observe/Scale, `ws.command.*`, Evaluate, api←WS, `eip capacity`, Fake sim, promote).
- **Soak hang root cause (2026-08-09):** `wsClientPressure` only stamped down when `drainingEmpty` — chicken-and-egg blocked cordon. Fixed to stamp down on underutilized + desired>min. Evidence: `capacity_soak -profile websocket -phase all` scale-up + scale-down OK.
- **Pin/move scrapped for now.**

## How this part works after the change

Lease holder: Observe → Evaluate → Apply → Wait. Worker Scale; WS cordon→drain→scale-in; api plain Scale from WS clients.

## Still open

_None for #18 remainders._ Census parked elsewhere.

## Scrapped for now

- Pin / move tenant

## Notes / decisions

- Run: `go test ./capacity-controller/...` from `services/`.
- Ops soak → [testing/services/capacity-controller.md](../../../testing/services/capacity-controller.md).
