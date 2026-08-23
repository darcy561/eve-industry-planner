# #8 — Websocket rollout, affinity reconnect, and drain

**Roadmap:** [../roadmap.md](../roadmap.md) `#8`  
**Status (mirror):** **done** — product + soak + live SoT promote (2026-08-04); placement signal cutover completed under **#2**  
**Live SoT:** [websocket.md](../../../backend/websocket/websocket.md), [ws-router.md](../../../backend/ws-router/ws-router.md), [testing/services/websocket.md](../../../testing/services/websocket.md). Snapshot: [../promote/](../promote/README.md).

## What changed

| Claim | Landed |
|-------|--------|
| `stop_grace_period: 60s` on start-first app services | `docker-stack.yml` `x-app-stop-grace` |
| SIGTERM roll drain | `DrainForRoll` → draining publish → durable delete → kick locals → `Shutdown` |
| Soft divert / hard cutoff | `target_clients` → `WS_TARGET_CLIENTS`; `client_cutoff` → `WS_CLIENT_CUTOFF` via `eip sync` |
| Placement flags | NATS `PlacementState` + `GET /placement` (**#2** — not Redis keys) |
| Hosted-tenant query view | In-process `HostedTenants` / `HostsTenant` only — **no** Redis hosting mirror |
| Soak evidence | `testing/ws_soak` hold + limits (observe via `connected.container_id` + NATS) |

**History:** Early #8 drafts assumed Redis placement flags; **#2** cut over to memory place + NATS. Prefer live SoT above.

## How this part works after the change

→ Prefer **live** docs. Summary: start-first rolls drain the old task locally; router hard-skips `draining`/`full`; soft slows new homes; place is memory on ws-router; hosted tenants stay in-process for #20 filters.

## Still open (follow-ons — not blocking #8 done)

1. Armed evacuate / pin / cordon ops CLI → **#21 / #18**
2. Cross-replica hosted-tenant census → parked on **#18 / #21** (not required for #20 selective pull)
3. Broader affinity co-location asserts → **#26**

## Notes / decisions

- Local `HostedTenants` only; do not SET Redis keys for hosting interest.
- Session handoff Redis (`ws:session_handoff:…`) remains auth continuity — not placement.
- Redis advertised-version WS fan-out removed under **#23**.
