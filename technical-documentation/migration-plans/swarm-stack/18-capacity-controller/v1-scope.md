# v1 scope

**Roadmap:** #18 capacity controller track  
**Phase:** A–D landed

## Where / how (today)

`capacity-controller` Swarm service always Apply-capable. Gate is **`services.*.capacity_controller_managed`** (default **true** for worker / websocket / api). Apply v1: worker Scale + WS cordon/drain/scale-in when managed; api Evaluate still holds. Operators set baselines via `eip.config.yaml` + `eip sync`. Soft divert: `target_clients` → `WS_TARGET_CLIENTS`.

## Correctness need

- Docker mutations must not stampede or dual-mutate.
- WS scale-down must not cold-kill a hot backend (evacuate playbook).
- Lean installs (obs off) must still run the controller Evaluate path.

## Trade-offs

- Default managed-on for WS enables automatic scale-in; operators set `managed: false` per role to pause Apply.

## Outcome

**Locked.**

- **Apply v1:** worker Scale and WS evacuate playbook when `capacity_controller_managed: true` (template default).
- **Api:** YAML default `managed: true`; Evaluate returns **hold** until a later phase adds api policy.
- **Out of all Phases A–D until separately reopened:** hosted-tenant **id lists**, pin/move verbs, node-exporter headroom, Prom as Evaluate dependency, multi-node, global arm env.
- **Prom:** on obs fragment ([prometheus-placement.md](./prometheus-placement.md)); not required for Evaluate.
