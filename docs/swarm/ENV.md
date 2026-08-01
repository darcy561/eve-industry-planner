# Secrets (`.env`) and day-2 apply (#24)

> Part of [ROADMAP.md](./ROADMAP.md). **`.env` = secrets.** Mesh hosts/URLs (mongo/redis/nats/S3)
> are injected by [`docker-stack.yml`](../../docker-stack.yml) anchors — not set in `.env`.
> Non-secret tunables (replicas, capacity, addon toggles) live in **`eip.config.yaml`** (#19).
> Apply YAML with **`make swarm-sync`**. Refresh elastic secrets from `.env` with
> **`make swarm-secrets-sync`** (#32). Containers do **not**
> reload env automatically.

## Two surfaces

| Surface | Contents | Apply |
|---------|----------|--------|
| **`.env`** | Secrets (DB passwords, SSO, HMAC keys, S3 keys, …) | Swarm services get secrets via **`eip secrets`** / legacy **`make swarm-secrets-sync`** (versioned `docker secret` + `/run/secrets/<KEY>`). Optional `MONGO_*_API` / `REDIS_*_API`: api prefers them when set (`ConnectAPI`), else shared creds. **Creating** those DB/ACL users is a later Ensure follow-up (ROADMAP) — not required for day-2. App S3 buckets: **`eip ensure-s3`** / Ready. Root/app mongo users + indexes: **`eip ensure-mongo`** / Ready. |
| **Stack anchors** (`x-mongo-env`, `x-redis-env`, …) | Mesh networking (`MONGO_HOST` / `REDIS_*` / `NATS_URL` / `S3_URL`) | Required by Go (no host fallbacks). Not secrets. |
| **`x-frontend-public-env`** | SPA public knobs (`EVE_CLIENT_ID`, callback/scope, `GA4_*`, `ENVIRONMENT`) | Stack task `environment` on `eip_frontend` — **no** docker secrets for FE |
| **Operator YAML** | Replicas / capacity / concurrency / `client_cutoff` / addons / ports/paths / `proxy.trusted_ips`+`trusted_cidrs` / `scale_timing` | `eip init` writes defaults from [`yamldefaults.DefaultConfig`](../../admintool/internal/kit/templates/yamldefaults/default.go). **`make swarm-sync`** validates + writes an **ephemeral** sync-env + targeted apply (capacity + Traefik ports/paths/proxy + Grafana path) and hash-diff Swarm file configs (`eip.config.sync`). Addon toggle (#34) still open |

| Verb | Applies |
|------|---------|
| `make swarm-sync` | Operator YAML → Swarm capacity / ports / paths |
| `make swarm-secrets-sync` | `.env` → elastic Swarm refresh (no YAML; no data-plane bounce) |

Word order differs on purpose so tab-complete / muscle memory cannot easily hit the wrong target.

### What `make swarm-sync` applies today

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
| `paths.grafana` | Compose grafana Traefik PathPrefix + `GF_SERVER_ROOT_URL` (recreate grafana only if running) |

Sync **does not** recreate mongo/redis/nats for these changes. Core and frontend are on Swarm (`eip_core`, `eip_frontend`) — sync may roll them only when stack env/spec changes. Changing concurrency or cutoff rolls the matching Swarm service(s) when the env/spec changes. Ports/paths roll Traefik briefly when publish/labels differ; Grafana path recreate only when `paths.grafana` differs and grafana is running. Setting `replicas` to `min` re-asserts the YAML desired count (manual `docker service scale` is overwritten on next sync).

Capacity/ports bridges are **ephemeral**: `scripts/lib/eip-config.sh` (`eip_sync_env_temp` / `eip_write_sync_env`) at stack expand and `make swarm-sync`. There is **no** durable `.eip-sync.env`. Temp files emit `EIP_HTTP_PORT`, `EIP_HTTPS_PORT`, `EIP_TRAEFIK_DASHBOARD_PORT`, `EIP_GRAFANA_PATH`, `EIP_TRAEFIK_DASHBOARD_PATH`, `EIP_TRAEFIK_TRUSTED_PROXY_CIDRS`, and `GRAFANA_ROOT_URL` for interpolation, then are removed.

```bash
eip init   # writes eip.config.yaml when missing (Go defaults)
# edit eip.config.yaml…
make swarm-sync ARGS='--dry-run'
make swarm-sync
```

> Prefer **`make swarm-sync`** for day-2 operator YAML. Prefer **`make swarm-secrets-sync`** when
> you changed `.env` secrets for elastic services. Bring-up (`make up` / `make dev`) rematerializes
> the Swarm stack internally — that is not a public day-2 verb.

### `make swarm-secrets-sync` (#32 / #3)

```bash
make swarm-secrets-sync ARGS='--dry-run'
make swarm-secrets-sync
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
| Operator YAML (`eip.config.yaml`) | **`eip sync`** (or legacy **`make swarm-sync`**) |
| Swarm secrets (SoT `.env` → `/run/secrets/<KEY>`) | **`eip secrets`** (or legacy **`make swarm-secrets-sync`**) |
| S3 app buckets (`static-data` / `static-data-test`) | **`eip ensure-s3`** / Ready on `eip up`/`dev` |
| Mongo desired state (RS/users/preimages/indexes/keyfile) | **`eip ensure-mongo`** / Ready on `eip up`/`dev` |
| Frontend public knobs (`x-frontend-public-env`) | Rematerialize stack; **no** docker secrets |

## Swarm data fragment (mongo / redis / nats / …)

Mongo, redis, and nats run on the Swarm **data fragment** (`docker-stack.data.yml`), not Compose.
After `.env` secret edits prefer **`eip secrets`**. Day-2 ensure without a full up/dev:
**`eip ensure-s3`** / **`eip ensure-mongo`**. Keyfile recovery: **`eip restore-mongo-keyfile`** / **`eip rekey-mongo`**.

Optional **Compose observability** addon (#34) may still use `--env-file .env` for Grafana/etc.

```bash
eip secrets
eip ensure-s3      # day-2 app buckets without full up/dev
eip ensure-mongo   # day-2 mongo ensure without full up/dev

# Legacy Make:
make swarm-secrets-sync
make update-data SERVICE=mongo
```

## Swarm stack (Traefik + api / websocket / worker / ws-router / core / frontend)

```bash
# Edit .env secrets, then:
eip secrets
# legacy: make swarm-secrets-sync
```

This syncs docker secrets and rolls services that mount them (`eip_api`, `eip_websocket`,
`eip_worker`, `eip_ws-router`, `eip_core`). Expect a rolling `start-first` update (brief WS
reconnects). Frontend has no secret mounts.

### Which vars need which path?

| Change | Typical action |
|--------|----------------|
| App secrets used by api/ws/worker/ws-router/core | `make swarm-secrets-sync` |
| Mongo/Redis/NATS passwords | Update `.env`, recreate **data-plane** Compose services, then `make swarm-secrets-sync` so consumers get new passwords |
| `APP_VERSION` (image tag) | **`.env` SoT** (non-secret). Used for GHCR tags, local bake base, task env, and Redis advertise. Not written by `eip.config` / sync-env. |
| Redis advertised train version (`eip:app:advertised_version:v1`) | **Ship only:** end of `make release` / `make dev-release`, or `make advertise` (reads `.env` `APP_VERSION`) — **not** `make swarm-sync`. [APP_TRAIN.md](./APP_TRAIN.md). Escape: `make app-version-ops` |
| Traefik stack flags / labels | Edit `docker-stack.yml`, then `make up` / `make dev` (or `make swarm-secrets-sync` if only secret attach changed) |
| Frontend public knobs | Edit stack `x-frontend-public-env`, then `make up` / `make dev` (no docker secrets) |
| Grafana / Alloy-only knobs | Compose recreate of those services only (become addon #34 later) |
| Worker concurrency (`services.worker.concurrency`) | `eip.config.yaml` → **`make swarm-sync`** — [WORKER.md](./WORKER.md) |
| Websocket client cutoff (`services.websocket.client_cutoff`) | `eip.config.yaml` → **`make swarm-sync`** — [WEBSOCKET.md](./WEBSOCKET.md) |

Exact `.env` key lists live in [`env.EnvFields`](../../admintool/internal/kit/templates/env/fields.go) — this doc is the **apply procedure**, not the schema.

## Acceptance (#24)

An operator can:

1. Change a documented **elastic** secret in `.env`  
2. Run **`make swarm-secrets-sync`** (optionally `ARGS='--dry-run'` first)  
3. Confirm tasks remount secrets (e.g. `docker exec` into an `eip_api` task and read
   `/run/secrets/<KEY>`) — **without** bouncing mongo/redis/nats  

And for non-secret knobs:

1. Edit `eip.config.yaml`  
2. Run **`make swarm-sync`**  
3. Capacity / ports / paths update without a data-plane bounce  

Do **not** teach raw `docker secret` for day-2 secret apply. Stack rematerialize is internal to
`make up` / `make swarm-secrets-sync` — not a separate public Make target.

**Out of #24:** creating Mongo/Redis `*_API` users (optional later — app falls back to shared
creds); observability addon toggle (#34).

## Bind mounts / Swarm secrets

`./adminSDK*.json` host binds are **removed** from stack/Compose (#32) — migration-only; see
[BIND_MOUNTS.md](./BIND_MOUNTS.md). Go `shared/core/swarmsecret` reads env then `/run/secrets/<name>`;
narrow loaders + api `ConnectAPI`. Swarm `secret` objects + per-service attach + **#16** frontend
on Swarm (public env only) are **done**. Optional `*_API` DB/ACL **user creation** is a data-plane
bootstrap follow-up. Day-2 verb: **`make swarm-secrets-sync`**.

## Related

- [MAKE.md](./MAKE.md) — bring-up vs day-2 sync/rebuild  
- [STACK.md](./STACK.md) — deploy / remove (implementer)  
- [WS_ROUTER.md](./WS_ROUTER.md) — placement router (`eip_ws_router`, landed)  
- [WORKER.md](./WORKER.md) — concurrency envelope (`services.worker.concurrency`)  
- [`yamldefaults.DefaultConfig`](../../admintool/internal/kit/templates/yamldefaults/default.go) — operator YAML defaults (#19)
- [WEBSOCKET.md](./WEBSOCKET.md) — drain / soft caps  
- [NETWORK.md](./NETWORK.md) — shared `eip` network  
- ROADMAP **#3** / **#16** / **#7** / **#19** / **#24** / **#32**  
