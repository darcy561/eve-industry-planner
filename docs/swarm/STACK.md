# Swarm stack — data fragment + app fragment (#5 / #4 / #31)

> Part of [ROADMAP.md](./ROADMAP.md). **Implementer** doc for the live hybrid stack:
> Swarm **data fragment** (SeaweedFS + Prometheus) then **app fragment** (Traefik + api / websocket / worker /
> ws-router / core / **frontend**) beside Compose mongo/redis/nats (+ ops). Public bring-up is [MAKE.md](./MAKE.md).
> Edge: [TRAEFIK.md](./TRAEFIK.md). Placement: [WS_ROUTER.md](./WS_ROUTER.md).

## Files

| File | Role |
|------|------|
| [`docker-stack.data.yml`](../../docker-stack.data.yml) | **Data-layer** fragment (SeaweedFS + **Prometheus** — not the observability addon). Membership = top-level `services:` in that file |
| [`docker-stack.yml`](../../docker-stack.yml) | **App-layer** fragment (not for `compose up`) |
| [`docker-stack.dev.yml`](../../docker-stack.dev.yml) | **dev overlay** — per-role `${TAG_api}` / `${TAG_core}` / … image refs for local bake |
| `.eip-local-build.env` (gitignored) | Bake output: `APP_VERSION`, `TAG_*`, `DIGEST_*` for `stack-deploy --dev` |
| [`eip.config.example.yaml`](../../eip.config.example.yaml) | Operator YAML draft (#19; worker #7 + websocket #8) |
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
[`eip.config.example.yaml`](../../eip.config.example.yaml) → `eip.config.yaml`. Apply with
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
3. Compose data plane (at least mongo / redis / nats; usually ops) on `eip`,
   so named volumes `eve-industry-planner_*` already exist (`traefik_data` / `core_data` are
   create-once in `stack-deploy` if missing).
4. `.env` with required `APP_VERSION=X.Y.Z` (image/bake/advertise SoT) plus secrets; `eip.config.yaml` for capacity/ports/paths (not version).
5. (Optional) `stack-deploy` stops leftover Compose api/websocket/worker/core/frontend/traefik from older installs.

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
make update-data SERVICE=seaweedfs   # data-layer only (not app train)
make update-data SERVICE=prometheus  # reload Prom image/config
make stack-rm                      # docker stack rm eip
```

Stack name: **`eip`** — data: `eip_seaweedfs`, `eip_prometheus` (DNS alias `prometheus`); app: `eip_traefik-docker-proxy` + `eip_traefik`,
`eip_api`, `eip_websocket`, `eip_worker`, `eip_ws-docker-proxy` + `eip_ws-router`, `eip_core`
(`start-first` handoff; orchestration probes `/ready` on `:19100`), **`eip_frontend`**
(`x-frontend-public-env`; Traefik swarm labels). Socket proxies sit on
**per-consumer** overlays (`eip-docker-traefik`, `eip-docker-ws`; Traefik/ws-router also on
`eip`); per-consumer allowlists; #18 gets its own proxy + `eip-docker-capacity` stub.

`make up` / `make dev` expand both fragments via `docker compose config`, deploy **data first**,
run `provision-s3.sh` (verify/create buckets), then deploy **data+app** with `--prune` so
Swarm drops services removed from the YAML. App train (`rebuild` / `release`) must not update
data-layer services. Data image/config day-2: **`make update-data`**.

## What this stack includes

- **SeaweedFS** (`eip_seaweedfs`, data fragment): S3 on overlay only (`seaweedfs:8333`); not host-published. Buckets `static-data` / `static-data-test` are `objectstore` constants.
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

- Least-privilege `*_API` DB users (create in Mongo/Redis) — data-plane bootstrap follow-up; app falls back until then (#3 attach path already landed)
- Controller soft-cutover / HTTP train cookie remainder of **#23**; capacity controller (**#18**)
- Observability addon toggle apply (**#34**)
- Proven hybrid DNS / affinity acceptance in CI (operator verifies locally; `#4` smoke is local)

## Acceptance checklist (local)

- [x] `eip` is overlay + attachable (smoke 2026-07-19)
- [x] Compose mongo/redis/nats healthy on `eip`
- [x] `make up` / `make dev` succeeds (`eip_traefik` 1/1, `eip_api` 1/1, `eip_websocket` 2/2, `eip_worker` 1/1, `eip_ws-router` 1/1, `eip_core` 1/1, `eip_frontend` 1/1)
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

