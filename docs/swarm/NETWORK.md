# Shared Docker networks (`eip-core`, edge, obs, socket proxies)

> Part of [ROADMAP.md](./ROADMAP.md). Main mesh overlay is **`eip-core`** (renamed from `eip`).
> Created via `ensure-eip-overlay` / `make up` / `make dev` ([MAKE.md](./MAKE.md)).

## Planes

| Network | Role |
|---------|------|
| **`eip-core`** | Main attachable overlay — data plane, app train mesh, Traefik alias, SeaweedFS, Prometheus |
| **`eip-public`** | Edge overlay — Traefik + frontend + api + ws-router (Traefik swarm provider) |
| **`eip-obs`** | Observability addon overlay — loki/grafana/exporters (see `docker-stack.obs.yml`) |
| **`eip-docker-*`** | Per-consumer socket-proxy overlays (not on `eip-core`) |

**Edge:** Swarm Traefik provider uses `eip-public` (`--providers.swarm.network` / `traefik.swarm.network`). Api / ws-router dual-home (`eip-core` + `eip-public`). Frontend is edge-only.

**Obs addon:** services in `docker-stack.obs.yml` join `eip-obs`; Alloy also joins `eip-core` + `eip-docker-alloy`. When obs is on, Prometheus (data fragment) is dual-homed onto `eip-obs` by `eip` sync/up (not Compose).

Docker socket proxies each get a **stack-owned overlay** (`eip-docker-traefik`, `eip-docker-ws`, `eip-docker-alloy`, later `eip-docker-capacity`) — not shared across consumers. App replicas on `eip-core` cannot reach `:2375` by default.

## Bootstrap

```bash
make ensure-eip-network
# or: ./scripts/swarm/ensure-eip-network.sh
```

Creates a plain bridge when `eip-core` is missing. Hybrid / Swarm cutover:

```bash
make ensure-eip-overlay
```

Converts/creates **`eip-core`** as an attachable overlay. Override: `EIP_NETWORK_NAME` (default `eip-core`).

If you still have a legacy network named `eip`, stop containers on it, `docker network rm eip`, then `make ensure-eip-overlay` and recreate services.

## Acceptance

- Swarm services resolve mesh names on `eip-core` (`mongo`, `redis`, `nats`, `seaweedfs`, `prometheus`, `traefik`, …).
- Traefik providers use `eip-core` (docker) / `eip-public` (swarm).
- Obs fragment uses `eip-obs` + Alloy proxy net; Alloy on `eip-core` when addon is deployed.
