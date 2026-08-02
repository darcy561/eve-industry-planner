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

The Make `ws-placement-ops` escape was **removed**. Runtime still honors Redis cordon/pin/
evacuate overlays + drain PUBLISH (`eip:ws:drain:v1` → force-close). Armed operator path = **#18**
capacity controller. Until then: do **not** cold-scale a hot slot — wait for natural drain or
use Redis break-glass only if you know the key layout (`eip:ws:cordon:v1:*`, `eip:ws:place:v1:*`).

1. Prefer shrinking a **cold** slot (few placements).
2. Leave ≥1 healthy uncordoned slot.
3. Cordon / evacuate / wait reconnect (budget **`drain_timeout` (10m)**) before
   `docker service scale eip_websocket=…`.
4. Confirm empty enough via logs (`slot cordon drain: force-closed local clients`) before scale-down.

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

**Bus note (intentional temporary):** drain wake-up is **Redis pub/sub** next to the cordon
`SET`. Redis remains SoT for cordon/placement. **Target for #18:** keep Redis as the map; move
drain **notification** to **NATS**; operator verbs live on the capacity controller (not a Make
script).

## App-train waves

Version ship uses dual-warm + look-ahead cordon ([APP_TRAIN.md](./APP_TRAIN.md)). Router prefers newest bake mid-wave ([WS_ROUTER.md](./WS_ROUTER.md)). SPA snackbar still prompts refresh; **outdated tabs keep reconnecting** /ws.

## Related

- [WS_ROUTER.md](./WS_ROUTER.md) — Redis placement / prefer-newest  

- [WORKER.md](./WORKER.md) — sibling capacity envelope (#7)  
- [TRAEFIK.md](./TRAEFIK.md) — `/ws` → router; sticky = fallback  
- [STACK.md](./STACK.md) — `eip_websocket` deploy  
- ROADMAP **#8** / **#19** / **#21**  
