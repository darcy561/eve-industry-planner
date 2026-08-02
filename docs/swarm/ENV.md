# Secrets (`.env`) and day-2 apply (#24)

> Part of [ROADMAP.md](./ROADMAP.md). **`.env` = secrets.** Mesh hosts/URLs (mongo/redis/nats/S3)
> are injected by [`docker-stack.yml`](../../docker-stack.yml) anchors — not set in `.env`.
> Non-secret tunables (replicas, capacity, addon toggles) live in **`eip.config.yaml`** (#19).
> Day-2: **`eip sync`** (YAML) and **`eip secrets`** (`.env` → Swarm secrets).
> Containers do **not** reload env automatically.

## Two surfaces

| Surface | Contents | Apply |
|---------|----------|--------|
| **`.env`** | Secrets (DB passwords, SSO, HMAC keys, S3 keys, …) | Swarm services get secrets via **`eip secrets`** (Moby Engine API → versioned Swarm secret objects + `/run/secrets/<KEY>`). Optional `MONGO_*_API` / `REDIS_*_API`: api prefers them when set (`ConnectAPI`), else shared creds. **Creating** those DB/ACL users is a later Ensure follow-up (ROADMAP) — not required for day-2. App S3 buckets: **`eip ensure-s3`** / Ready. Root/app mongo users + indexes: **`eip ensure-mongo`** / Ready. |
| **Stack anchors** (`x-mongo-env`, `x-redis-env`, …) | Mesh networking (`MONGO_HOST` / `REDIS_*` / `NATS_URL` / `S3_URL`) | Required by Go (no host fallbacks). Not secrets. |
| **`x-frontend-public-env`** | SPA public knobs (`EVE_CLIENT_ID`, callback/scope, `GA4_*`, `ENVIRONMENT`) | Stack task `environment` on `eip_frontend` — **no** docker secrets for FE |
| **Operator YAML** | Replicas / capacity / concurrency / `client_cutoff` / addons / ports/paths / `proxy.trusted_ips`+`trusted_cidrs` / `scale_timing` | `eip init` writes defaults from [`yamldefaults.DefaultConfig`](../../admintool/internal/kit/templates/yamldefaults/default.go). **`eip sync`** validates + targeted apply (capacity + Traefik ports/paths/proxy + Grafana path) and hash-diff Swarm file configs (`eip.config.sync`). Obs addon (#34): `addons.observability.enabled` merges/prunes Swarm `docker-stack.obs.yml` on up/dev/rematerialize. |

| Verb | Applies |
|------|---------|
| **`eip sync`** | Operator YAML → Swarm capacity / ports / paths |
| **`eip secrets`** | `.env` → elastic Swarm refresh (no YAML; no data-plane bounce) |

### What sync applies today (`eip sync`)

Capacity membership is **label-discovered**: stack services with `eip.capacity.sync=1` in
[`docker-stack.yml`](../../docker-stack.yml) (api / websocket / worker). `eip.capacity.*` alone
is not enough — ws-router has capacity labels but is not synced. File configs use
`eip.config.sync=1` (separate).

| YAML field | Stack effect |
|------------|--------------|
| `services.*.min` | `deploy.replicas` for capacity-sync services |
| `services.*.min` / `max` | `eip.capacity.min` / `max` labels |
| `services.worker.concurrency` | Task env on `eip_worker` via **`docker service update`** (not sync-env expand) |
| `services.websocket.client_cutoff` | Task env on `eip_websocket` via **`docker service update`** (not sync-env expand) |
| `ports.http` / `https` / `traefik_dashboard` | Host publish on `eip_traefik` (container entrypoints stay `:80`/`:443`/`:81`) |
| `paths.traefik_dashboard` | Traefik dashboard PathPrefix label on `eip_traefik` |
| `paths.grafana` | Obs Grafana Traefik PathPrefix + `GF_SERVER_ROOT_URL` (when addon enabled) |

Sync **does not** recreate mongo/redis/nats for these changes. Core and frontend are on Swarm (`eip_core`, `eip_frontend`) — sync may roll them only when stack env/spec changes. Changing concurrency or cutoff rolls the matching Swarm service(s) when the env/spec changes. Ports/paths roll Traefik briefly when publish/labels differ; Grafana path recreate only when `paths.grafana` differs and grafana is running. Setting `replicas` to `min` re-asserts the YAML desired count (manual `docker service scale` is overwritten on next sync).

Capacity/ports bridges are **ephemeral** at stack expand and sync. There is **no** durable `.eip-sync.env`. Temp files emit `EIP_HTTP_PORT`, `EIP_HTTPS_PORT`, `EIP_TRAEFIK_DASHBOARD_PORT`, `EIP_GRAFANA_PATH`, `EIP_TRAEFIK_DASHBOARD_PATH`, `EIP_TRAEFIK_TRUSTED_PROXY_CIDRS`, and `GRAFANA_ROOT_URL` for interpolation, then are removed.

```bash
eip init   # writes eip.config.yaml when missing (Go defaults)
# edit eip.config.yaml…
eip sync --dry-run
eip sync
```

> Prefer **`eip sync`** for day-2 operator YAML. Prefer **`eip secrets`** when you changed `.env`
> secrets for elastic services. Bring-up (`eip up` / `eip dev`) rematerializes the Swarm stack
> internally — that is not a public day-2 verb.

### `eip secrets` (#32 / #3)

```bash
eip secrets --dry-run
eip secrets
```

1. Reads curated keys from `.env` → creates versioned Swarm secrets (`eip_<KEY>_<hash>`).
2. Writes `.eip-swarm-secrets.yml` (external secret map + per-service attach).
3. Rematerializes the stack so `eip_api` / `eip_websocket` / `eip_worker` / `eip_ws-router` /
   `eip_core` remount `/run/secrets/<KEY>` (Go: `swarmsecret.Get` / `Require`). Frontend has
   **no** secret attach (public env only).

Does **not** read operator YAML and does **not** bounce mongo/redis/nats. Mesh hosts stay stack
anchors; non-secret knobs (`EVE_CLIENT_ID`, ports, …) stay task `environment`.

## Rule of thumb

| Runtime | After editing |
|---------|----------------|
| Operator YAML (`eip.config.yaml`) | **`eip sync`** |
| Swarm secrets (SoT `.env` → `/run/secrets/<KEY>`) | **`eip secrets`** |
| S3 app buckets (`static-data` / `static-data-test`) | **`eip ensure-s3`** / Ready on `eip up`/`dev` |
| Mongo desired state (RS/users/preimages/indexes/keyfile) | **`eip ensure-mongo`** / Ready on `eip up`/`dev` |
| Frontend public knobs (`x-frontend-public-env`) | Rematerialize stack; **no** docker secrets |

## Swarm data fragment (mongo / redis / nats / …)

Mongo, redis, and nats run on the Swarm **data fragment** (`docker-stack.data.yml`), not Compose.
After `.env` secret edits prefer **`eip secrets`**. Day-2 ensure without a full up/dev:
**`eip ensure-s3`** / **`eip ensure-mongo`**. Keyfile recovery: **`eip restore-mongo-keyfile`** / **`eip rekey-mongo`**.

Optional **Swarm observability** addon (#34) uses stack env / Swarm configs for Grafana/etc.

```bash
eip secrets
eip ensure-s3      # day-2 app buckets without full up/dev
eip ensure-mongo   # day-2 mongo ensure without full up/dev
```

## Swarm stack (Traefik + api / websocket / worker / ws-router / core / frontend)

```bash
# Edit .env secrets, then:
eip secrets
```

This creates/updates versioned Swarm secret objects (via **`eip secrets`** / Moby API) and
rematerializes services that mount them (`eip_api`, `eip_websocket`, `eip_worker`,
`eip_ws-router`, `eip_core`). Expect a rolling `start-first` update (brief WS reconnects).
Frontend has no secret mounts.

### Which vars need which path?

| Change | Typical action |
|--------|----------------|
| App secrets used by api/ws/worker/ws-router/core | `eip secrets` |
| Mongo/Redis/NATS passwords | Update `.env`, recreate **data-plane** services as needed, then `eip secrets` so consumers get new passwords |
| `APP_VERSION` (image tag) | **`.env` SoT** (non-secret). Used for GHCR tags, local bake base, task env. Day-2 ship: **`eip update`** / **`eip rebuild`** — [ENGINEERING.md](../admintool/ENGINEERING.md). Not written by `eip.config` / sync-env. |
| Redis advertised version (`eip:app:advertised_version:v1`) | FE SoT polish — may be set on bring-up/ship paths; **not** `eip sync` and not a ship gate. |
| Traefik stack flags / labels | Edit `docker-stack.yml`, then `eip up` / `eip dev` (or `eip secrets` if only secret attach changed) |
| Frontend public knobs | Edit stack `x-frontend-public-env`, then `eip up` / `eip dev` (no docker secrets) |
| Grafana / Alloy-only knobs | Obs fragment (`docker-stack.obs.yml`) — enable via YAML + `eip up`/`dev` / rematerialize (#34) |
| Worker concurrency (`services.worker.concurrency`) | `eip.config.yaml` → **`eip sync`** — [WORKER.md](./WORKER.md) |
| Websocket client cutoff (`services.websocket.client_cutoff`) | `eip.config.yaml` → **`eip sync`** — [WEBSOCKET.md](./WEBSOCKET.md) |

Exact `.env` key lists live in [`env.EnvFields`](../../admintool/internal/kit/templates/env/fields.go) — this doc is the **apply procedure**, not the schema.

## Acceptance (#24)

An operator can:

1. Change a documented **elastic** secret in `.env`  
2. Run **`eip secrets`**  
3. Confirm tasks remount secrets (e.g. `docker exec` into an `eip_api` task and read
   `/run/secrets/<KEY>`) — **without** bouncing mongo/redis/nats  

And for non-secret knobs:

1. Edit `eip.config.yaml`  
2. Run **`eip sync`**  
3. Capacity / ports / paths update without a data-plane bounce  

Do **not** teach raw `docker secret` for day-2 secret apply (`eip` uses the Moby Engine API).
Stack rematerialize is internal to `eip up` / `eip secrets` — not a separate public verb.

**Out of #24:** creating Mongo/Redis `*_API` users (optional later — app falls back to shared
creds). Obs addon toggle is **#34** (done).

## Remaining host binds

Elastic secrets are Swarm `secret` objects (`/run/secrets/<KEY>` via **`eip secrets`**), not
`./file` binds. Go `shared/core/swarmsecret` reads env then `/run/secrets/<name>`. Obs service
YAML is Swarm **configs** on `docker-stack.obs.yml`, not `./observability/...` mounts.

| Mount | Where | Notes |
|-------|--------|--------|
| `./mongo-keyfile` | `eip_mongo` (data fragment) | Host SoT for RS keyFile; `EnsureMongo` / `eip restore-mongo-keyfile` / `eip rekey-mongo` |
| `/var/run/docker.sock` | Traefik / ws-router / alloy **docker proxies** only | Never on Traefik / ws-router / alloy themselves; separate overlays (`eip-docker-*`) |
| `/` → `/host` | `node-exporter` (obs fragment) | Read-only rootfs for host metrics |
| Named volumes (`*_data`) | elastic + data plane | Durable state — keep |

SDE lives in SeaweedFS (`static-data` via `objectstore`), not a host/volume mount.
`./adminSDK*.json` binds are gone (migration-only). Optional `*_API` DB/ACL **user creation**
is a data-plane Ensure follow-up.

## Related

- [DEPLOYMENT.md](../DEPLOYMENT.md) — Public bootstrap / `eip up`
- [STACK.md](./STACK.md) — deploy / remove (implementer)  
- [WS_ROUTER.md](./WS_ROUTER.md) — placement router (`eip_ws_router`, landed)  
- [WORKER.md](./WORKER.md) — concurrency envelope (`services.worker.concurrency`)  
- [`yamldefaults.DefaultConfig`](../../admintool/internal/kit/templates/yamldefaults/default.go) — operator YAML defaults (#19)
- [WEBSOCKET.md](./WEBSOCKET.md) — drain / soft caps  
- [NETWORK.md](./NETWORK.md) — Swarm network planes (`eip-core`, edge, obs, proxies)
- [ENGINEERING.md](../admintool/ENGINEERING.md) — `EnsureS3` / `EnsureMongo` / Ready  
- ROADMAP **#3** / **#16** / **#7** / **#19** / **#24** / **#32**  
