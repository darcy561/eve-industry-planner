# Secrets (`.env`)

Live SoT: **`.env` = secrets.** Mesh hosts/URLs (mongo/redis/nats/S3) are stack anchors in [`docker-stack.yml`](../../docker-stack.yml) — not set in `.env`. Non-secret tunables → [config.md](./config.md). Apply verbs → [verbs.md](../deployment/deployment-tool/cli/verbs.md).

## Defaults / Change

| Piece | Default | Change |
|-------|---------|--------|
| Secret key list / emit | curated `EnvFields` | [`kit/templates/env/fields.go`](../../deployment-tool/internal/kit/templates/env/fields.go) |
| Live secrets file | (operator-filled) | project-home **`.env`** |
| Swarm secret objects | versioned `eip_<KEY>_<hash>` | Deployment Tool **`eip secrets`** (Moby Secret*) |
| Task mounts | `/run/secrets/<KEY>` | same; Go `swarmsecret.Get` / `Require` |

Containers do **not** reload env automatically. Prefer **`eip secrets`** after editing `.env` secrets for elastic services.

`APP_VERSION` also lives in `.env` (non-secret image/tag SoT). Day-2 ship → [verbs.md](../deployment/deployment-tool/cli/verbs.md) (`eip update` / `eip rebuild`).

## Surfaces

| Surface | Contents |
|---------|----------|
| **`.env`** | Secrets (DB passwords, SSO, HMAC keys, S3 keys, …). Optional `MONGO_*_API` / `REDIS_*_API`: api prefers them when set (`ConnectAPI`), else shared creds. |
| **Stack anchors** (`x-mongo-env`, …) | Mesh networking (`MONGO_HOST` / `REDIS_*` / `NATS_URL` / `S3_URL`) — required by Go; not secrets. |
| **`x-frontend-public-env`** | SPA public knobs (`EVE_CLIENT_ID`, callback/scope, `GA4_*`, `ENVIRONMENT`) on `eip_frontend` task env — **no** docker secrets for FE. |

## Swarm secret attach

**`eip secrets`** creates/updates versioned Swarm secrets and rematerializes services that mount them:

- `eip_api`, `eip_websocket`, `eip_worker`, `eip_ws-router`, `eip_core` → `/run/secrets/<KEY>`
- **Not** `eip_frontend` (public env only)
- Does **not** bounce mongo/redis/nats

## Remaining host binds

Elastic secrets are Swarm `secret` objects at `/run/secrets/<KEY>`. Obs file configs are Swarm **configs** from `docker-stack.obs.yml` (hash-synced).

| Mount | Where | Notes |
|-------|--------|--------|
| `./mongo-keyfile` | `eip_mongo` (data fragment) | Host SoT for RS keyFile; `EnsureMongo` / `eip restore-mongo-keyfile` / `eip rekey-mongo` |
| `/var/run/docker.sock` | Traefik / ws-router / alloy **docker proxies** only | Proxies only — not on Traefik / ws-router / alloy themselves; overlays → [network.md](./network.md) |
| `/` → `/host` | `node-exporter` (obs fragment) | Read-only rootfs for host metrics |
| Named volumes (`*_data`) | elastic + data plane | Durable state |

SDE lives in SeaweedFS (`static-data` via `objectstore`). Data-plane ensure → [deploy.md](../deployment/deployment-tool/cli/deploy.md).
