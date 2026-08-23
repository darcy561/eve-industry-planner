# Drain / please_reconnect

**Roadmap:** #2 — Replica identity  
**Related:** [soft-full-cordon.md](./soft-full-cordon.md) (soft/full = growth / refuse-new; drain = empty existing), [place-pin.md](./place-pin.md)  
**Live SoT:** [websocket.md](../../../backend/websocket/websocket.md)  
**Code anchors:**
- [`services/websocket/server/drain.go`](../../../../services/websocket/server/drain.go) — `DrainForRoll`, force-close
- [`services/websocket/server/placement_flags.go`](../../../../services/websocket/server/placement_flags.go) — publish `draining`
- Client / soak: `please_reconnect` in [`testing/ws_soak/lib`](../../../../testing/ws_soak/lib) (CLI: [`testing/ws_soak`](../../../../testing/ws_soak))

**History:** Redis drain PUBLISH / cordon-key watchers were retired under #2. Roll drain is local SIGTERM + NATS `draining`. Armed evacuate ops → **#21 / #18**.

## Where it is used

- Local `DrainForRoll` (SIGTERM / start-first replace): publish draining → delete JetStream durables → stop intake → flush outbound → kick locals → stop workers.
- `please_reconnect` / force-close targets **this** process’s clients.
- Router hard-skips backends with `PlacementState.draining`.

## How it is used

1. Process enters drain (SIGTERM or future evacuate op).
2. NATS marks this `container_id` draining; Ready fails; upgrades refused.
3. Force-close local clients (best-effort `please_reconnect`, then Close).
4. Clients reconnect through the router; memory place + eligibility pick a new home.

## Does it require a stable identity?

**No — instance-specific.** Drain means “empty **this** running process.” Slot-stable ids risk a leftover signal hitting a replacement.

## Outcome

**Locked.**

- **Job:** empty this running websocket instance and divert new homes away while it drains.
- **Stable slot identity required?** **No.**
- **Contract:** draining flag / own-id checks use the same container-id scheme as place/registry.
- **Ops vocabulary:** no “drain slot N across replace”; resolve live container id. Local SIGTERM needs no slot name.
