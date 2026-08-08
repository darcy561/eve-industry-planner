# #26 — WebSocket connection / affinity simulator

**Roadmap:** [../roadmap.md](../roadmap.md) `#26`  
**Status (mirror):** open — soak hold/reconnect + limits soft/full divert base landed (`cmd/ws_soak` under #8 / #2); co-location asserts still open  
**Not live SoT.** On overlap with live docs, this overlay wins until promote.

## What changed

| Claim | Code / doc |
|-------|------------|
| Live soak hold + reconnect + sticky / place report | `services/cmd/ws_soak` (`-profile hold`) |
| Soft/hard + divert soak | `services/cmd/ws_soak -profile limits` — fill corp + mixed account/corp/alliance keys; NATS soft/full + `connected.container_id` place asserts |
| Runbook | [overlays/08-websocket-drain.md](./08-websocket-drain.md) § Live soak harness; live [testing/services/websocket.md](../../../testing/services/websocket.md) |

## How this part works after the change

Operator builds `cmd/ws_soak`, runs it on Swarm network `eip-core` (or host with Redis session seed + Traefik/`ws-router` reachability), holds N `/ws` clients with optional `eip_tenant_affinity` cookies. Progress/report lines show sticky backends and place homes from `connected.container_id`.

**Still needed for #26 acceptance:** assert “N clients with key K → same backend”; optional mid-test kill/evacuate of a backend with co-location recovery check; document CI-less drill against `eip dev`.

## Still open

- Co-location assertion mode (fail if same affinity lands on >1 backend)
- Reconnect-after-kill drill scripted (pair with #29 / #21 ops)
- Broader affinity sims beyond limits divert evidence

## Missing live SoT discovered mid-work

Live testing map already mentions soak (promoted with #2). Extend when co-location asserts land.

## Notes / decisions

Pairs with #4 / #8 / #2. Soft/full Redis place asserts retired with #2 signal plane.
