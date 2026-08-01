# Websocket capacity + drain (#8)

> Part of [ROADMAP.md](./ROADMAP.md). Soft caps, roll/reconnect, and **manual drain** before
> scale-in. Placement ops: [WS_ROUTER.md](./WS_ROUTER.md). Tunables: `eip.config.yaml`
> (#19; defaults in [`yamldefaults.DefaultConfig`](../../admintool/internal/kit/templates/yamldefaults/default.go); `client_cutoff` via **`make swarm-sync`**). **Force-close on cordon/evacuate landed.**
> **Client cutoff + router full divert landed** (Redis `eip:ws:full:v1:{slot}`). Soft
> `target_clients` / hosted-tenant surface still open or parked with #18.

## Locked for now (2026-07-19)

| Knob | Draft value | Notes |
|------|-------------|--------|
| Swarm `eip_websocket` replicas | **2** (stack default) | `start-first` rolls |
| Capacity label min / max | **2 / 12** (stack today) | Example YAML lean ceiling **max: 4** until soak (#19 sync) |
| Soft target / client cutoff | **1500 / 2000** clients per slot | Soft = YAML/controller hint; cutoff enforced in WS binary |
| Soft enforce | docs / #18 only | Does not refuse connects |
| Client cutoff | **`services.websocket.client_cutoff`** (default 2000) | YAML SoT → `make swarm-sync` (service update; stack default until then); 503 `slot_full` + Redis full hint |
| Router divert | Redis `eip:ws:full:v1:{slot}` | Best-effort: skip full home despite affinity/pin; process refuse is authoritative |
| Reserve | **0.20** | Prefer scale-up before packing every slot hot |
| Drain timeout | **10m** | Wait for natural reconnect after evacuate; do not cold-kill |
| Session handoff | Redis `ws:session_handoff:v1:…` (~25s) | SPA reconnect resumes subscriptions across slots |

**Sticky cookie `eip_ws_affinity` is fallback only.** Steady-state org placement is Redis via
ws-router + `eip_tenant_affinity`. Do **not** write runbooks that assume sticky keeps an
alliance on one slot.

Cluster client budget (approx): `replicas × client_cutoff` — treat `target_clients` as the
scale-up hint the future controller (#18) will use. Cutoff is an operator-chosen number; a
few overs under race are acceptable — process refuse still gates the replica.

## Operator YAML (#19)

See [`yamldefaults.DefaultConfig`](../../admintool/internal/kit/templates/yamldefaults/default.go) / live `eip.config.yaml`:

```yaml
services:
  websocket:
    capacity_controller_managed: false   # capacity controller off; operators scale/drain by hand
    min: 2
    max: 4           # lean hard-cutover ceiling; stack labels may still say 12
    target_clients: 1500
    client_cutoff: 2000
    reserve_capacity: 0.20
    drain_timeout: 10m
```

`client_cutoff` (and capacity labels / replicas from `min`) apply via **`make swarm-sync`**.
Soft `target_clients` / reserve remain policy seed for #18 until the controller enforces them.

## Drain / cordon checklist (manual scale-in)

**Never** `docker service scale eip_websocket=N-1` on a hot slot. Org co-location means that
slot may be the only home for an alliance.

### Before you shrink

1. **Inventory concentration**  
   `make ws-placement-ops ARGS='status'` — which tenants sit on the slot you will remove?  
   Prefer removing a slot with **few / cold** placements when possible.
2. **Pick destination**  
   Leave ≥1 healthy uncordoned slot. If only two slots exist, evacuate onto the survivor.
3. **Cordon the victim**  
   `make ws-placement-ops ARGS='cordon websocket-N'`  
   New placements skip it; already-connected sockets stay until reconnect.
4. **Evacuate placement map**  
   `make ws-placement-ops ARGS='evacuate websocket-N'`  
   (or `evacuate websocket-N websocket-M` to pin destination)  
   Rewrites Redis `eip:ws:place:v1:*` off N and keeps N cordoned.
5. **Wait for drain (force-close + reconnect)**  
   `cordon` / `evacuate` **PUBLISH** `eip:ws:drain:v1` → that websocket slot closes locals
   (`please_reconnect` + close 1001). SPA reconnects via backoff + session handoff
   (`ws:session_handoff:v1`). Router places on an eligible (non-cordoned) slot.  
   Budget: **`drain_timeout` (10m)** as a safety ceiling; typical reconnect is seconds.
6. **Confirm empty enough**  
   Re-check `status` (no placements on N) and websocket logs
   (`slot cordon drain: force-closed local clients`).  
   Hosted-tenant tracking (in-process set) is still a later polish item.
7. **Scale down**  
   `docker service scale eip_websocket=$((N-1))`  
   Only after placements are gone / clients reconnected.
8. **Cleanup**  
   After the task is gone, `uncordon` is moot; clear any pins that pointed at the dead slot.

### Controlled roll (image / config, **same** replica count)

`start-first` starts the replacement before stopping the old task. Expect brief reconnects:

1. Prefer rolling during low edit activity when practical.
2. Affinity cookie + Redis placement should land reconnects on the **same slot id** when that
   task is healthy; dead-slot on connect → instant reassign (router).
3. Session handoff (~25s) covers one capped reconnect window — longer outages lose resume and
   re-subscribe.
4. Do **not** cordon-for-roll unless you intend to evacuate that slot.

### Scale-up

1. `docker service scale eip_websocket=N+1` (within max).
2. Wait until the new task is **ready**.
3. Optional: leave new tenants to land naturally, or soft-prefer via pin/cordon policy later.
4. Never rely on sticky reshuffle to fill the new slot.

## What is still open (code)

| Item | Status |
|------|--------|
| Live force-close / please-reconnect after cordon | **Done** — Redis `PUBLISH eip:ws:drain:v1` + WS subscriber |
| Accurate hosted-tenant set (memory ± Redis) | **Parked** — in-process indexes exist; query surface (HTTP vs Redis interest) decided with #18 / #20 |
| Client cutoff refuse | **Landed** — YAML `client_cutoff` (default 2000) via `make swarm-sync` → 503 `slot_full` + Redis full hint |
| Per-slot `ws.connected_clients` gauges | Partially present (OTel); Prom/controller scrapes with #18 |
| Router divert on full/cutoff | **Landed** — skip `eip:ws:full:v1:{slot}` in eligible set; reassign affinity/pin home when full |
| Soft divert on `target_clients` | Still open with #18 |

## Force-close signal (landed)

Ops (`cordon` / `evacuate`) SETs `eip:ws:cordon:v1:{slot}` then **PUBLISH**es the slot id
on `eip:ws:drain:v1`. Each websocket replica subscribes; matching slot:

1. Optional JSON `{type:"please_reconnect", reason, slot}` on the client send channel  
2. WebSocket close **1001** (`CloseGoingAway`)  
3. Refuses new upgrades while cordoned (503)

SPA reconnect does not special-case close codes — any non-manual close schedules reconnect.  
Rebuild/redeploy websocket after this change (`make rebuild SERVICES=websocket` or `make dev`).

**Bus note (intentional temporary):** the wake-up is **Redis pub/sub** because
`ws-placement-ops` already talks Redis next to the cordon `SET`. Redis remains the **source of
truth** for cordon/placement. **Target for #18 / deepen #21:** keep Redis as the map; move the
drain **notification** to **NATS**; keep **`make ws-placement-ops`** but point it at the
**capacity controller** (same verbs) so automation and humans share one write path. Direct Redis
from the script becomes break-glass only.

## App-train waves

Version ship uses dual-warm + look-ahead cordon ([APP_TRAIN.md](./APP_TRAIN.md)). Router prefers newest bake mid-wave ([WS_ROUTER.md](./WS_ROUTER.md)). SPA snackbar still prompts refresh; **outdated tabs keep reconnecting** /ws.

## Related

- [WS_ROUTER.md](./WS_ROUTER.md) — Redis placement + `make ws-placement-ops`  
- [WORKER.md](./WORKER.md) — sibling capacity envelope (#7)  
- [TRAEFIK.md](./TRAEFIK.md) — `/ws` → router; sticky = fallback  
- [STACK.md](./STACK.md) — `eip_websocket` deploy  
- ROADMAP **#8** / **#19** / **#21**  
