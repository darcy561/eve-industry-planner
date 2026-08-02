# Docker Swarm networks (SoT)

> Part of [ROADMAP.md](./ROADMAP.md). Membership SoT is the stack fragments:
> [`docker-stack.data.yml`](../../docker-stack.data.yml),
> [`docker-stack.yml`](../../docker-stack.yml),
> [`docker-stack.obs.yml`](../../docker-stack.obs.yml).
> Edge Traefik detail: [TRAEFIK.md](./TRAEFIK.md). Bootstrap: **`eip up`** / **`eip dev`**
> (`engine.Ready` creates external attachable overlays named in those YAMLs).

Compose runtime is **retired** (stub `docker-compose.yml` only). All live planes are Swarm overlays.

## Planes

| Network | Kind | Attachable | Owner | Role |
|---------|------|------------|-------|------|
| **`eip-core`** | external overlay | **yes** (create-once) | `engine.Ready` from `external: true` in fragments | Mesh — data + app DNS; Traefik alias; Prometheus; dual-homed obs exporters / Alloy / Grafana |
| **`eip-public`** | stack overlay | no | app (+ obs) fragment | Edge — Traefik swarm provider ↔ frontend / api / ws-router (/grafana when obs on) |
| **`eip-obs`** | stack overlay | yes | obs fragment (#34) | Obs plane — Loki / Grafana / Alloy / exporters / asynqmon |
| **`eip-docker-traefik`** | stack overlay | no | app | Socket-proxy island — Traefik ↔ `traefik-docker-proxy:2375` |
| **`eip-docker-ws`** | stack overlay | no | app | Socket-proxy island — ws-router ↔ `ws-docker-proxy:2375` |
| **`eip-docker-alloy`** | stack overlay | no | obs | Socket-proxy island — Alloy ↔ `alloy-docker-proxy:2375` |
| **`eip-docker-capacity`** | *(planned)* | — | #18 | Same island pattern for capacity-controller — **not in YAML yet** |
| Swarm **ingress** | built-in | — | Engine | Host publish for Traefik only (`mode: ingress`) |

Mesh was renamed from legacy **`eip`** → **`eip-core`**. If a host still has network `eip`, remove it after stopping dependents, then **`eip up`**.

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
| docker | **`eip-core`** | mesh-discovered (legacy docker provider path) |
| swarm | **`eip-public`** | labeled edge services (`traefik.swarm.network=eip-public`) |

Discovery endpoint: `tcp://traefik-docker-proxy:2375` on `eip-docker-traefik`.

## Mesh DNS anchors (app env)

From `docker-stack.yml` x-\*-env: `MONGO_HOST=mongo`, `REDIS_HOST=redis`, `NATS_URL=nats://nats:4222`, `S3_URL=http://seaweedfs:8333`. Short names are Swarm VIP / alias DNS on **`eip-core`**.

## Host publish

**Only** `eip_traefik`: `EIP_HTTP_PORT` / `EIP_HTTPS_PORT` / `EIP_TRAEFIK_DASHBOARD_PORT` (defaults 80 / 443 / 81), `mode: ingress`. No other services publish host ports.

## Bootstrap

1. **`eip up` / `eip dev`** → `engine.Ready` ensures Swarm, then creates each **external** network from the fragment set as an **attachable overlay** (today: **`eip-core`** only — name comes from YAML `external: true`, not a hardcoded override).
2. Stack deploy creates stack-owned nets (`eip-public`, `eip-docker-*`, and when obs is on `eip-obs` / `eip-docker-alloy`).
3. Shutdown keeps volumes and **external** nets (`eip-core`); stack-owned nets go with the stack.

## Acceptance

- Services on `eip-core` resolve mesh names (`mongo`, `redis`, `nats`, `seaweedfs`, `prometheus`, `traefik`, …).
- Traefik swarm provider reaches frontend / api / ws-router on `eip-public`; docker provider network is `eip-core`.
- Socket proxies are unreachable from random `eip-core` app tasks.
- With obs on: Alloy on `eip-core` + `eip-obs` + `eip-docker-alloy`; Prometheus scrapes exporters via **eip-core** dual-home (not prometheus→`eip-obs`).

## Doc vs code gaps (roadmap)

Checked against current YAML + admintool (2026-08-02). Track these on [ROADMAP.md](./ROADMAP.md):

| Gap | Reality today | Suggested follow-up |
|-----|---------------|---------------------|
| Prometheus dual-home onto `eip-obs` | **Not implemented.** Obs header / older docs claimed `eip sync`/`up` attaches prometheus; data fragment comment says “optional later”. Scrapes work because **exporters dual-home onto `eip-core`**. | Decide: keep exporter dual-home as SoT **or** implement NetworkConnect / service update for prometheus→`eip-obs` (#34 polish). |
| `EIP_NETWORK_NAME` / `engine.NetworkName` | **Not in code.** Ready uses `stack.ExternalNetworks` from YAML (`eip-core`). | Drop phantom knobs from docs (done here / VARIABLES) unless a rename override is deliberately added. |
| Grafana `websecure` | Router labels use **`entrypoints=web` only**; api/frontend/ws also have websecure. | Add websecure (or redirect) if HTTPS `/grafana` should work without separate termination. |
| `eip-docker-capacity` | Absent from stack YAML | Stays with **#18** capacity-controller. |
| Legacy network name `eip` | Renamed to `eip-core` in fragments | Host cleanup only if an old `eip` net still exists. |
