# #18 — Capacity controller (singleton Swarm service)

**Roadmap:** [../roadmap.md](../roadmap.md) `#18`  
**Decision pack:** [../18-capacity-controller/](../18-capacity-controller/) (Phase 0 Outcomes **locked** 2026-08-09)  
**Status (mirror):** partial — Phases A–D landed; remainders = WS managed soak + pin/move  
**Live SoT promoted** 2026-08-09 — prefer [stack.md](../../../stack/stack.md), [config.md](../../../stack/config.md), [network.md](../../../stack/network.md), [verbs.md](../../../deployment/deployment-tool/cli/verbs.md), [websocket.md](../../../backend/websocket/websocket.md), [testing/services/capacity-controller.md](../../../testing/services/capacity-controller.md).

## What changed

- **Phase 0 pack** locked Outcomes.
- **Phase A (2026-08-09):** `services/capacity-controller/{config,cluster,policy,executor}` — YAML load, `cluster.Fake`, pure Evaluate + fixtures, Apply arm/managed gating.
- **Phase B (2026-08-09):** Swarm `capacity-controller` + `eip-docker-capacity` / `capacity-docker-proxy` (`POST=1`); bake target; lease `lease:capacity:primary`; cooldown `eip:capacity:cooldown:v1`; `cluster.Swarm` Observe/Scale; health bus Enabled + StatusFill; policy Swarm config `eip_config_yaml` → `/etc/eip/eip.config.yaml`; Prom → obs. (**Later:** removed global arm env; managed YAML only.)
- **Phase C (2026-08-09):** NATS `ws.command.cordon|drain|uncordon`; websocket `PlannedCordon` / `PlannedDrain` / `PlannedUncordon` + `StartWSCommandBus`; Swarm Cordon/Drain/Uncordon via NATS Request; Evaluate scale-in cordon→drain→scale; `ctl` + **`eip capacity`** Moby-exec. WS still unmanaged by default.
- **Phase D (2026-08-09):** #29 Fake management sim + CI path; **promote** live stack/backend/DT/testing docs.

## How this part works after the change

Lease holder: Observe → Evaluate → Apply → Wait (Apply skips unmanaged roles). Worker Scale when managed. Planned WS ops via mesh `ws.command.*`; host ops via `eip capacity` → ctl. Product comments stay current-behaviour only (no Phase/# cites).

## Still open

1. WS `capacity_controller_managed` soak / flip (careful)  
2. Pin / move tenant (follow-on)

## Missing live SoT discovered mid-work

_Promoted 2026-08-09 — see [promote/README.md](../promote/README.md)._

## Notes / decisions

- Do **not** widen `traefik-docker-proxy` / `ws-docker-proxy` for Apply.
- Do **not** import `deployment-tool` from `services/capacity-controller`.
- Default placement remains ws-router memory map (#2 / #4).
- Prom on obs ([prometheus-placement.md](../18-capacity-controller/prometheus-placement.md)) — supersedes roadmap decision 25 for controller rationale.
- Product code comments stay current-behaviour only.
- Run: `go test ./capacity-controller/...` from `services/`.
