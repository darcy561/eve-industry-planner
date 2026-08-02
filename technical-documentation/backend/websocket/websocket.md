# Websocket service (`eip_websocket`)

Live SoT for the **websocket** service: per-slot client cutoff hints, cordon/drain force-close, session handoff. Code: [`services/websocket`](../../../services/websocket/). Placement / pin / eligible set → [ws-router.md](../ws-router/ws-router.md). Edge `/ws` → [traefik.md](../../stack/traefik.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Image | `ghcr.io/darcy561/eve-industry-planner-websocket:${APP_VERSION}` | [`docker-stack.yml`](../../../docker-stack.yml) `services.websocket.image` |
| Replicas | `2` (`EIP_WEBSOCKET_REPLICAS`, from config `min`) | Template: [`yamldefaults.DefaultConfig`](../../../deployment-tool/internal/kit/templates/yamldefaults/default.go). Live: `eip.config.yaml` |
| Capacity min / max | template `2` / `4` | same (`services.websocket.min` / `max`) |
| `target_clients` | `1500` | same (policy hint; not enforced in-process) |
| `client_cutoff` | `2000` (`WS_SLOT_CLIENT_CUTOFF`; `0` = unlimited) | same → stack env / service update |
| `reserve_capacity` | `0.20` | same (policy hint) |
| `drain_timeout` | `10m` | same (ops budget; not a process timer) |
| `capacity_controller_managed` | `false` | same |
| Volume | `api_data` → `/data` | stack YAML |
| Networks | `eip-core` only | [network.md](../../stack/network.md) |

Stack YAML expand fallbacks for capacity labels (`EIP_WEBSOCKET_CAPACITY_MAX:-12`) apply until operator config is written/synced — template/live YAML are the SoT for desired max. Secret attach: `x-secrets-websocket` (mongo + redis). Full service block → `services.websocket` in that YAML.

## Traffic

```text
Browser ──Traefik /ws──► eip_ws_router ──► eip_websocket-{slot}:4001
                                              probes :19100/ready
                                              metrics / OTel on the process
```

Slot identity: `websocket-{{.Task.Slot}}` (`OTEL_SERVICE_INSTANCE_ID` / replica id). No Traefik labels on this service.

## Client cutoff & Redis full

When connected clients ≥ `WS_SLOT_CLIENT_CUTOFF`, this replica **SET**s `eip:ws:full:v1:{slot}` (TTL refreshed while still at cutoff) and **DEL**s when under. ws-router drops full slots from the eligible set ([ws-router.md](../ws-router/ws-router.md)).

Cutoff is an operator-chosen number; a few overs under race are acceptable. Soft `target_clients` / `reserve_capacity` are YAML policy only — not enforced by this binary.

## Cordon / drain / force-close

Redis contracts shared with the router ([`wsplacement`](../../../services/shared/wsplacement/keys.go)):

| Key / channel | Role here |
|---------------|-----------|
| `eip:ws:cordon:v1:{slot}` | Slot marked cordoned (ops / evacuate) |
| `eip:ws:drain:v1` | PUBLISH → matching replica force-closes local sockets |
| `eip:ws:full:v1:{slot}` | Cutoff hint (this service writes) |

On drain for this slot (or cordon already set at startup):

1. Optional JSON `{type:"please_reconnect", …}` on the connection  
2. WebSocket close **1001** (`CloseGoingAway`)  
3. SPA reconnects on any non-manual close; router places on an eligible slot  

Do **not** `docker service scale eip_websocket=N-1` on a hot slot (may be the only home for an alliance). Prefer cordon/evacuate, wait reconnect within `drain_timeout`, then shrink a cold empty slot. Leave ≥1 healthy uncordoned slot.

## Session handoff

Redis `ws:session_handoff:v1:…` (~25s TTL: reconnect window + slack) lets a reconnect resume subscriptions across slots when the handoff is still present.

## Health

| Endpoint | Role |
|----------|------|
| `GET :19100/healthy` | Liveness |
| `GET :19100/ready` | Readiness (Swarm healthcheck) |

Traefik does not LB this service directly.
