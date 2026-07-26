# Host bind mounts inventory (#3)

> Part of [ROADMAP.md](./ROADMAP.md). **Inventory** for remaining binds; **adminSDK** host binds
> removed from stack/Compose (#32). Public secrets file remains **`.env`** ([ENV.md](./ENV.md));
> mesh hosts/URLs come from stack anchors. Day-2 elastic secret refresh is **`make swarm-secrets-sync`**.
> Non-secret tunables stay in operator YAML (#19) via **`make swarm-sync`**. Real `docker secret`
> objects + per-service scope + narrow Go config are **done (#3)**; optional `*_API` DB users are a
> data-plane bootstrap follow-up.

## Goal

Elastic Swarm services should not depend on `./file` host binds for secrets. Compose data plane
may keep reading `.env` directly. Operators rotate `.env` secrets via **`make swarm-secrets-sync`**
— not raw `docker secret` as the primary UX.

## Host binds today

| Mount | Services | Class | Target |
|-------|----------|-------|--------|
| ~~`./adminSDK.json`, `./adminSDKLive.json`~~ | ~~api, worker, core~~ | **removed** | Migration-only; not mounted. Use `-credentials` / `GOOGLE_APPLICATION_CREDENTIALS` when running Firestore import tasks. Deletion of migration code is a different roadmap. |
| `./mongo-keyfile` | mongo | **secret** | Stay Compose; secret or generate-once named volume |
| `./scripts/bootstrap/mongo-setup.sh` | mongo | bootstrap script | Swarm data fragment bind (single-host); not `eip.config.sync` |
| ~~`./observability/prometheus/prometheus.yml`~~ | ~~Compose prometheus~~ | **moved** | Swarm data fragment: Docker **config** `prometheus_yml` → `eip_prometheus` (#18 plane; not #34 addon) |
| `./observability/loki/config.yaml` | loki | **config** | Observability addon (#34) |
| `./observability/alloy/config.alloy` | alloy | **config** | Observability addon (#34) |
| `./observability/grafana/provisioning` | grafana | **config** | Observability addon (#34) |

Also (not `./` host path but host-sensitive):

| Mount | Services | Class | Notes |
|-------|----------|-------|--------|
| `/var/run/docker.sock` | **`eip_traefik-docker-proxy`**, **`eip_ws-docker-proxy`**, Compose **`alloy-docker-proxy`** (ro) | runtime | Socket only on per-consumer proxies — not on Traefik / ws-router / alloy. Nets: `eip-docker-traefik` / `eip-docker-ws` / Compose `eip-docker-alloy`. (#18: `eip-docker-capacity`; never widen or share allowlists/nets) |
| Named volumes (`api_data`, `worker_data`, `*_data`) | elastic + data plane | **volume** | Already shared/external for stack — keep |
| SDE objects | api / worker / core | **SeaweedFS S3** (`static-data` bucket via `objectstore`) | Not a host/volume mount |

## Classification rules

- **secret** — SoT in `.env`; elastic runtime via Swarm secrets (`/run/secrets/<KEY>`) from `make swarm-secrets-sync`; never baked into images  
- **config** — non-secret files; prefer Docker configs / operator YAML / addon mounts  
- **volume** — durable app/DB state; named volumes only  

## Cutover order (#3)

1. Inventory complete (this doc).  
2. **Done (#32):** remove `adminSDK*` host binds from stack/Compose (no Swarm file-secret replacement — migration-only).  
3. **Done (#32 day-2 verb):** `make swarm-secrets-sync` rematerializes elastic from `.env` via stack-deploy (no YAML apply; no mongo/redis/nats bounce).  
4. **#3 (elastic done):** curated `.env` → versioned `docker secret` objects + `.eip-swarm-secrets.yml`
   per-service attach via `make swarm-secrets-sync`; Go `swarmsecret` reads `/run/secrets/<KEY>`.
   **#16 done:** frontend on Swarm with `x-frontend-public-env` (public knobs only; no docker secrets).  
5. Keep mongo keyfile/setup on Compose until data-plane playbooks need otherwise (#22).  
6. Observability file mounts follow addon packaging (#34), not the elastic secrets path.  
7. **Deferred (data-plane bootstrap):** create `MONGO_*_API` / `REDIS_*_API` DB users when wanted — app already falls back; secrets attach api-only if set. See ROADMAP Follow-ups.

## Status

| Item | State |
|------|--------|
| Inventory written | **Done** (Phase 0) |
| Elastic / Compose without `./adminSDK*` binds | **Done** (#32) |
| Documented rotate via `make swarm-secrets-sync` | **Done** (#32) — real Swarm `secret` objects + per-service attach |
| Stack injects mesh networking (hosts/URLs) | **Done** — secrets remain `.env` |
| Frontend on Swarm (public env; no FE secrets) | **Done** (#16) |
| Real Swarm `secret` objects + per-service scope + narrow Go config | **Done** (#3) |
| Least-privilege `*_API` DB users (create in Mongo/Redis) | **Deferred** — data-plane bootstrap follow-up |

## Related

- [ENV.md](./ENV.md) — secrets apply (`swarm-secrets-sync` vs `swarm-sync`)  
- [MAKE.md](./MAKE.md) — day-2 verbs  
- [STACK.md](./STACK.md) — stack file (no adminSDK binds)  
- ROADMAP **#3** / **#16** / **#24** / **#32** / **#34**  
