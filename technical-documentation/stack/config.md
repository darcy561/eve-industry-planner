# Operator config (`eip.config.yaml`)

Live SoT for non-secret operator YAML. Secrets → [secrets.md](./secrets.md). Apply verb → [verbs.md](../deployment/deployment-tool/cli/verbs.md) (`eip sync`). Networks → [network.md](./network.md). Traefik routes → [traefik.md](./traefik.md). Websocket soft/hard → [websocket.md](../backend/websocket/websocket.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Schema / starter values | `yamldefaults.DefaultConfig` | [`kit/templates/yamldefaults/default.go`](../../deployment-tool/internal/kit/templates/yamldefaults/default.go) |
| Editable field registry | `ConfigFields` | [`kit/templates/yamldefaults/fields.go`](../../deployment-tool/internal/kit/templates/yamldefaults/fields.go) |
| Live file | written by `eip init` when missing | project-home **`eip.config.yaml`** |
| `paths.grafana` | `/grafana` | Settings → **Grafana** → Path |
| `addons.observability.grafana.base_url` | `http://127.0.0.1` | Settings → **Grafana** → Base URL (scheme + host, no path) |
| `addons.observability.grafana.public` | `false` (Private) | Settings → **Grafana** → Access |

## YAML sections

| Section | Controls | Applied today? |
|---------|----------|----------------|
| **`services`** | Per-role capacity envelope for **api**, **websocket**, **worker** (required keys) | **Partially** — see below |
| **`ports`** | Host publish for Traefik (`http` / `https` / `traefik_dashboard`) | **`eip sync`** (+ bring-up expand) |
| **`paths`** | Traefik dashboard path; Grafana Path | **`eip sync`** (Grafana only if `eip_grafana` running) |
| **`proxy`** | Traefik `forwardedHeaders` trust (`trusted_ips`, `trusted_cidrs`) | **`eip sync`** |
| **`addons`** | `observability.enabled`; `observability.grafana` Access + Base URL | enabled → rematerialize; grafana knobs → **`eip sync`** when grafana running |
| **`scale_timing`** | Cooldown / stabilization windows | **Future work** — validated/stored; nothing consumes it yet |
| **`cli`** | Host Deployment Tool settings (e.g. `.env` backup stem) | **Host/TUI only** — never sent to containers |

### `services` keys (what each controls)

| Key | Roles | Meaning |
|-----|-------|---------|
| `min` | api, websocket, worker | Desired Swarm `deploy.replicas` on sync; also written to `eip.capacity.min` |
| `max` | api, websocket, worker | Ceiling label `eip.capacity.max` (sync keeps the label honest; automatic scale is future work) |
| `concurrency` | worker | Task env `WORKER_ASYNQ_CONCURRENCY` — [worker.md](../backend/worker/worker.md) |
| `client_cutoff` | websocket | Task env `WS_CLIENT_CUTOFF` — hard full placement flag + process refuse — [websocket.md](../backend/websocket/websocket.md) |
| `target_clients` | websocket | Task env `WS_TARGET_CLIENTS` — soft divert flag (prefer non-soft on new homes); `0` = off — [websocket.md](../backend/websocket/websocket.md) / [ws-router.md](../backend/ws-router/ws-router.md) |
| `capacity_controller_managed` | api, websocket, worker | **Future work** — kill-switch for automatic capacity control; unused today |
| `reserve_capacity` / `drain_timeout` | websocket | Policy / ops budget — `reserve_capacity` unused by sync today; `drain_timeout` is operator evacuate wait (not process stop grace) |

Validate: `client_cutoff` ≥ 0; `target_clients` ≥ 0; when both > 0 require `target_clients` ≤ `client_cutoff`.

Capacity sync membership is **label-discovered** in [`docker-stack.yml`](../../docker-stack.yml): only services with `eip.capacity.sync=1` (api / websocket / worker). ws-router has capacity labels but is **not** synced.

## What `eip sync` applies

Targeted Moby `ServiceUpdate` + Swarm file-config hash roll. Does **not** bounce mongo/redis/nats. Does **not** change images (`eip update` / `eip rebuild`). Manual `docker service scale` is overwritten next sync when `replicas` are re-asserted to `min`.

| From YAML | Swarm effect |
|-----------|--------------|
| `services.*.min` | `deploy.replicas` on capacity-sync services |
| `services.*.min` / `max` | Labels `eip.capacity.min` / `eip.capacity.max` |
| `services.worker.concurrency` | Env on `eip_worker` |
| `services.websocket.client_cutoff` | Env `WS_CLIENT_CUTOFF` on `eip_websocket` |
| `services.websocket.target_clients` | Env `WS_TARGET_CLIENTS` on `eip_websocket` |
| `ports.*` | Host publish on `eip_traefik` (container entrypoints stay `:80` / `:443` / `:81`) |
| `paths.traefik_dashboard` | Traefik dashboard PathPrefix label |
| `paths.grafana` + `addons.observability.grafana.base_url` | Grafana PathPrefix labels; `GF_SERVER_ROOT_URL` = Base URL + Path (blank base → `http://127.0.0.1`) — if `eip_grafana` running. Route labels → [traefik.md](./traefik.md) |
| `addons.observability.grafana.public` | Access Public / Private — edge membership → [network.md](./network.md); Traefik enable → [traefik.md](./traefik.md) |
| Labeled network membership | Prom ↔ `eip-obs` from obs toggle; Grafana edge from Access — [network.md](./network.md) |
| `proxy.trusted_*` | Traefik trusted-proxy / forwardedHeaders |
| File bodies for services labeled `eip.config.sync=1` | Hash-diff Swarm configs (Prometheus yml on data; Loki/Alloy/… when obs on) |

Bring-up / rematerialize also interpolates ports/paths/proxy into stack templates from this YAML. Stack YAML may keep bootstrap literals for `WS_CLIENT_CUTOFF` / `WS_TARGET_CLIENTS`; **live operator values** come from this YAML via sync.

`GRAFANA_ROOT_URL` is a SyncEnv expand bridge only — not a Secrets / `.env` field.

## Observability addon

Toggle: **`addons.observability.enabled`** (default **off**).

| On | Off |
|----|-----|
| Swarm merges [`docker-stack.obs.yml`](../../docker-stack.obs.yml): Grafana, Loki, Alloy (+ docker proxy), exporters, asynqmon, node_exporter | Obs services absent; apps must run without Alloy/Grafana |

**Prometheus stays on the data fragment** (`docker-stack.data.yml`) — always on, outside this toggle. Membership → [network.md](./network.md).

### Turning the addon on or off

`eip sync` does not add or remove the obs fragment. Toggle takes effect on stack rematerialize (bring-up or day-2 rematerialize — [deploy.md](../deployment/deployment-tool/cli/deploy.md), [verbs.md](../deployment/deployment-tool/cli/verbs.md)).

With the addon **off**, `eip sync` skips obs file-config stacks, Grafana apply, and Grafana edge membership (no `eip_grafana`).

### Grafana (when the addon is on)

TUI Settings → **Grafana**: Path, Base URL, Access.

| Access | Behaviour |
|--------|-----------|
| **Private** (default) | Internal only (`eip-obs`). |
| **Public** | On the site at Base URL + Path via Traefik. Requires non-empty Path. |

Networks → [network.md](./network.md). Traefik → [traefik.md](./traefik.md).

### What sync does when the addon is already on

| YAML / stack | Effect |
|--------------|--------|
| Path / Base URL / Access | Above + [traefik.md](./traefik.md) / [network.md](./network.md) |
| Obs services with `eip.config.sync=1` | Hash-sync embedded/host file configs (Loki, Alloy, …) when content changes |
| Data `eip_prometheus` (`eip.config.sync=1`) | Same hash-sync for `prometheus.yml` — independent of the addon toggle |
