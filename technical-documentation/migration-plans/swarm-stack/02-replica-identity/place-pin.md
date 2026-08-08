# Place / pin (ws-router)

**Roadmap:** #2 — Replica identity  
**Code anchors:**
- [`services/ws-router/backends.go`](../../../../services/ws-router/backends.go) — `shortContainerID` / registry by `ContainerID`
- [`services/ws-router/proxy.go`](../../../../services/ws-router/proxy.go) — place / pin / reassign
- [`services/shared/wsplacement/keys.go`](../../../../services/shared/wsplacement/keys.go) — `eip:ws:place:v1:`, `eip:ws:pin:v1:`

## Where it is used

- Router builds a backend registry keyed by short container id (`ContainerID[:12]`), not raw IP alone as the sticky key.
- Redis **place** stores affinity → that id (`eip:ws:place:v1:{affinity}`).
- Redis **pin** stores ops override affinity → that id (`eip:ws:pin:v1:{affinity}`).
- Sticky cookie / pick path use the same registry keys.

## How it is used

1. Client hits ws-router with tenant affinity cookie.
2. If pin exists and pinned id is in the **eligible** set → route there and refresh place.
3. Else if place exists and home is in **preferred** (eligible + newest bake) → place hit (sticky, even if soft).
4. Else if place id is missing / not eligible (dead, cordoned, full, old bake) → **reassign**: pick a new home, `SET` place.
5. Later clients with the same affinity follow the updated place (or pin). Soft divert affects new homes; place-hit reconnects stay on home when still preferred.

## Does it require a stable identity?

No for correctness.

The router requires a backend identifier that can be **compared** between Redis affinity records (place/pin) and the live backend registry. Stable identity across container replacement is an optimization for retaining affinity references; it is not required for correctness because stale affinity entries are detected and reassigned.

What is required for a place/pin **hit** is string equality with a currently eligible backend. When the id is gone, reassign is the supported path. First reconnect rediscovers; subsequent clients follow affinity / new place.

## Why might a stable identity still be desirable?

Operational continuity only: quieter rolls, fewer mass rediscovers, ops vocabulary like “pin to websocket-1 across replaces.” That must not be mistaken for a system dependency on stable names.

Ops pin / cordon / drain **across** replaces via Swarm slot names is **rejected** (same as soft/full/cordon / drain Outcomes). Clean up operator docs and tooling language in #2 — do not teach “pin to websocket-1 forever.”

## Outcome

**Locked (discussion + design).**

- **Job:** map tenant affinity (and ops pin override) to a backend id the router can resolve in the live registry.
- **Stable slot identity required?** **No.** Non-stable / instance-keyed backends are acceptable. Stale place/pin → detect → reassign is correct behaviour, not a failure mode.
- **Contract:** Redis place/pin values and backend registry keys must use the **same** identifier scheme (`container.ID()` / `ContainerID[:12]`) so comparison works at request time. That scheme need not survive container replacement.
- **Ops vocabulary:** no separate slot id that outlives a container for pin/cordon/drain. Operators target the **current** container id. Live SoT / runbook wording lands with **promote drafts** (not blocking code phases).
- **Follow-on:** Soft/full/cordon and drain share the backend id scheme for string-match; identity stays instance-specific.
