# #18 — Capacity controller (singleton Swarm service)

**Roadmap:** [../roadmap.md](../roadmap.md) `#18`  
**Status (mirror):** open — **no product packages in tree yet** (code-verified 2026-08-08)  
**Not live SoT.** On overlap with live docs, this overlay wins until promote.

## What changed

_Prep only (not this ticket’s deliverable):_ `eip.capacity.*` labels + `eip sync` ApplyCapacity; YAML kill-switch / reserve / scale_timing fields validated; Prometheus on data fragment; core lease pattern exists to reuse. **Missing:** `capacity-controller/` binary, Swarm service, `eip-docker-capacity` proxy network/service (stack YAML has traefik/ws proxies only).

## How this part works after the change

_Target (not live):_ dedicated Swarm singleton; Observe → Evaluate → Apply → Wait; packages `policy/` / `cluster/` / `executor/`; Docker mutations only via own socket proxy after #27/#30; evacuate/pin ops against live container ids (memory place + NATS placement flags).

## Still open

1. Finish #19 controller policy schema consume (read reserved YAML keys)
2. **#30** cluster Observe/Apply seam + fake/recording impl
3. **#27** dry-run / golden `policy.Evaluate` before arming
4. Service + `eip-docker-capacity` proxy in stack YAML
5. Lease-gated hot-swap + armed scale/drain/evacuate (#21)

## Missing live SoT discovered mid-work

_None until the service lands. Draft stack/network/verbs topics here first._

## Notes / decisions

- Do **not** widen `traefik-docker-proxy` / `ws-docker-proxy` for Apply.
- Default placement remains ws-router memory map (#2 / #4).
- Redis lease may gate controller leadership (same spirit as core) — that is not a placement key plane.
