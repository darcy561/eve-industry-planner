# Docker Swarm networks

Live SoT for overlay planes. Membership SoT is the stack fragments: [`docker-stack.data.yml`](../../docker-stack.data.yml), [`docker-stack.yml`](../../docker-stack.yml), [`docker-stack.obs.yml`](../../docker-stack.obs.yml). Edge Traefik detail → [traefik.md](./traefik.md). Bootstrap → **`eip up`** / **`eip dev`** (`engine.Ready` creates external attachable overlays named in those YAMLs).

## Planes

| Network | Kind | Attachable | Owner | Role |
|---------|------|------------|-------|------|
| **`eip-core`** | external overlay | **yes** (create-once) | `engine.Ready` from `external: true` in fragments | Mesh — data + app DNS; Traefik alias; Prometheus; dual-homed obs exporters / Alloy / Grafana |
| **`eip-public`** | stack overlay | no | app (+ obs) fragment | Edge — Traefik swarm provider ↔ frontend / api / ws-router (/grafana when obs on) |
| **`eip-obs`** | stack overlay | yes | obs fragment | Obs plane — Loki / Grafana / Alloy / exporters / asynqmon |
| **`eip-docker-traefik`** | stack overlay | no | app | Socket-proxy island — Traefik ↔ `traefik-docker-proxy:2375` |
| **`eip-docker-ws`** | stack overlay | no | app | Socket-proxy island — ws-router ↔ `ws-docker-proxy:2375` |
| **`eip-docker-alloy`** | stack overlay | no | obs | Socket-proxy island — Alloy ↔ `alloy-docker-proxy:2375` |
| Swarm **ingress** | built-in | — | Engine | Host publish for Traefik only (`mode: ingress`) |

**Trust rule:** never put a docker-socket proxy on `eip-core` / `eip-public` / `eip-obs`, and never share one `eip-docker-*` net across consumers.

```text
0  Host / Swarm ingress
   └─ eip_traefik published :80 / :443 / :81  (mode: ingress)

1  eip-public  (edge overlay)
   └─ traefik ↔ frontend · api · ws-router · grafana*

2  eip-core  (mesh overlay, external attachable)
   └─ api · websocket · worker · core · ws-router · traefik
      · seaweedfs · mongo · redis · nats · prometheus
      · alloy* · grafana* · asynqmon* · *-exporter*

3  eip-obs  (obs addon overlay)*
   └─ loki · alloy · grafana · asynqmon · exporters

4  eip-docker-*  (one proxy + one consumer each)
   ├─ eip-docker-traefik  → traefik-docker-proxy + traefik
   ├─ eip-docker-ws       → ws-docker-proxy + ws-router
   └─ eip-docker-alloy*   → alloy-docker-proxy + alloy
```

\* Only when `addons.observability.enabled` deploys `docker-stack.obs.yml`.

## Membership matrix

| Service | Fragment | Networks | Notes |
|---------|----------|----------|-------|
| nats / redis / mongo / seaweedfs / prometheus | data | `eip-core` | DNS aliases on mesh (`mongo`, `redis`, …) |
| traefik-docker-proxy | app | `eip-docker-traefik` | never on mesh/edge |
| traefik | app | `eip-core` · `eip-public` · `eip-docker-traefik` | alias `traefik` on mesh; **only** host publish |
| frontend | app | `eip-public` | edge-only SPA |
| api | app | `eip-core` · `eip-public` | dual-home |
| websocket | app | `eip-core` | mesh only (no Traefik labels) |
| ws-docker-proxy | app | `eip-docker-ws` | never on mesh/edge |
| ws-router | app | `eip-core` · `eip-public` · `eip-docker-ws` | dual-home + Docker API |
| worker / core | app | `eip-core` | mesh only |
| loki | obs | `eip-obs` | |
| alloy-docker-proxy | obs | `eip-docker-alloy` | never on mesh/obs for the proxy itself |
| alloy | obs | `eip-obs` · `eip-core` · `eip-docker-alloy` | OTLP target `alloy:4317` from apps |
| grafana | obs | `eip-obs` · `eip-core` · `eip-public` | Traefik `/grafana` |
| asynqmon / *-exporter / node_exporter | obs | `eip-obs` · `eip-core` | dual-home so Prometheus (on mesh) can scrape |

**Not on the edge plane (by design):** websocket, worker, core, seaweedfs, mongo, redis, nats, prometheus.
Traefik never routes directly to websocket; `/ws` → ws-router → Docker API + mesh to `eip_websocket` tasks.

## Who dials whom

| From | To | Via | Why |
|------|----|-----|-----|
| Internet / browser | traefik | host ingress | `:80` / `:443` (/ `:81` dashboard) |
| traefik | frontend | `eip-public` | PathPrefix `/` (swarm provider) |
| traefik | api | `eip-public` | PathPrefix `/api` |
| traefik | ws-router | `eip-public` | PathPrefix `/ws` |
| traefik | grafana | `eip-public` | PathPrefix `/grafana` (obs; **web** entrypoint today) |
| traefik | traefik-docker-proxy | `eip-docker-traefik` | docker + swarm providers `:2375` |
| api / worker / core | mongo · redis · nats · seaweedfs | `eip-core` | mesh env anchors |
| websocket | mongo · redis · nats | `eip-core` | mesh only |
| ws-router | redis | `eip-core` | placement / sticky |
| ws-router | `eip_websocket` tasks | `eip-core` (via Docker API) | `DOCKER_HOST` → proxy |
| ws-router | ws-docker-proxy | `eip-docker-ws` | `:2375` |
| prometheus | traefik `:8082` · exporters · asynqmon | `eip-core` | scrapes on mesh (exporters dual-homed) |
| alloy | loki · prometheus | `eip-obs` / `eip-core` | log + remote write |
| alloy | alloy-docker-proxy | `eip-docker-alloy` | container discovery |
| grafana | prometheus · loki | `eip-core` / `eip-obs` | datasources |
| apps (OTLP) | alloy `:4317` | `eip-core` | when obs on |

## Traefik provider networks

| Provider | `--providers.*.network` | Backends |
|----------|-------------------------|----------|
| docker | **`eip-core`** | mesh-discovered services |
| swarm | **`eip-public`** | labeled edge services (`traefik.swarm.network=eip-public`) |

Discovery endpoint: `tcp://traefik-docker-proxy:2375` on `eip-docker-traefik`.

## Mesh DNS anchors (app env)

From `docker-stack.yml` x-\*-env: `MONGO_HOST=mongo`, `REDIS_HOST=redis`, `NATS_URL=nats://nats:4222`, `S3_URL=http://seaweedfs:8333`. Short names are Swarm VIP / alias DNS on **`eip-core`**.

## Host publish

**Only** `eip_traefik`: `EIP_HTTP_PORT` / `EIP_HTTPS_PORT` / `EIP_TRAEFIK_DASHBOARD_PORT` (defaults 80 / 443 / 81), `mode: ingress`. No other services publish host ports. Port knobs → [config.md](./config.md) / [traefik.md](./traefik.md).

## Bootstrap

1. **`eip up` / `eip dev`** → `engine.Ready` ensures Swarm, then creates each **external** network from the fragment set as an **attachable overlay** (today: **`eip-core`** only — name comes from YAML `external: true`, not a hardcoded override).
2. Stack deploy creates stack-owned nets (`eip-public`, `eip-docker-*`, and when obs is on `eip-obs` / `eip-docker-alloy`).
3. Shutdown keeps volumes and **external** nets (`eip-core`); stack-owned nets go with the stack.
