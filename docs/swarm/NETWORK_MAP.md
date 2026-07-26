# Network map (current hybrid)

> Snapshot of Docker networks and who dials whom. Source of truth for membership:
> [`docker-stack.yml`](../../docker-stack.yml), [`docker-stack.data.yml`](../../docker-stack.data.yml),
> [`docker-compose.yml`](../../docker-compose.yml). Bootstrap / overlay history: [NETWORK.md](./NETWORK.md).
> Traefik edge detail: [TRAEFIK.md](./TRAEFIK.md).

## How to read the layers

Traffic enters on **host ingress → Traefik**. Edge backends sit on **`eip-public`**. Everything that
needs mongo/redis/nats/S3 stays on **`eip`**. Docker socket proxies each get a **private island** —
never shared, never on `eip` / `eip-public`.

```text
0  Host / Swarm ingress
   └─ eip_traefik published :80 / :443 / :81

1  eip-public  (edge overlay, stack-owned)
   └─ traefik ↔ frontend · api · ws-router

2  eip  (mesh overlay, external attachable)
   └─ api · websocket · worker · core · ws-router · traefik*
      · seaweedfs · mongo · redis · nats · grafana · ops…

3  eip-docker-*  (proxy islands, one consumer each)
   ├─ eip-docker-traefik  → traefik-docker-proxy + traefik
   ├─ eip-docker-ws       → ws-docker-proxy + ws-router
   └─ eip-docker-alloy    → alloy-docker-proxy + alloy  (Compose bridge)
```

\* Traefik stays on `eip` for Prometheus scrape (`traefik:8082` alias) and docker-provider
backends (e.g. grafana).

## Membership matrix

| Service | Orchestrator | Networks | Role |
|---------|--------------|----------|------|
| traefik | Swarm | `eip` · `eip-public` · `eip-docker-traefik` | Ingress + edge LB + discovery |
| frontend | Swarm | `eip-public` | SPA only — Traefik peer |
| api | Swarm | `eip` · `eip-public` | Edge + mesh data plane |
| ws-router | Swarm | `eip` · `eip-public` · `eip-docker-ws` | Edge `/ws` + Redis + Docker API |
| websocket | Swarm | `eip` | Mesh only (no Traefik labels) |
| worker | Swarm | `eip` | Mesh only |
| core | Swarm | `eip` | Mesh only |
| seaweedfs | Swarm data | `eip` | S3 `:8333` alias |
| mongo / redis / nats | Compose | `eip` | Data plane |
| grafana | Compose | `eip` | Ops; Traefik docker provider |
| prometheus / loki / alloy | Compose | `eip` (+ alloy proxy net) | Obs stack |
| `*-docker-proxy` | Swarm/Compose | own island only | Never on `eip` or `eip-public` |

## Who dials whom

Logical client → server. **Via** is the Docker network that must contain both ends (or host
publish for Internet → Traefik).

| From | To | Via | Why |
|------|----|-----|-----|
| Internet / browser | traefik | host ingress | `:80`/`:443` publish |
| traefik | frontend | `eip-public` | PathPrefix `/` (swarm provider) |
| traefik | api | `eip-public` | PathPrefix `/api` |
| traefik | ws-router | `eip-public` | PathPrefix `/ws` |
| traefik | grafana | `eip` | docker provider PathPrefix `/grafana` |
| traefik | traefik-docker-proxy | `eip-docker-traefik` | providers.docker + swarm discovery `:2375` |
| frontend | — | `eip-public` only | Static SPA; no mesh deps (browser hits Traefik) |
| api | mongo / redis / nats / seaweedfs | `eip` | stack mesh anchors |
| websocket | mongo / redis / nats | `eip` | mesh only; not on `eip-public` |
| ws-router | redis | `eip` | placement / sticky state |
| ws-router | websocket tasks | `eip` (via Docker API) | routes to `eip_websocket` |
| ws-router | ws-docker-proxy | `eip-docker-ws` | `DOCKER_HOST` `:2375` |
| worker | mongo / redis / nats / seaweedfs | `eip` | jobs + object store |
| core | mongo / redis / nats / seaweedfs | `eip` | control plane / changestreams |
| prometheus | traefik `:8082` | `eip` | alias `traefik` (not host-published) |
| prometheus | exporters / alloy | `eip` | scrapes on mesh |
| alloy | loki / prometheus | `eip` | log + metric ship |
| alloy | alloy-docker-proxy | `eip-docker-alloy` | container log discovery |
| grafana | prometheus / loki | `eip` | datasources |
| asynqmon | redis | `eip` | queue UI |

## Per-network detail

### Host / Swarm ingress

- **Kind:** publish
- **Purpose:** Public entry `:80` / `:443` / `:81` → `eip_traefik` only
- **Members:** `eip_traefik` (published ports)

### `eip-public`

- **Kind:** overlay (stack-owned, not attachable)
- **Purpose:** Edge plane — Traefik reaches HTTP/WS backends
- **Members:** traefik, frontend, api, ws-router
- **Traefik:** `--providers.swarm.network=eip-public` and `traefik.swarm.network=eip-public` on edge services

### `eip`

- **Kind:** overlay attachable (external, create-once)
- **Purpose:** Mesh — app ↔ data plane + ops DNS by service name
- **Members:** traefik (alias `traefik`), api, websocket, ws-router, worker, core, seaweedfs (alias `seaweedfs`), mongo, redis, nats, grafana, prometheus, loki, alloy, asynqmon, exporters, …

### `eip-docker-traefik`

- **Kind:** overlay (stack)
- **Purpose:** Socket proxy island — Traefik → Docker API only
- **Members:** traefik-docker-proxy, traefik

### `eip-docker-ws`

- **Kind:** overlay (stack)
- **Purpose:** Socket proxy island — ws-router → Docker API only
- **Members:** ws-docker-proxy, ws-router

### `eip-docker-alloy`

- **Kind:** bridge (Compose)
- **Purpose:** Socket proxy island — Alloy → Docker API only
- **Members:** alloy-docker-proxy, alloy

## Suggested layering (matches current direction)

| Layer | Network | Members | Notes |
|-------|---------|---------|-------|
| **Edge** | `eip-public` | traefik · frontend · api · ws-router | Only paths browsers hit. Frontend has no reason to be on `eip`. |
| **Mesh** | `eip` | api · websocket · worker · core · data · ops | Dual-home edge services that also need DB/queue/S3. |
| **Privileged** | `eip-docker-*` | one proxy + one consumer each | Never merge Traefik/ws/alloy/capacity proxies onto one net. |

**Not on the edge plane (by design):** websocket, worker, core, seaweedfs, mongo, redis, nats.
Traefik never routes directly to websocket; `/ws` goes through ws-router, which then reaches
websocket tasks via Docker API + `eip`.
