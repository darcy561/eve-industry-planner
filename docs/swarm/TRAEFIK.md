# Traefik + Swarm edge (#4 / #31)

> Part of [ROADMAP.md](./ROADMAP.md). Hybrid edge: **Traefik runs as Swarm service
> `eip_traefik`** with **ingress** publish. It discovers Compose ops via the
> **Docker** provider and stack app services (api / ws-router / **frontend**, …) via the
> **Swarm** provider.
> Tenant-aware `/ws` placement is owned by **[`eip_ws_router`](./WS_ROUTER.md)** (Redis) —
> not Traefik hash-on-cookie (unavailable in Traefik v3).

## Status

| Piece | State |
|-------|--------|
| Traefik on Swarm stack (`eip_traefik`) | **Done** — `docker-stack.yml` |
| Host publish via Swarm **ingress** (`80`/`443`/`81`) | **Done — #31** (Desktop localhost OK) |
| `providers.swarm` + `network=eip-public` | Done — edge plane |
| `providers.docker.network=eip` | Done — Compose ops (grafana, …) |
| Stack labels `traefik.swarm.network=eip-public` | Done — frontend / api / ws-router |
| `/api` `/ws` / frontend reach stack tasks | Verified — `/ws` → **ws-router**; frontend via **swarm** provider (#16) |
| Sticky `eip_ws_affinity` on `/ws` | **Fallback only** — when affinity cookie/Redis missing |
| App tenant affinity cookie `eip_tenant_affinity` | **Done** — `account:{id}` at login/bootstrap/rotate |
| **ws-router** Redis placement | **Done** — replicas **1**, `start-first` |
| Hash on tenant affinity cookie value | **Not pursued** |
| Compose Traefik / Compose-elastic | **Removed** — Swarm edge + elastic only; recover with make up / make dev |

## Why Swarm ingress (#31)

Compose Traefik on attachable overlay `eip` with `ports: 80/443/81` often **hung** HTTP from
Windows Docker Desktop (`com.docker.backend` → overlay IP stayed `SYN_SENT`; in-network curl
was fine). Swarm **ingress** publish for the same Traefik image returns timely HTTP from
`http://127.0.0.1/` (including `/grafana` under `make dev`).

No permanent `eip-edge` nginx sidecar.

## Topology

```
Host :80/:443/:81
  → Swarm ingress mesh
  → eip_traefik (eip + eip-public + eip-docker-traefik; DNS alias `traefik` on eip)
       │  Docker API via eip_traefik-docker-proxy on eip-docker-traefik only
       ├─ providers.docker (network=eip)         → grafana, …
       └─ providers.swarm  (network=eip-public)  → eip_api, eip_ws-router, eip_frontend
```

Prometheus scrapes `traefik:8082` (network alias). Metrics entrypoint is **not** host-published.

## Traefik command (stack)

```
--providers.docker=true
--providers.docker.endpoint=tcp://traefik-docker-proxy:2375
--providers.docker.exposedbydefault=false
--providers.docker.network=eip
--providers.swarm=true
--providers.swarm.endpoint=tcp://traefik-docker-proxy:2375
--providers.swarm.exposedByDefault=false
--providers.swarm.network=eip-public
--providers.swarm.refreshSeconds=5
--ping=true
--ping.entrypoint=web
```

Docker API: **`eip_traefik-docker-proxy`** on overlay **`eip-docker-traefik`**
(`tecnativa/docker-socket-proxy:v0.4.2`) mounts the host sock; Traefik does not. Allowlist:
`CONTAINERS` + `SERVICES` + `TASKS` + `NETWORKS` + `NODES` + `EVENTS`, `POST=0` (read-only).
`NODES` is required so the swarm provider can inspect nodes when building routes. Wider than
`ws-docker-proxy` on purpose — do not merge the two, and do not reuse this proxy for #18
(controller gets its own overlay `eip-docker-capacity`). Image pinned `traefik:v3`
(third-party; not app-train).

## Bring-up / change Traefik

```bash
make up          # or make dev
# Traefik lands with make stack-deploy (part of up/dev)

make stack-deploy   # after editing docker-stack.yml Traefik flags/labels
```

App GHCR releases do **not** include Traefik — see ROADMAP **#23** (roll Traefik **alone first**
only when this image/flags change; then app-train waves).

**Host ports / public paths** come from operator YAML (`ports.*` / `paths.*`) via
**`make swarm-sync`** (#32). Container Traefik entrypoints stay **`:80` / `:443` / `:81`**;
YAML only changes **host published** ports and PathPrefix rules / Grafana root URL.

| YAML key | Role |
|----------|------|
| `ports.http` / `ports.https` | Swarm ingress host ports for app TLS/HTTP (defaults 80 / 443) |
| `ports.traefik_dashboard` | Host port for Traefik dashboard entrypoint (default 81) |
| `paths.grafana` | Traefik PathPrefix + `GF_SERVER_ROOT_URL` — not a separate host port |
| `paths.traefik_dashboard` | PathPrefix on the dashboard entrypoint (default `/dashboard`) |
| `proxy.trusted_ips` / `proxy.trusted_cidrs` | Optional bare IPs and CIDRs of a reverse proxy/CDN in front of Traefik → `forwardedHeaders.trustedIPs` on web/websecure (empty = direct peer; not vendor-specific) |

(Formerly sketched as `edge.publish` / `edge.paths` — renamed for operator clarity in #19.)

Day-2: edit YAML → **`make swarm-sync`** (targeted `eip_traefik` publish/label update; grafana-only
Compose recreate when `paths.grafana` changes). Fresh bring-up / `--full-stack` expands the same
keys from an **ephemeral** sync-env (`eip_sync_env_temp` / `eip_write_sync_env` — no durable
`.eip-sync.env`) into [`docker-stack.yml`](../../docker-stack.yml) and Compose files. Not `.env`
(secrets only). Needed when another stack claims 80/443, or operators want e.g. Grafana under a
different path. Addon UIs (asynqmon, …) get `paths.*` entries when exposed via Traefik under #34.

Verify host (Desktop OK after #31):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1/ping
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1/
```

In-network:

```bash
docker run --rm --network eip curlimages/curl:8.5.0 -sS -o /dev/null -w "%{http_code}\n" http://traefik/ping
```

Grafana under **`make dev`**: `http://127.0.0.1/grafana`. **`make up`** leaves Grafana
unpublished (Tailscale/tunnel). Full Grafana/Loki path → optional addon (#34); Prom stays with
capacity-controller setup (#18).

## Recovery

Re-run **`make up`** or **`make dev`** (same command as bring-up). There is no Compose Traefik or
Compose-elastic fallback — Desktop host publish requires Swarm ingress (`eip_traefik`).

## Affinity / placement model (#4)

**Locked:** Traefik `/ws` → Swarm **`eip_ws_router`**. Redis tenant→slot from
`eip_tenant_affinity`. Sticky cookie = fallback when cookie/Redis missing. Details: [WS_ROUTER.md](./WS_ROUTER.md).

**#21 next:** cordon / evacuate / pin on the same Redis map.

## Related

- [WS_ROUTER.md](./WS_ROUTER.md) — placement router  
- [MAKE.md](./MAKE.md) — hybrid bring-up  
- [STACK.md](./STACK.md) — stack services  
- [NETWORK.md](./NETWORK.md) — overlay `eip`  
- [ROADMAP.md](./ROADMAP.md) — #4 / #21 / #31  
