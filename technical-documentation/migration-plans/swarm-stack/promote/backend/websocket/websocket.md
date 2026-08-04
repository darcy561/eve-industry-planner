# Websocket service (`eip_websocket`)

Live SoT for the **websocket** service: per-slot soft/full hints, upgrade refuses, SIGTERM drain, cordon force-close, session handoff, in-process hosted-tenant query view. Code: [`services/websocket`](../../../services/websocket/). Placement / pin / eligible set → [ws-router.md](../ws-router/ws-router.md). Edge `/ws` → [traefik.md](../../stack/traefik.md). Stop grace → [stack.md](../../stack/stack.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Image | `ghcr.io/darcy561/eve-industry-planner-websocket:${APP_VERSION}` | [`docker-stack.yml`](../../../docker-stack.yml) `services.websocket.image` |
| Replicas | `2` (`EIP_WEBSOCKET_REPLICAS`, from config `min`) | Template: [`yamldefaults.DefaultConfig`](../../../deployment-tool/internal/kit/templates/yamldefaults/default.go). Live: `eip.config.yaml` |
| Capacity min / max | template `2` / `4` | same (`services.websocket.min` / `max`) |
| `target_clients` | `1500` (`WS_SLOT_TARGET_CLIENTS`; `0` = soft divert off) | same → **`eip sync`** / bring-up |
| `client_cutoff` | `2000` (`WS_SLOT_CLIENT_CUTOFF`; `0` = unlimited) | same → **`eip sync`** / bring-up |
| `reserve_capacity` | `0.20` | same (capacity-controller policy only; not enforced here) |
| `drain_timeout` | `10m` | same (ops budget for pre-stop evacuate; not the process stop timer) |
| `capacity_controller_managed` | `false` | same |
| Process stop budget | **60s** (`shutdownTimeout`; matches stack `x-app-stop-grace`) | [`app.go`](../../../services/websocket/app.go) |
| Volume | `api_data` → `/data` | stack YAML |
| Networks | `eip-core` only | [network.md](../../stack/network.md) |

When both `target_clients` and `client_cutoff` are > 0, config validate requires `target_clients` ≤ `client_cutoff`. Stack YAML may keep bootstrap literals; **operator SoT** is `eip.config.yaml` via sync. Secret attach: `x-secrets-websocket` (mongo + redis). Full service block → `services.websocket` in that YAML.

## Traffic

```text
Browser ──Traefik /ws──► eip_ws_router ──► eip_websocket-{slot}:4001
                                              probes :19100/ready
                                              metrics / OTel on the process
```

Slot identity: `websocket-{{.Task.Slot}}` (`OTEL_SERVICE_INSTANCE_ID` / replica id). No Traefik labels on this service.

## Soft divert vs hard cutoff

One **connected-client** counter drives both Redis hints and process refuse. Small drift under race is acceptable.

| Band | Redis | Process upgrade | Router |
|------|-------|-----------------|--------|
| `connected` < `target_clients` | neither soft nor full | allow | normal place |
| `target` ≤ `connected` < `cutoff` | **SET** `eip:ws:soft:v1:{slot}` | **allow** (soft does not refuse) | place/pin **stick**; new homes **prefer non-soft** |
| `connected` ≥ `client_cutoff` (and cutoff > 0) | **SET** `eip:ws:full:v1:{slot}` | **503** `at_cutoff` | hard-skip full + reassign off |

`0` target = soft divert off. `0` cutoff = unlimited (no full hint / no at_cutoff refuse). Flags refresh on connect/disconnect and a short maintainer; **DEL** when under threshold.

`reserve_capacity` is not enforced by this binary (capacity controller later).

## Upgrade refuses (503)

Before / after session auth as applicable, this process refuses upgrades with HTTP **503** and a clear body reason when:

| Reason | When |
|--------|------|
| `draining` | Local SIGTERM / roll drain in progress |
| `cordoned` | Own `eip:ws:cordon:v1:{slot}` present |
| `at_cutoff` | Connected clients ≥ `client_cutoff` (> 0) |

Soft does **not** refuse. SPA reconnects with backoff on failed upgrade; next attempt goes through the router again.

## SIGTERM / roll drain

On Swarm stop / start-first replace (process **SIGTERM**), cleanup budget shares the **60s** stop grace:

1. Set local **draining** → `:19100/ready` fails; new upgrades **503**.
2. `ForceCloseLocalClients` — sync `please_reconnect` frame then close (**1001** GoingAway); wait until local clients empty or cleanup ctx done (re-kick late joiners).
3. `Shutdown` (sync pool stop) then HTTP/probes/deps teardown.

No Redis cordon/publish required for this path. Router drops non-ready backends on probe refresh → reconnects land on remaining/new slots (prefer newest bake among eligible).

```text
Swarm start-first roll
  NEW task up (ready)
  OLD task SIGTERM
    → /ready 503 + refuse upgrades + ForceCloseLocalClients
    → clients reconnect → router places on eligible (prefer NEW)
    → OLD exits before stop_grace (60s) elapses
```

## Cordon / evacuate (pre-stop ops)

Redis contracts shared with the router ([`wsplacement`](../../../services/shared/wsplacement/keys.go)):

| Key / channel | Role here |
|---------------|-----------|
| `eip:ws:cordon:v1:{slot}` | Slot marked cordoned (ops / evacuate) |
| `eip:ws:drain:v1` | PUBLISH → matching replica force-closes local sockets |
| `eip:ws:full:v1:{slot}` | Hard cutoff hint (this service writes) |
| `eip:ws:soft:v1:{slot}` | Soft divert hint (this service writes) |

On drain PUBLISH for this slot (or cordon already set at startup): force-close local sockets while the cordon key holds (re-kick). Ready may still be up under cordon-only evacuate (unlike SIGTERM draining). Force-close only when own cordon key is still present.

Do **not** `docker service scale eip_websocket=N-1` on a hot slot (may be the only home for an alliance). Prefer cordon/evacuate, wait reconnect within operator `drain_timeout`, then shrink a cold empty slot. Leave ≥1 healthy uncordoned slot. SIGTERM drain is the last mile of a stop; it does **not** replace pre-stop cordon for careful alliance-home evacuates.

## Hosted-tenant query view

In-process only: `HostsTenant` / `HostedTenants` over connection indexes (`account:` / `corporation:` / `alliance:` key shapes from `wsplacement`). **No Redis write** of hosting interest. Cross-replica census for capacity / selective fan-out is a separate control-plane concern (NATS and/or internal API).

## Session handoff

Redis `ws:session_handoff:v1:…` (~25s TTL: reconnect window + slack) lets a reconnect resume subscriptions across slots when the handoff is still present.

## Health

| Endpoint | Role |
|----------|------|
| `GET :19100/healthy` | Liveness (stays up while draining) |
| `GET :19100/ready` | Readiness — fails when draining, or when Redis / NATS / Mongo deps fail Swarm healthcheck |

Traefik does not LB this service directly.

## Ops soak (optional)

Against a live stack: `services/cmd/ws_soak` (`-profile hold` for reconnect endurance; `-profile limits` for soft/full + divert asserts after temporarily lowering synced thresholds). Not a substitute for unit/Integration tests. See [testing/services/websocket.md](../../testing/services/websocket.md).
