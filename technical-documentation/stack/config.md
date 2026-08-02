# Operator config (`eip.config.yaml`)

Live SoT for non-secret operator YAML. Secrets → [secrets.md](./secrets.md). Apply verb → [verbs.md](../deployment/deployment-tool/cli/verbs.md) (`eip sync`).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Schema / starter values | `yamldefaults.DefaultConfig` | [`kit/templates/yamldefaults/default.go`](../../deployment-tool/internal/kit/templates/yamldefaults/default.go) |
| Editable field registry | `ConfigFields` | [`kit/templates/yamldefaults/fields.go`](../../deployment-tool/internal/kit/templates/yamldefaults/fields.go) |
| Live file | written by `eip init` when missing | project-home **`eip.config.yaml`** |

## YAML sections

| Section | Controls | Applied today? |
|---------|----------|----------------|
| **`services`** | Per-role capacity envelope for **api**, **websocket**, **worker** (required keys) | **Partially** — see below |
| **`ports`** | Host publish for Traefik (`http` / `https` / `traefik_dashboard`) | **`eip sync`** (+ bring-up expand) |
| **`paths`** | URL PathPrefix for Traefik dashboard and Grafana | **`eip sync`** (Grafana only if obs running) |
| **`proxy`** | Traefik `forwardedHeaders` trust (`trusted_ips`, `trusted_cidrs`) | **`eip sync`** |
| **`addons`** | Optional fragments — today only `observability.enabled` | **Bring-up / rematerialize** (not `eip sync` alone) |
| **`scale_timing`** | Cooldown / stabilization windows | **Future work** — validated/stored; nothing consumes it yet |
| **`cli`** | Host Deployment Tool settings (e.g. `.env` backup stem) | **Host/TUI only** — never sent to containers |

### `services` keys (what each controls)

| Key | Roles | Meaning |
|-----|-------|---------|
| `min` | api, websocket, worker | Desired Swarm `deploy.replicas` on sync; also written to `eip.capacity.min` |
| `max` | api, websocket, worker | Ceiling label `eip.capacity.max` (sync keeps the label honest; automatic scale is future work) |
| `concurrency` | worker | Task env `WORKER_ASYNQ_CONCURRENCY` — [worker.md](../backend/worker/worker.md) |
| `client_cutoff` | websocket | Task env `WS_SLOT_CLIENT_CUTOFF` — [websocket.md](../backend/websocket/websocket.md) |
| `capacity_controller_managed` | api, websocket, worker | **Future work** — kill-switch for automatic capacity control; unused today |
| `target_clients` / `reserve_capacity` / `drain_timeout` | websocket | **Future work** — soft-cap / drain policy; unused by sync today |

Capacity sync membership is **label-discovered** in [`docker-stack.yml`](../../docker-stack.yml): only services with `eip.capacity.sync=1` (api / websocket / worker). ws-router has capacity labels but is **not** synced.

## What `eip sync` applies

Targeted Moby `ServiceUpdate` + Swarm file-config hash roll. Does **not** bounce mongo/redis/nats. Does **not** change images (`eip update` / `eip rebuild`). Manual `docker service scale` is overwritten next sync when `replicas` are re-asserted to `min`.

| From YAML | Swarm effect |
|-----------|--------------|
| `services.*.min` | `deploy.replicas` on capacity-sync services |
| `services.*.min` / `max` | Labels `eip.capacity.min` / `eip.capacity.max` |
| `services.worker.concurrency` | Env on `eip_worker` |
| `services.websocket.client_cutoff` | Env on `eip_websocket` |
| `ports.*` | Host publish on `eip_traefik` (container entrypoints stay `:80` / `:443` / `:81`) |
| `paths.traefik_dashboard` | Traefik dashboard PathPrefix label |
| `paths.grafana` | Grafana PathPrefix + `GF_SERVER_ROOT_URL` — **only if** `eip_grafana` is running |
| `proxy.trusted_*` | Traefik trusted-proxy / forwardedHeaders |
| File bodies for services labeled `eip.config.sync=1` | Hash-diff Swarm configs (Prometheus yml on data; Loki/Alloy/… when obs on) |

Bring-up / rematerialize also interpolates ports/paths/proxy into stack templates from this YAML.

## Observability addon

Toggle: **`addons.observability.enabled`** (default **off**).

| On | Off |
|----|-----|
| Swarm merges [`docker-stack.obs.yml`](../../docker-stack.obs.yml): Grafana, Loki, Alloy (+ docker proxy), exporters, asynqmon, node_exporter | Obs services absent; apps must run without Alloy/Grafana |

**Prometheus stays on the data fragment** (`docker-stack.data.yml`) — always on, outside this toggle. Membership / networks → [stack.md](./stack.md), [network.md](./network.md).

### Turning the addon on or off

`eip sync` does not add or remove the obs fragment. Toggle takes effect on stack rematerialize (bring-up or day-2 rematerialize — [deploy.md](../deployment/deployment-tool/cli/deploy.md), [verbs.md](../deployment/deployment-tool/cli/verbs.md)).

With the addon **off**, `eip sync` skips obs file-config stacks and skips Grafana path apply (no `eip_grafana`).

### What sync does when the addon is already on

| YAML / stack | Effect |
|--------------|--------|
| `paths.grafana` | Updates Grafana Traefik PathPrefix + `GF_SERVER_ROOT_URL` |
| Obs services with `eip.config.sync=1` | Hash-sync embedded/host file configs (Loki, Alloy, …) when content changes |
| Data `eip_prometheus` (`eip.config.sync=1`) | Same hash-sync for `prometheus.yml` — independent of the addon toggle |

Edge route for Grafana is under Traefik on `eip-public` — [traefik.md](./traefik.md).
