# #26 — WebSocket connection / affinity simulator

**Roadmap:** [../roadmap.md](../roadmap.md) `#26`  
**Status (mirror):** open — soak hold/reconnect base landed under #8 (`cmd/ws_soak`); co-location asserts still open  
**Not live SoT.** On overlap with live docs, this overlay wins until promote.

## What changed

| Claim | Code / doc |
|-------|------------|
| Live soak hold + reconnect + Redis soft/full/place report | `services/cmd/ws_soak` (`-profile hold`) |
| Soft/hard + divert soak | `services/cmd/ws_soak -profile limits` — fill corp + mixed account/corp/alliance keys; Redis place asserts off-soft / not-on-full |
| Runbook | [overlays/08-websocket-drain.md](./08-websocket-drain.md) § Live soak harness |

## How this part works after the change

Operator builds `cmd/ws_soak`, runs it on Swarm network `eip-core` (or host with Redis + Traefik reachability), holds N `/ws` clients with optional `eip_tenant_affinity` cookies. Progress/report lines show sticky slots and Redis placement counts.

**Still needed for #26 acceptance:** assert “N clients with key K → same slot”; optional mid-test kill/evacuate of a slot with co-location recovery check; document CI-less drill against `eip dev`.

## Still open

- Co-location assertion mode (fail if same affinity lands on >1 sticky/place slot)
- Reconnect-after-kill drill scripted (pair with #29 / cordon ops)
- Promote note into live `testing/services/websocket.md` when go-ahead

## Missing live SoT discovered mid-work

_Draft here in live-doc shape. Promote with the rest._

## Notes / decisions

- Soak hold for #8 drain evidence and #26 affinity sim share one binary; do not invent a second load generator.
- Affinity cookie values use `wsplacement.TenantKey*` (`account:` / `corporation:` / `alliance:`), same as API `FormatTenantAffinityKey`.
