# Place / pin (ws-router)

**Roadmap:** #2 — Replica identity  
**Related:** [soft-full-cordon.md](./soft-full-cordon.md), [drain.md](./drain.md)  
**Live SoT:** [ws-router.md](../../../backend/ws-router/ws-router.md)  
**Code anchors:**
- [`services/ws-router/`](../../../../services/ws-router/) — memory place + eligibility
- [`services/shared/wsplacement/keys.go`](../../../../services/shared/wsplacement/keys.go) — cookies only (`AffinityCookie` / `StickyCookie`)

**History:** Redis place/pin keys were retired under #2.

## Where it is used

- Router holds an **in-memory** map `affinity → container_id`.
- Affinity key comes from cookie `eip_tenant_affinity` (sticky `eip_ws_affinity` is fallback only).
- Backend registry keys are `container.ID()` / Docker `ContainerID[:12]`.
- Armed **pin / evacuate** ops surface is still open on **#21 / #18** (target live container ids; not Redis keys).

## How it is used

1. Resolve affinity from cookie (or sticky fallback).
2. If place hit and home still preferred (eligible ∩ newest bake, not full/draining) → stick (even if soft).
3. Else reassign: prefer non-soft among preferred; among that set pick **lowest live clients**; update memory place.
4. Proxy upgrade to `taskIP(container_id):4001`.

Place map is process memory — lost on router restart → clients reconnect and re-place.

## Does it require a stable identity?

**No.** Stale place → detect → reassign is correct. Ops “pin to websocket-1 across replaces” is **rejected**.

## Outcome

**Locked.**

- **Job:** map tenant affinity to a live backend `container_id`.
- **Stable slot identity required?** **No.**
- **Contract:** place values and registry keys use the same container-id scheme.
- **Ops vocabulary:** target the **current** container id only.
