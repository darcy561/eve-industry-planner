# WS placement router (`eip_ws_router`)

Live SoT for the **ws-router** service: Redis tenant→slot placement and reverse-proxy of `/ws` upgrades to `eip_websocket` tasks. Code: [`services/ws-router`](../../../services/ws-router/). Cookie/key contracts: [`shared/wsplacement`](../../../services/shared/wsplacement/). Swarm edge PathPrefix → [traefik.md](../../stack/traefik.md); networks → [network.md](../../stack/network.md). Soft/full writers → [websocket.md](../websocket/websocket.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| ws-router image | `ghcr.io/darcy561/eve-industry-planner-ws-router:${APP_VERSION}` | [`docker-stack.yml`](../../../docker-stack.yml) `services.ws-router.image` |
| Docker socket proxy image | `tecnativa/docker-socket-proxy:v0.4.2` | same file, `services.ws-docker-proxy.image` |
| Replicas | `1` (`start-first` via shared app deploy) | stack YAML `deploy.replicas` |
| Listen | `:8080` (`EIP_WS_ROUTER_LISTEN`) | stack env on `services.ws-router` |
| Backend service / port | `eip_websocket` / `4001` | `EIP_WEBSOCKET_SERVICE` / `EIP_WS_BACKEND_PORT` |
| `DOCKER_HOST` | `tcp://ws-docker-proxy:2375` | stack env |
| Placement TTL | `24h` | [`wsplacement.PlacementTTL`](../../../services/shared/wsplacement/keys.go) |
| Affinity cookie | `eip_tenant_affinity` | same package (`AffinityCookie`) |
| Sticky cookie | `eip_ws_affinity` | same (`StickyCookie`) — fallback only |
| Capacity labels | `min=1` `max=2` | stack `deploy.labels` `eip.capacity.*` |

Secret attach: `REDIS_PASSWORD` only (`x-secrets-ws-router`). Full service block → `services.ws-router` / `services.ws-docker-proxy` in that YAML.

## Traffic & discovery

```text
Traffic
  Browser ──Traefik /ws──► eip_ws_router (:8080)
                              │  Redis place / pin / cordon / full / soft
                              └─► eip_websocket-{slot}:4001

Discovery (Docker API on eip-docker-ws)
  eip_ws_router ──► ws-docker-proxy:2375
    GET /services + /tasks only (POST=0)
    HTTP-probe each task :19100/ready → eligible backends

Networks
  eip-core · eip-public · eip-docker-ws
```

Cookie key format (issued by API): `alliance:{id}` → else `corporation:{id}` → else `account:{id}`. Session auth stays on the websocket process.

## Placement

```text
key = cookie eip_tenant_affinity
ttl = PlacementTTL (refresh on successful place)
if key empty:
  sticky_fallback (eip_ws_affinity) among prefer-non-soft preferred
else:
  honor pin if set and slot eligible (pin ignores soft; not full/cordon)
  slot = Redis GET place[key]
  if place hit and home still preferred (eligible ∩ newest bake):
    stick (even if home is soft)
  else if missing / not preferred / full / cordon / dead:
    reassign: pick among preferred, prefer non-soft; if all soft, any preferred
    Redis SET place[key] = slot EX ttl
  proxy → taskIP(slot):4001
```

Store **slot id** (`websocket-1`, …), not raw IPs. Dead/missing slot on connect → instant reassign (no background reconcile). Among eligible slots, prefer highest semver `APP_VERSION` so reconnects land on newer tasks mid-roll.

### Eligible set

Build from Docker `running` ∩ task `:19100/ready` **200** ∩ not **cordoned** ∩ not **full**. Soft does **not** remove a slot from eligible.

If every slot is skipped by cordon/full, fall back to all probe-ready backends so `/ws` is not black-holed (websocket `client_cutoff` still refuses on the process). Affinity home and pin do not stick onto a full/cordoned slot.

### Soft divert (not a hard skip)

Websocket SET/DEL `eip:ws:soft:v1:{slot}` at `target_clients`. Soft slows **growth of new homes**:

| Case | Soft behaviour |
|------|----------------|
| Place **hit** and home still preferred | **Stick** (even if soft) |
| Pin and slot eligible | Honor pin (**ignores soft**; still blocked by full/cordon) |
| Miss / reassign / first pick | Among preferred, **prefer non-soft**; if every preferred slot is soft, pick among all preferred |
| Sticky-cookie fallback pick | Same prefer-non-soft list |

```text
connected < target              → neither soft nor full
target ≤ connected < cutoff     → soft; place/pin stick; new homes divert if a non-soft exists
connected ≥ cutoff              → full (hard-skip + reassign off) + process refuse; pin ignored
```

### Redis keys

Prefixes fixed in [`shared/wsplacement`](../../../services/shared/wsplacement/keys.go):

| Key / channel | Meaning |
|---------------|---------|
| `eip:ws:place:v1:{affinity}` | Tenant → slot (TTL refreshed on hit) |
| `eip:ws:pin:v1:{affinity}` | Ops pin — preferred slot when eligible |
| `eip:ws:cordon:v1:{slot}` | Slot refuses new placements; reconnects reassign away |
| `eip:ws:full:v1:{slot}` | At `client_cutoff` hint (websocket refreshes TTL) — **hard skip** |
| `eip:ws:soft:v1:{slot}` | At `target_clients` hint (websocket refreshes TTL) — **prefer-non-soft only** |
| `eip:ws:drain:v1` | PUBLISH → matching websocket force-closes locals |

Drain / scale-in / SIGTERM on the websocket service → [websocket.md](../websocket/websocket.md).

## Health & metrics

| Endpoint | Role |
|----------|------|
| `GET :19100/healthy` (and `/health`) | Liveness — process up |
| `GET :19100/ready` | Redis OK **and** ≥1 probe-ready websocket backend (`:19100/ready` on the task) |
| `GET :8080/metrics` | Lean Prometheus on traffic port |

Swarm + Traefik LB healthchecks use `:19100/ready`. Redis down or no probe-ready backends → `/ready` 503; `/healthy` still 200.

## Docker socket proxy allowlist

`eip_ws-docker-proxy` mounts the host sock; the router does not. Allowlist: `SERVICES` + `TASKS`, `POST=0` (also `EVENTS`/`PING`/`VERSION` off). Narrower than Traefik’s proxy — do not merge overlays or allowlists. Overlay islands → [network.md](../../stack/network.md).
