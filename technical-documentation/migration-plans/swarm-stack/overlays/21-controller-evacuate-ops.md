# #21 — Controller evacuate / cordon ops (via #18 / `eip`)

**Roadmap:** [../roadmap.md](../roadmap.md) `#21`  
**Status (mirror):** **done** — evacuate/cordon/drain/`eip capacity` + WS soak sign-off. **Pin/move scrapped for now.** Census parked.  
**Prefer live:** [capacity-controller.md](../../../stack/capacity-controller.md), [websocket.md](../../../backend/websocket/websocket.md), [verbs.md](../../../deployment/deployment-tool/cli/verbs.md).

## What changed

- Phase C: `ws.command.*` + Evaluate scale-in + `eip capacity`.
- WS managed soak signed off after down-pressure fix (2026-08-09).
- **Pin/move scrapped for now.**

## Still open

- Cross-replica hosted id census (**parked**)

## Scrapped for now

- Pin / move tenant verbs
