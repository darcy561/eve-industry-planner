# Docker Swarm networks

Live SoT for Swarm overlay networks. Membership SoT is the stack fragments: [`docker-stack.data.yml`](../../docker-stack.data.yml), [`docker-stack.yml`](../../docker-stack.yml), [`docker-stack.obs.yml`](../../docker-stack.obs.yml). Edge Traefik → [traefik.md](./traefik.md). Operator Access / Path / Base URL → [config.md](./config.md). Bootstrap → **`eip up`** / **`eip dev`**. Day-2 labeled membership → **`eip sync`** / rematerialize.

## Networks

| Network | Kind | Attachable | Owner | Role |
|---------|------|------------|-------|------|
| **`eip-core`** | external overlay | **yes** (create-once) | `engine.Ready` from `external: true` in fragments | Mesh — data + app DNS; Traefik alias. Obs exporters / Alloy / Prometheus dual-home when obs on. Grafana is **not** on mesh. |
| **`eip-public`** | stack overlay | no | app (+ obs) fragment | Edge — Traefik swarm provider ↔ frontend / api / ws-router; Grafana only when Access is **Public** ([config.md](./config.md)) |
| **`eip-obs`** | stack overlay | yes | obs fragment | Obs overlay — Prometheus / Loki / Grafana / Alloy / exporters / asynqmon |
| **`eip-docker-traefik`** | stack overlay | no | app | Socket-proxy island — Traefik ↔ `traefik-docker-proxy:2375` |
| **`eip-docker-ws`** | stack overlay | no | app | Socket-proxy island — ws-router ↔ `ws-docker-proxy:2375` |
| **`eip-docker-capacity`** | stack overlay | no | app | Socket-proxy island — capacity-controller ↔ `capacity-docker-proxy:2375` (`POST` allowed for Scale) |
| **`eip-docker-alloy`** | stack overlay | no | obs | Socket-proxy island — Alloy ↔ `alloy-docker-proxy:2375` |
| Swarm **ingress** | built-in | — | Engine | Host publish for Traefik only (`mode: ingress`) |

**Trust rule:** never put a docker-socket proxy on `eip-core` / `eip-public` / `eip-obs`, and never share one `eip-docker-*` net across consumers.

```text
0  Host / Swarm ingress
   └─ eip_traefik published :80 / :443 / :81  (mode: ingress)

1  eip-public  (edge overlay)
   └─ traefik ↔ frontend · api · ws-router · grafana†

2  eip-core  (mesh overlay, external attachable)
   └─ api · websocket · worker · core · ws-router · traefik
      · capacity-controller · seaweedfs · mongo · redis · nats
      · prometheus* · alloy* · asynqmon* · *-exporter*

3  eip-obs  (obs addon overlay)*
   └─ prometheus · loki · alloy · grafana · asynqmon · exporters

4  eip-docker-*  (one proxy + one consumer each)
   ├─ eip-docker-traefik    → traefik-docker-proxy + traefik
   ├─ eip-docker-ws         → ws-docker-proxy + ws-router
   ├─ eip-docker-capacity   → capacity-docker-proxy + capacity-controller
   └─ eip-docker-alloy*     → alloy-docker-proxy + alloy
```

\* Only when `addons.observability.enabled` deploys `docker-stack.obs.yml`.  
† Edge only when Access is **Public** — [config.md](./config.md).

## Membership matrix

| Service | Fragment | Networks | Notes |
|---------|----------|----------|-------|
| nats / redis / mongo / seaweedfs | data | `eip-core` | DNS aliases on mesh (`mongo`, `redis`, …) |
| traefik-docker-proxy | app | `eip-docker-traefik` | never on mesh/edge |
| traefik | app | `eip-core` · `eip-public` · `eip-docker-traefik` | alias `traefik` on mesh; **only** host publish |
| frontend | app | `eip-public` | edge-only SPA |
| api | app | `eip-core` · `eip-public` | dual-home |
| websocket | app | `eip-core` | mesh only (no Traefik labels) |
| ws-docker-proxy | app | `eip-docker-ws` | never on mesh/edge |
| ws-router | app | `eip-core` · `eip-public` · `eip-docker-ws` | dual-home + Docker API |
| worker / core | app | `eip-core` | mesh only |
| capacity-docker-proxy | app | `eip-docker-capacity` | never on mesh/edge; `POST=1` for Scale |
| capacity-controller | app | `eip-core` · `eip-docker-capacity` | mesh + Docker API; policy Swarm config mount |
| prometheus | obs | `eip-obs` · `eip-core` | dual-home (static); only when obs on |
| loki | obs | `eip-obs` | |
| alloy-docker-proxy | obs | `eip-docker-alloy` | never on mesh/obs for the proxy itself |
| alloy | obs | `eip-obs` · `eip-core` · `eip-docker-alloy` | OTLP target `alloy:4317` from apps |
| grafana | obs | `eip-obs`; + `eip-public` when Public | Detached from `eip-core` — Access → [config.md](./config.md) |
| asynqmon / *-exporter / node_exporter | obs | `eip-obs` · `eip-core` | dual-home so Prometheus can scrape |

**Not on the edge overlay (by design):** websocket, worker, core, capacity-controller, seaweedfs, mongo, redis, nats, prometheus; Grafana when Access is **Private**.  
Traefik never routes directly to websocket; `/ws` → ws-router → Docker API + mesh to `eip_websocket` tasks.

## Labeled network membership

Some services need overlays that are **not** always in their static `networks:` list — e.g. Grafana only on `eip-public` when Access is **Public**, and Grafana kept **off** `eip-core`. Stack fragments declare that intent with Swarm deploy labels; the Deployment Tool reads them and runs an idempotent attach/detach on rematerialize and **`eip sync`**.

Label **values** are Docker network **names** from fragment `x-net-*` anchors (same names as `networks.*.name`). Go resolves those strings; it does not hard-code overlay name lists.

| Label | Meaning |
|-------|---------|
| `eip.network.attach` | Network name(s) to attach when the gate passes **and** that network exists in the active fragment set |
| `eip.network.attach.when` | Optional gate: `observability` (addon on) or `grafana.public` (Access Public). Omit = attach whenever the network is active |
| `eip.network.detach` | Network name(s) always kept off the service |

**Today’s uses:** Grafana → detach `eip-core`; attach `eip-public` when `grafana.public`. Prometheus is **static** dual-home on the obs fragment (`eip-obs` + `eip-core`) — not labeled attach. Operator knobs → [config.md](./config.md).

## Who dials whom

| From | To | Via | Why |
|------|----|-----|-----|
| Internet / browser | traefik | host ingress | `:80` / `:443` (/ `:81` dashboard) |
| traefik | frontend | `eip-public` | PathPrefix `/` (swarm provider) |
| traefik | api | `eip-public` | PathPrefix `/api` |
| traefik | ws-router | `eip-public` | PathPrefix `/ws` |
| traefik | grafana | `eip-public` | When Public — PathPrefix / entrypoints → [traefik.md](./traefik.md); knobs → [config.md](./config.md) |
| traefik | traefik-docker-proxy | `eip-docker-traefik` | docker + swarm providers `:2375` |
| api / worker / core | mongo · redis · nats · seaweedfs | `eip-core` | mesh env anchors |
| websocket | mongo · redis · nats | `eip-core` | mesh only |
| ws-router | redis | `eip-core` | placement / sticky |
| ws-router | `eip_websocket` tasks | `eip-core` (via Docker API) | `DOCKER_HOST` → proxy |
| ws-router | ws-docker-proxy | `eip-docker-ws` | `:2375` |
| capacity-controller | capacity-docker-proxy | `eip-docker-capacity` | `:2375` (Scale / inspect) |
| capacity-controller | redis · nats · app roles | `eip-core` | Observe / health / `ws.command.*` |
| prometheus | traefik `:8082` · exporters · asynqmon | `eip-core` | scrapes on mesh when obs on |
| prometheus | loki / grafana / obs targets | `eip-obs` | when addon on |
| alloy | loki · prometheus | `eip-obs` / `eip-core` | log + remote write |
| alloy | alloy-docker-proxy | `eip-docker-alloy` | container discovery |
| grafana | prometheus · loki | `eip-obs` | datasources |
| apps (OTLP) | alloy `:4317` | `eip-core` | when obs on |

## Traefik provider networks

Provider ↔ overlay wiring → [traefik.md](./traefik.md). Swarm edge backends use `traefik.swarm.network` from stack YAML (edge overlay name).

## Mesh DNS anchors (app env)

From `docker-stack.yml` x-\*-env: `MONGO_HOST=mongo`, `REDIS_HOST=redis`, `NATS_URL=nats://nats:4222`, `S3_URL=http://seaweedfs:8333`. Short names are Swarm VIP / alias DNS on **`eip-core`**.

## Host publish

**Only** `eip_traefik`: host ports from operator config, `mode: ingress`. Port knobs → [config.md](./config.md) / [traefik.md](./traefik.md).

## Bootstrap

1. **`eip up` / `eip dev`** → `engine.Ready` ensures Swarm, then creates each **external** network from the fragment set as an **attachable overlay** (today: **`eip-core`** — name from YAML `external: true`).
2. Stack deploy creates stack-owned nets (`eip-public`, `eip-docker-*`, and when obs is on `eip-obs` / `eip-docker-alloy`).
3. After obs merge/prune (and on **`eip sync`**), labeled network membership runs.
4. Shutdown keeps volumes and **external** nets (`eip-core`); stack-owned nets go with the stack.
