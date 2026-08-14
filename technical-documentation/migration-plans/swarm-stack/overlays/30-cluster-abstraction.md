# #30 — Cluster state abstraction (capacity controller)

**Roadmap:** [../roadmap.md](../roadmap.md) `#30`  
**Pack:** [../18-capacity-controller/cluster-api.md](../18-capacity-controller/cluster-api.md)  
**Status (mirror):** done — Fake + Swarm Observe/Scale + Cordon/Drain/Uncordon via `ws.command.*` (Phase C 2026-08-09)  
**Code:** [`services/capacity-controller/cluster`](../../../../services/capacity-controller/cluster/)  
**Not live SoT.**

## What changed

- `Cluster` interface + `State` / `RoleState` / `BackendState`
- `Fake` recording Scale/Cordon/Drain/Uncordon
- Phase B: `cluster.Swarm` via `capacity-docker-proxy` — Observe + Scale
- Phase C: Swarm Cordon/Drain/Uncordon → NATS Request `ws.command.*`

## How this part works after the change

`policy` imports `cluster` types only (no Moby). Fake used by #27 / executor tests. Production adapter is Swarm (Moby for Scale; NATS for planned WS commands).

## Still open

_None for #30 interface body. Pin/move later if reopened._

## Missing live SoT discovered mid-work

_None until promote._

## Notes / decisions

- Do **not** import `deployment-tool`.
- Do not let Moby types leak into `policy/`.
