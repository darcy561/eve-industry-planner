# Swarm stack — data fragment + app fragment (#5 / #4 / #31)

> Part of [ROADMAP.md](./ROADMAP.md). **Implementer** doc for the live stack:
> Swarm **data fragment** (mongo / redis / nats / SeaweedFS / Prometheus) then **app fragment** (Traefik + api /
> websocket / worker / ws-router / core / **frontend**); optional Compose observability ops. Preferred bring-up:
> [`eip up`](../admintool/ENGINEERING.md) / `eip dev`. Make remains legacy reference ([MAKE.md](./MAKE.md)).
> Edge: [TRAEFIK.md](./TRAEFIK.md). Placement: [WS_ROUTER.md](./WS_ROUTER.md).

## Files

| File | Role |
|------|------|
| [`docker-stack.data.yml`](../../docker-stack.data.yml) | **Data-layer** fragment (mongo, redis, nats, SeaweedFS, **Prometheus** — not the observability addon). Membership = top-level `services:` in that file |
| [`docker-stack.yml`](../../docker-stack.yml) | **App-layer** fragment (not for `compose up`) |
| [`docker-stack.dev.yml`](../../docker-stack.dev.yml) | **dev overlay** — per-role `${TAG_api}` / `${TAG_core}` / … image refs for local bake |
| `.eip-local-build.env` (gitignored) | Bake output: `APP_VERSION`, `TAG_*`, `DIGEST_*` for `stack-deploy --dev` |
| [`yamldefaults.DefaultConfig`](../../admintool/internal/kit/templates/yamldefaults/default.go) | Operator YAML defaults (#19; worker #7 + websocket #8) → live `eip.config.yaml` |
| [`NETWORK.md`](./NETWORK.md) | `eip` bridge → overlay before stack |
| [`IDENTITY.md`](./IDENTITY.md) | `*-{{.Task.Slot}}` env contract |
| [`ENV.md`](./ENV.md) | Secrets apply / ephemeral sync-env |
| [`TRAEFIK.md`](./TRAEFIK.md) | Swarm Traefik + ingress (#31) |
| [`WS_ROUTER.md`](./WS_ROUTER.md) | `/ws` placement router (Redis) |
| [`WORKER.md`](./WORKER.md) | Asynq concurrency × replicas (#7) |
| [`WEBSOCKET.md`](./WEBSOCKET.md) | Drain / soft caps (#8) |
| [`CORE_REBUILD.md`](./CORE_REBUILD.md) | Core SeaweedFS + primary lease + Redis handoff resume |

## Operator config (#19)

Non-secret tunables (replicas, capacity, ports/paths, scale_timing, addons) live in
`eip.config.yaml` (defaults from [`yamldefaults.DefaultConfig`](../../admintool/internal/kit/templates/yamldefaults/default.go) via `eip init`). Apply with
`make swarm-sync` (#32): capacity for services labeled `eip.capacity.sync=1` (api / websocket /
worker — not ws-router) + Traefik host ports/paths + Grafana path + file configs
(`eip.config.sync`). Addon toggle (#34) still open. Until synced:

- Swarm ceilings ≈ `eip.capacity.min/max` labels in this stack file  
- Worker concurrency ≈ env bridge + binary cap ([WORKER.md](./WORKER.md))  
- Drain playbook ≈ [WEBSOCKET.md](./WEBSOCKET.md)  

See [ENV.md](./ENV.md) for the example-vs-live comparison table.

## Prerequisites

1. Docker **Swarm** active (`make ensure-swarm` — init only if needed; does **not**
   mutate cluster-wide orchestration settings).
2. External **`eip`** as **attachable overlay** — see [NETWORK.md](./NETWORK.md).  
3. Data-layer Swarm services (mongo / redis / nats / seaweedfs / prometheus) on `eip` via the data fragment;
   named volumes `eve-industry-planner_*` created by `eip` engine Ready / stack deploy as needed.
4. `.env` with required `APP_VERSION=X.Y.Z` (image/bake/advertise SoT) plus secrets; `eip.config.yaml` for capacity/ports/paths (not version).
5. Data-plane desired state via `dataplane.Ready` — concurrent `EnsureS3` (app buckets) and
   `EnsureMongo` (RS, users, preimages, indexes, keyfile) on `eip up`/`dev`, or day-2 with
   `eip ensure-s3` / `eip ensure-mongo` (see [ENGINEERING.md](../admintool/ENGINEERING.md)).
6. (Optional) leftover Compose api/websocket/worker/core/frontend/traefik from older installs should be removed.

## Swarm task history (optional Desktop hygiene)

Docker keeps exited task containers for rollback inspect. Retention is a **Swarm cluster**
setting (`task-history-limit`) — **per replica slot**, and **shared by every service on that
Swarm** (not EIP-only). EIP **does not** change it from `make ensure-swarm` / `make up`.

For a machine used mainly for this project, keeping **2** old tasks per slot is a reasonable
manual default:

```bash
docker swarm update --task-history-limit 2
```

Leave Docker’s default (often 5) if other stacks share the same Swarm. EIP’s product “keep 2
versions” release story is the **GHCR app-train / #23** wave model — not this Daemon knob.

## Deploy via make up / make dev

Preferred public path: **`make up`** (GHCR) or **`make dev`** (bake local tags).
Details: [MAKE.md](./MAKE.md).

Day-2 secrets / operator YAML (public):

```bash
make swarm-secrets-sync        # .env → Swarm secrets + rematerialize (no data-plane bounce)
make swarm-sync                # eip.config.yaml → capacity / ports / paths / concurrency / cutoff
```

Implementer notes (not public day-2 verbs):

```bash
# Prefer eip up / eip rebuild (pinned images). Legacy: make update-data SERVICE=…
make stack-rm                      # docker stack rm eip
```

Stack name: **`eip`** — data: `eip_seaweedfs`, `eip_prometheus` (DNS alias `prometheus`); app: `eip_traefik-docker-proxy` + `eip_traefik`,
`eip_api`, `eip_websocket`, `eip_worker`, `eip_ws-docker-proxy` + `eip_ws-router`, `eip_core`
(`start-first` handoff; orchestration probes `/ready` on `:19100`), **`eip_frontend`**
(`x-frontend-public-env`; Traefik swarm labels). Socket proxies sit on
**per-consumer** overlays (`eip-docker-traefik`, `eip-docker-ws`; Traefik/ws-router also on
`eip`); per-consumer allowlists; #18 gets its own proxy + `eip-docker-capacity` stub.

`eip up` / `eip dev` deploy **data first**, run `dataplane.Ready` (`EnsureS3` ‖ `EnsureMongo`), then
deploy **data+app** with `--prune`. Make’s `stack-deploy` path is legacy and does **not** run Ready.
App rolls (`eip rebuild` / `eip up`) must not bounce data-layer services unless their
pinned image/config in stack YAML changed. Prefer rematerialize via eip; do not use
Make `release` / `update-data` (legacy).

## What this stack includes

- **mongo** (`eip_mongo`, data fragment): auth-first single-node RS (`rs0`); host `./mongo-keyfile`. Desired state (RS, users, preimages, **indexes**) = admintool `EnsureMongo` — not core boot, not `mongo-setup.sh`.
- **redis** / **nats** (`eip_redis`, `eip_nats`, data fragment): mesh data plane on `eip`.
- **SeaweedFS** (`eip_seaweedfs`, data fragment): S3 on overlay only (`seaweedfs:8333`); not host-published. App buckets `static-data` / `static-data-test` via admintool `EnsureS3` (`AppBuckets` / `objectstore` constants).
- **Prometheus** (`eip_prometheus`, data fragment): metrics TSDB for capacity controller (#18); DNS alias `prometheus` on `eip` (Alloy remote-write + Grafana). Label `eip.config.sync=1` → hash-synced Swarm config from `observability/prometheus/prometheus.yml` (`make swarm-sync` / `make release`; overlay `.eip-swarm-configs.yml`). Volume `eve-industry-planner_prometheus_data`. **Not** part of the observability addon (#34).
- **SDE:** api/worker/core use `shared/core/objectstore` (object keys `live_data/`, `previous_versions/`, …). Empty bucket is fine — worker rebuilds from CCP live data. Traefik gates api on `/ready`.
- **Traefik** (`eip_traefik`): ingress `80`/`443`/`81`, dual providers via **`eip_traefik-docker-proxy`** (no sock on Traefik), DNS alias `traefik` (#31)
- Slot-stable `OTEL_SERVICE_INSTANCE_ID`: `api-{{.Task.Slot}}`, `websocket-{{.Task.Slot}}`,
  `worker-{{.Task.Slot}}`, `ws-router-{{.Task.Slot}}`; core uses fixed `core`
- `deploy.update_config.order: start-first` for edge + elastic + **core** (primary lease handoff; `/ready` on `:19100` = standby OK, not lease holder)
- **Core:** `lease:core:primary` + changestream Redis resume (`eip:core:handoff:v1:`) — see [CORE_REBUILD.md](./CORE_REBUILD.md)
- App services expose orchestration probes on **`:19100`** (`/healthy`, `/ready`); Traefik LB healthchecks for api/ws-router use `healthcheck.port=19100`. Go SoT: `shared/orchestrationprobes.ListenPort` — stack literals must match.
- External volumes shared with Compose (`eve-industry-planner_api_data`, `…_traefik_data`, …)
- Placeholder volume `eve-industry-planner_capacity_config` for later `#19` mount
- Traefik labels under `deploy.labels` — `/ws` + CORS on **ws-router**
- Optional `eip.capacity.*` label mirrors for humans / future controller

## What it does not include yet

- Least-privilege `*_API` DB users (create in Mongo/Redis) — future Ensure follow-up; app falls back until then (#3 attach path already landed)
- Controller soft-cutover / HTTP train cookie remainder of **#23**; capacity controller (**#18**)
- Observability addon toggle apply (**#34**)
- Proven hybrid DNS / affinity acceptance in CI (operator verifies locally; `#4` smoke is local)

## Acceptance checklist (local)

- [x] `eip` is overlay + attachable (smoke 2026-07-19)
- [x] Swarm data-fragment mongo/redis/nats healthy on `eip` (`EnsureMongo` for mongo desired state)
- [x] `eip up` / `eip dev` (or legacy `make up` / `make dev`) succeeds (`eip_traefik` 1/1, `eip_api` 1/1, `eip_websocket` 2/2, `eip_worker` 1/1, `eip_ws-router` 1/1, `eip_core` 1/1, `eip_frontend` 1/1)
- [x] Frontend on Swarm (#16) — public env via `x-frontend-public-env`; bake/train with app roles
- [x] From an `eip_api` task: resolve `mongo`, `redis`, `nats` by name
- [x] Websocket tasks show distinct `OTEL_SERVICE_INSTANCE_ID` (`websocket-1`, `websocket-2`)
- [x] Traefik swarm provider routes `/api` to stack; `/ws` → **ws-router**
- [x] Tenant affinity cookie set at login (`account:{id}`)
- [x] ws-router on stack (`replicas: 1`, start-first); Redis placement path live (#4 impl)
- [x] **#31** — Traefik on Swarm ingress; Windows `http://127.0.0.1/` and `/grafana/login` (dev)
- [x] Same tenant → same slot (#4 acceptance — `make smoke-ws-placement`, 2026-07-19)
- [x] Core `start-first` primary lease handoff + Redis changestream resume (#9–#13)
- [x] Core dual-publisher failover tests (#28 — `go test ./core/leadership/…`)
- [x] #21 minimum — cordon/pin/evacuate Redis overlays (`make ws-placement-ops`, 2026-07-19)
- [ ] Durable continuity after `service scale` / recreate
- [x] Bind-mount secrets cutover (#3 — Swarm secrets + narrow loaders; BIND_MOUNTS.md)
- [x] Day-2 apply docs (#24 — `swarm-secrets-sync` / `swarm-sync`; ENV.md / DEPLOYMENT.md)

## Related

- [MAKE.md](./MAKE.md) — public bring-up  
- [TRAEFIK.md](./TRAEFIK.md) — edge  
- [NETWORK.md](./NETWORK.md) — overlay  
- [WS_ROUTER.md](./WS_ROUTER.md) — placement  
- [ROADMAP.md](./ROADMAP.md) — backlog index  
- [CORE_REBUILD.md](./CORE_REBUILD.md) — core primary / SeaweedFS  

