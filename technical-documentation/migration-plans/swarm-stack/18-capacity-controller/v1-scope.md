# v1 scope

**Roadmap:** #18 capacity controller track  
**Phase:** A–D landed; **docs promote complete** (live SoT matches code)

## Where / how (today)

`capacity-controller` Swarm service always Apply-capable. Gate is **`services.*.capacity_controller_managed`** (default **true** for worker / websocket / api). Apply v1: worker Scale; WS cordon/drain/scale-in when managed; **api plain Scale from websocket client load** (same reserve / underutilized thresholds). Operators set baselines via `eip.config.yaml` + `eip sync`. Soft divert: `target_clients` → `WS_TARGET_CLIENTS`. Live SoT → [capacity-controller.md](../../../stack/capacity-controller.md).

## Correctness need

- Docker mutations must not stampede or dual-mutate.
- WS scale-down must not cold-kill a hot backend (evacuate playbook).
- Lean installs (obs off) must still run the controller Evaluate path.

## Trade-offs

- Default managed-on for WS enables automatic scale-in; operators set `managed: false` per role to pause Apply.
- Api load signal is WS occupancy until api has its own request metric.

## Outcome

**Locked.**

- **Apply v1:** worker Scale and WS evacuate playbook when `capacity_controller_managed: true` (template default).
- **Api:** YAML default `managed: true`; Evaluate scales api from **websocket client load** (plain Scale, no drain).
- **Out of all Phases A–D until separately reopened:** hosted-tenant **id lists**, node-exporter headroom, Prom as Evaluate dependency, multi-node, global arm env.
- **Scrapped for now:** pin/move tenant verbs (not a remainder; reopen only with explicit go-ahead).
- **Prom:** on obs fragment ([prometheus-placement.md](./prometheus-placement.md)); not required for Evaluate.
- **Ops evidence:** WS managed capacity soak **signed off** 2026-08-09 (`capacity_soak -profile websocket -phase all` up+down after `wsClientPressure` underutilized fix).
