# WS placement router (`eip_ws_router`)

Live SoT for the **ws-router** service: in-memory tenant→backend placement and reverse-proxy of `/ws` upgrades to `eip_websocket` tasks. Code: [`services/ws-router`](../../../services/ws-router/). Cookie + `/placement` path: [`shared/wsplacement`](../../../services/shared/wsplacement/). NATS subject/payload: [`shared/nats`](../../../services/shared/nats/) (`SubjectWSPlacementState`, `PlacementState`). Soft/full/draining writers → [websocket.md](../websocket/websocket.md). Swarm edge PathPrefix → [traefik.md](../../stack/traefik.md); networks → [network.md](../../stack/network.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| ws-router image | `ghcr.io/darcy561/eve-industry-planner-ws-router:${APP_VERSION}` | [`docker-stack.yml`](../../../docker-stack.yml) `services.ws-router.image` |
| Docker socket proxy image | `tecnativa/docker-socket-proxy:v0.4.2` | same file, `services.ws-docker-proxy.image` |
| Replicas | `1` (`start-first` via shared app deploy) | stack YAML `deploy.replicas` |
| Listen | `:8080` (`EIP_WS_ROUTER_LISTEN`) | stack env on `services.ws-router` |
| Backend service / port | `eip_websocket` / `4001` | `EIP_WEBSOCKET_SERVICE` / `EIP_WS_BACKEND_PORT` |
| `DOCKER_HOST` | `tcp://ws-docker-proxy:2375` | stack env |
| NATS | `*nats-env` (no Redis secrets on this service) | stack `services.ws-router` |
| Affinity cookie | `eip_tenant_affinity` | [`wsplacement.AffinityCookie`](../../../services/shared/wsplacement/keys.go) |
| Sticky cookie | `eip_ws_affinity` | same (`StickyCookie`) — fallback only |
| Capacity labels | `min=1` `max=2` | stack `deploy.labels` `eip.capacity.*` |

Full service block → `services.ws-router` / `services.ws-docker-proxy` in that YAML.

## Traffic & discovery

```text
Traffic
  Browser ──Traefik /ws──► eip_ws_router (:8080)
                              │  memory place + NATS/HTTP placement flags
                              └─► eip_websocket taskIP:4001

Discovery (Docker API on eip-docker-ws)
  eip_ws_router ──► ws-docker-proxy:2375
    GET /services + /tasks only (POST=0)
    HTTP-probe each task :19100/ready → eligible backends (routing)
    GET :4001/placement on running tasks → soft/full/clients/draining

Signals
  NATS ws.placement.state → update per-backend PlacementState
  Refresh reconcile → GET /placement keyed by discovery container id

Networks
  eip-core · eip-public · eip-docker-ws
```

Cookie key format (issued by API): `alliance:{id}` → else `corporation:{id}` → else `account:{id}`. Session auth stays on the websocket process.

## Placement

```text
key = cookie eip_tenant_affinity
store = in-memory map on this router process (affinity → container_id)
if key empty:
  sticky_fallback (eip_ws_affinity) among prefer-non-soft preferred
else:
  home = place[key]
  if place hit and home still preferred (eligible ∩ newest bake)
     and home not full/draining:
    stick (even if home is soft)
  else if missing / not preferred / full / draining / dead:
    reassign: pick among preferred, prefer non-soft; if all soft, any preferred
    among that set: lowest live client count (from PlacementState.clients)
    place[key] = container_id
  proxy → taskIP(container_id):4001
```

Store **container id** (`container.ID()` / Docker `ContainerID[:12]`), not Swarm slot names and not raw IPs. Dead/missing backend on connect → instant reassign (no background place reconcile). Among eligible backends, prefer highest semver `APP_VERSION` so reconnects land on newer tasks mid-roll.

Place map is **router-process memory**: lost on router restart (clients reconnect and re-place). Soft/full/clients/draining are instance-lifetime on each websocket and republished / reconciled; they are not Redis TTLs.

### Eligible set

Build routing registry from Docker `running` ∩ task `:19100/ready` **200**. Hard-skip backends marked **full** or **draining** in placement state. Soft does **not** remove a backend from eligible.

If every backend is skipped by full/draining, fall back to all probe-ready backends so `/ws` is not black-holed (websocket `client_cutoff` still refuses on the process). Affinity home does not stick onto a full/draining backend.

Status reconcile (`GET /placement`) runs for **all running** websocket tasks (including not-ready/draining) so draining flags stay visible; the proxy registry still uses probe-ready only.

### Soft divert (not a hard skip)

Websocket publishes soft when connected ≥ `target_clients`. Soft slows **growth of new homes**:

| Case | Soft behaviour |
|------|----------------|
| Place **hit** and home still preferred (not full/draining) | **Stick** (even if soft) |
| Miss / reassign / first pick | Among preferred, **prefer non-soft**; if every preferred backend is soft, pick among all preferred |
| Sticky-cookie fallback pick | Same prefer-non-soft list |
| Place-miss pick among remaining | **Lowest** `PlacementState.clients` |

```text
connected < target              → neither soft nor full
target ≤ connected < cutoff     → soft; place stick; new homes divert if a non-soft exists
connected ≥ cutoff              → full (hard-skip + reassign off) + process refuse
```

### Placement contracts

| Piece | Meaning |
|-------|---------|
| Cookie `eip_tenant_affinity` | Tenant key for place map |
| Cookie `eip_ws_affinity` | Sticky fallback only |
| NATS `ws.placement.state` | Raw `PlacementState` from websocket |
| `GET /placement` | Same JSON for refresh reconcile |
| Place map value | `container_id` matching Docker discovery / `container.ID()` |

Drain / scale-in / SIGTERM on the websocket service → [websocket.md](../websocket/websocket.md).

## Health & metrics

| Endpoint | Role |
|----------|------|
| `GET :19100/healthy` (and `/health`) | Liveness — process up |
| `GET :19100/ready` | NATS OK **and** ≥1 probe-ready websocket backend (`:19100/ready` on the task) |
| `GET :8080/metrics` | Lean Prometheus on traffic port |

Swarm + Traefik LB healthchecks use `:19100/ready`. NATS down or no probe-ready backends → `/ready` 503; `/healthy` still 200.

## Docker socket proxy allowlist

`eip_ws-docker-proxy` mounts the host sock; the router does not. Allowlist: `SERVICES` + `TASKS`, `POST=0` (also `EVENTS`/`PING`/`VERSION` off). Narrower than Traefik’s proxy — do not merge overlays or allowlists. Overlay islands → [network.md](../../stack/network.md).
