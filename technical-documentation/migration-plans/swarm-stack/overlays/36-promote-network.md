# Docker Swarm networks

> **Promote draft** for live [`stack/network.md`](../../../stack/network.md). Not live SoT until go-ahead. Parent: [36-network-plane-polish.md](./36-network-plane-polish.md). Index: [36-promote-draft.md](./36-promote-draft.md).

## Changes vs live (review only — delete this section on promote)

Open this file in the editor (not Preview). `diff` fences use **red = removed / green = added**.

```diff
- Live SoT for overlay planes. …
+ Live SoT for Swarm overlay networks. …
+ Operator Access / Path / Base URL → config.md.
+ Day-2 labeled membership → eip sync / rematerialize.

- ## Planes
+ ## Networks

- eip-core Role: … dual-homed obs exporters / Alloy / Grafana
+ eip-core Role: … Grafana is **not** on mesh.

- eip-public: … (/grafana when obs on)
+ eip-public: … Grafana only when Access is **Public** (config.md)

- eip-obs: Obs plane — Loki / Grafana / Alloy / exporters / asynqmon
+ eip-obs: … + Prometheus attaches when obs is on

- diagram: grafana* on mesh; grafana* always on edge when obs
+ diagram: grafana† on edge only when Public; prometheus‡ under eip-obs when attached
+ † / ‡ footnotes → config.md + labeled membership

- data row: nats/redis/mongo/seaweedfs/prometheus → eip-core only
+ prometheus own row: eip-core; + eip-obs when obs on (labeled membership)
+ grafana: eip-obs; + eip-public when Public (detached from eip-core)
+ Not on edge: …; Grafana when Access is **Private**

+ ## Labeled network membership  (entire section new)
+   Why: day-2 attach/detach for overlays not always in static networks:
+   Prom↔eip-obs, Grafana edge + keep off mesh
+   Labels: eip.network.attach / .when / .detach
+   when: observability | grafana.public
+   Applied on rematerialize and eip sync

- traefik→grafana: PathPrefix `/grafana` (obs; web entrypoint today)
+ traefik→grafana: When Public — PathPrefix/entrypoints → traefik.md; knobs → config.md
+ prometheus → obs targets via eip-obs when attached

- Traefik provider networks: full docker/swarm table inline
+ one-hop → traefik.md (swarm.network from stack YAML)

- Host publish: EIP_*_PORT env names
+ Host publish: host ports from operator config; knobs → config.md / traefik.md

- Bootstrap: 3 steps (no membership)
+ Bootstrap step 3: labeled network membership after obs merge/prune and on eip sync
```

---

## Proposed live body (below)

Live SoT for Swarm overlay networks. Membership SoT is the stack fragments: [`docker-stack.data.yml`](../../../../docker-stack.data.yml), [`docker-stack.yml`](../../../../docker-stack.yml), [`docker-stack.obs.yml`](../../../../docker-stack.obs.yml). Edge Traefik → [traefik.md](../../../stack/traefik.md). Operator Access / Path / Base URL → [config.md](../../../stack/config.md). Bootstrap → **`eip up`** / **`eip dev`**. Day-2 labeled membership → **`eip sync`** / rematerialize.

## Networks

| Network | Kind | Attachable | Owner | Role |
|---------|------|------------|-------|------|
| **`eip-core`** | external overlay | **yes** (create-once) | `engine.Ready` from `external: true` in fragments | Mesh — data + app DNS; Traefik alias; Prometheus always. Obs exporters / Alloy dual-home when obs on. Grafana is **not** on mesh. |
| **`eip-public`** | stack overlay | no | app (+ obs) fragment | Edge — Traefik swarm provider ↔ frontend / api / ws-router; Grafana only when Access is **Public** ([config.md](../../../stack/config.md)) |
| **`eip-obs`** | stack overlay | yes | obs fragment | Obs overlay — Loki / Grafana / Alloy / exporters / asynqmon; Prometheus attaches when obs is on |
| **`eip-docker-traefik`** | stack overlay | no | app | Socket-proxy island — Traefik ↔ `traefik-docker-proxy:2375` |
| **`eip-docker-ws`** | stack overlay | no | app | Socket-proxy island — ws-router ↔ `ws-docker-proxy:2375` |
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
      · seaweedfs · mongo · redis · nats · prometheus
      · alloy* · asynqmon* · *-exporter*

3  eip-obs  (obs addon overlay)*
   └─ loki · alloy · grafana · asynqmon · exporters
      · prometheus‡

4  eip-docker-*  (one proxy + one consumer each)
   ├─ eip-docker-traefik  → traefik-docker-proxy + traefik
   ├─ eip-docker-ws       → ws-docker-proxy + ws-router
   └─ eip-docker-alloy*   → alloy-docker-proxy + alloy
```

\* Only when `addons.observability.enabled` deploys `docker-stack.obs.yml`.  
† Edge only when Access is **Public** — [config.md](../../../stack/config.md).  
‡ Data-fragment Prometheus; attached to `eip-obs` while the addon is on (labeled membership below).

## Membership matrix

| Service | Fragment | Networks | Notes |
|---------|----------|----------|-------|
| nats / redis / mongo / seaweedfs | data | `eip-core` | DNS aliases on mesh (`mongo`, `redis`, …) |
| prometheus | data | `eip-core`; + `eip-obs` when obs on | Mesh always; obs via labeled membership |
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
| grafana | obs | `eip-obs`; + `eip-public` when Public | Detached from `eip-core` — Access → [config.md](../../../stack/config.md) |
| asynqmon / *-exporter / node_exporter | obs | `eip-obs` · `eip-core` | dual-home so Prometheus can scrape |

**Not on the edge overlay (by design):** websocket, worker, core, seaweedfs, mongo, redis, nats, prometheus; Grafana when Access is **Private**.  
Traefik never routes directly to websocket; `/ws` → ws-router → Docker API + mesh to `eip_websocket` tasks.

## Labeled network membership

Some services need overlays that are **not** always in their static `networks:` list — e.g. Prometheus only on `eip-obs` while the addon is on, Grafana only on `eip-public` when Access is **Public**, and Grafana kept **off** `eip-core`. Stack fragments declare that intent with Swarm deploy labels; the Deployment Tool reads them and runs an idempotent attach/detach on rematerialize and **`eip sync`**.

Label **values** are Docker network **names** from fragment `x-net-*` anchors (same names as `networks.*.name`). Go resolves those strings; it does not hard-code overlay name lists.

| Label | Meaning |
|-------|---------|
| `eip.network.attach` | Network name(s) to attach when the gate passes **and** that network exists in the active fragment set |
| `eip.network.attach.when` | Optional gate: `observability` (addon on) or `grafana.public` (Access Public). Omit = attach whenever the network is active |
| `eip.network.detach` | Network name(s) always kept off the service (even if still listed elsewhere historically) |

**Today’s uses:** Prometheus → attach `eip-obs` when `observability`. Grafana → detach `eip-core`; attach `eip-public` when `grafana.public`. Operator knobs for those gates → [config.md](../../../stack/config.md).

## Who dials whom

| From | To | Via | Why |
|------|----|-----|-----|
| Internet / browser | traefik | host ingress | `:80` / `:443` (/ `:81` dashboard) |
| traefik | frontend | `eip-public` | PathPrefix `/` (swarm provider) |
| traefik | api | `eip-public` | PathPrefix `/api` |
| traefik | ws-router | `eip-public` | PathPrefix `/ws` |
| traefik | grafana | `eip-public` | When Public — PathPrefix / entrypoints → [traefik.md](../../../stack/traefik.md); knobs → [config.md](../../../stack/config.md) |
| traefik | traefik-docker-proxy | `eip-docker-traefik` | docker + swarm providers `:2375` |
| api / worker / core | mongo · redis · nats · seaweedfs | `eip-core` | mesh env anchors |
| websocket | mongo · redis · nats | `eip-core` | mesh only |
| ws-router | redis | `eip-core` | placement / sticky |
| ws-router | `eip_websocket` tasks | `eip-core` (via Docker API) | `DOCKER_HOST` → proxy |
| ws-router | ws-docker-proxy | `eip-docker-ws` | `:2375` |
| prometheus | traefik `:8082` · exporters · asynqmon | `eip-core` | scrapes on mesh (exporters dual-homed) |
| prometheus | obs targets | `eip-obs` when attached | when addon on |
| alloy | loki · prometheus | `eip-obs` / `eip-core` | log + remote write |
| alloy | alloy-docker-proxy | `eip-docker-alloy` | container discovery |
| grafana | prometheus · loki | `eip-obs` (prom dual-homed) | datasources |
| apps (OTLP) | alloy `:4317` | `eip-core` | when obs on |

## Traefik provider networks

Provider ↔ overlay wiring → [traefik.md](../../../stack/traefik.md). Swarm edge backends use `traefik.swarm.network` from stack YAML (edge overlay name).

## Mesh DNS anchors (app env)

From `docker-stack.yml` x-\*-env: `MONGO_HOST=mongo`, `REDIS_HOST=redis`, `NATS_URL=nats://nats:4222`, `S3_URL=http://seaweedfs:8333`. Short names are Swarm VIP / alias DNS on **`eip-core`**.

## Host publish

**Only** `eip_traefik`: host ports from operator config, `mode: ingress`. Port knobs → [config.md](../../../stack/config.md) / [traefik.md](../../../stack/traefik.md).

## Bootstrap

1. **`eip up` / `eip dev`** → `engine.Ready` ensures Swarm, then creates each **external** network from the fragment set as an **attachable overlay** (today: **`eip-core`** — name from YAML `external: true`).
2. Stack deploy creates stack-owned nets (`eip-public`, `eip-docker-*`, and when obs is on `eip-obs` / `eip-docker-alloy`).
3. After obs merge/prune (and on **`eip sync`**), labeled network membership runs.
4. Shutdown keeps volumes and **external** nets (`eip-core`); stack-owned nets go with the stack.
