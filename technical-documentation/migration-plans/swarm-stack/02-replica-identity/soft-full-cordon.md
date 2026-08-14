# Soft / full / draining (placement flags)

**Roadmap:** #2 — Replica identity  
**Related:** [place-pin.md](./place-pin.md), [drain.md](./drain.md)  
**Live SoT:** [websocket.md](../../../backend/websocket/websocket.md), [ws-router.md](../../../backend/ws-router/ws-router.md)  
**Code anchors:**
- [`services/websocket/server/placement_flags.go`](../../../../services/websocket/server/placement_flags.go) — publish `PlacementState`
- [`services/shared/core/nats`](../../../../services/shared/core/nats/) — `SubjectWSPlacementState`, `PlacementState`
- [`services/ws-router/`](../../../../services/ws-router/) — NATS + `GET /placement` reconcile

**History:** Redis soft/full/cordon keys were retired under #2. Flags are NATS/`PlacementState` now. Armed cordon/evacuate verbs → **#21 / #18**.

## Where it is used

Each websocket publishes instance-lifetime flags keyed by its `container_id`:

| Flag | Writer | Router effect |
|------|--------|---------------|
| `soft` | websocket (connected ≥ `target_clients`) | prefer non-soft for **new** homes; place-hit may stick |
| `full` | websocket (connected ≥ `client_cutoff`) | hard-skip + reassign; process refuses upgrades |
| `clients` | websocket live count | place-miss pick = lowest clients |
| `draining` | websocket on roll/evacuate drain | hard-skip; process refuses |

Signals: NATS `ws.placement.state` + refresh via `GET /placement`.

## How it is used

- Soft: advisory divert for new homes; does **not** remove from eligible; does **not** refuse upgrades.
- Full: hard skip + process refuse at cutoff; **existing clients stay**; Ready stays up.
- Draining: hard skip + refuse; emptying is `DrainForRoll` / evacuate kick ([drain.md](./drain.md)).

## Does it require a stable identity?

**No — and slot-stable is actively wrong.** Soft/full/draining describe **this container’s** live state. A replacement must not inherit the predecessor’s flags; instance-specific `container_id` avoids that.

## Outcome

**Locked.**

- **Job:** advertise this running websocket’s soft/full/clients/draining to the router.
- **Stable slot identity required?** **No** — instance-specific.
- **Contract:** `PlacementState` id matches place/registry `container_id`.
