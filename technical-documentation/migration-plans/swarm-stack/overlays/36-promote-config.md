# Operator config (`eip.config.yaml`)

> **Promote draft** for live [`stack/config.md`](../../../stack/config.md). Not live SoT until go-ahead. Parent: [36-network-plane-polish.md](./36-network-plane-polish.md). Index: [36-promote-draft.md](./36-promote-draft.md).

## Changes vs live (review only — delete this section on promote)

Open this file in the editor (not Preview). `diff` fences use **red = removed / green = added**.

```diff
+ Networks → network.md. Traefik routes → traefik.md.

+ Image & defaults rows:
+   paths.grafana → Settings → Grafana → Path
+   addons.observability.grafana.base_url → Base URL (default http://127.0.0.1)
+   addons.observability.grafana.public → Access (default Private)

- paths: URL PathPrefix for Traefik dashboard and Grafana
+ paths: Traefik dashboard path; Grafana Path
+   Applied: eip sync (Grafana only if eip_grafana running)

- addons: only observability.enabled → Bring-up / rematerialize
+ addons: enabled + grafana Access + Base URL
+   enabled → rematerialize; grafana knobs → eip sync when grafana running

- sync table: paths.grafana → PathPrefix + GF_SERVER_ROOT_URL
+ paths.grafana + base_url → PathPrefix; GF_SERVER_ROOT_URL = Base + Path
+ addons…grafana.public → Access Public/Private (network + traefik)
+ Labeled network membership row (prom↔eip-obs; grafana edge)

+ GRAFANA_ROOT_URL is SyncEnv expand bridge only — not Secrets / .env

- Membership / networks → stack.md, network.md
+ Membership → network.md

- off: skips obs file-config + Grafana path apply
+ off: also skips Grafana edge membership

+ ## Grafana (when the addon is on)  (entire section new)
+   TUI: Path, Base URL, Access
+   Private = eip-obs only; Public = Base+Path via Traefik

- sync-when-on: paths.grafana only
+ Path / Base URL / Access (+ hops to traefik.md / network.md)

- Edge route for Grafana is under Traefik… (closing sentence)
+ (removed — one-hop from Grafana section instead)
```

---

## Proposed live body (below)

Live SoT for non-secret operator YAML. Secrets → [secrets.md](../../../stack/secrets.md). Apply verb → [verbs.md](../../../deployment/deployment-tool/cli/verbs.md) (`eip sync`). Networks → [network.md](../../../stack/network.md). Traefik routes → [traefik.md](../../../stack/traefik.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Schema / starter values | `yamldefaults.DefaultConfig` | [`kit/templates/yamldefaults/default.go`](../../../../deployment-tool/internal/kit/templates/yamldefaults/default.go) |
| Editable field registry | `ConfigFields` | [`kit/templates/yamldefaults/fields.go`](../../../../deployment-tool/internal/kit/templates/yamldefaults/fields.go) |
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
| `concurrency` | worker | Task env `WORKER_ASYNQ_CONCURRENCY` — [worker.md](../../../backend/worker/worker.md) |
| `client_cutoff` | websocket | Task env `WS_SLOT_CLIENT_CUTOFF` — [websocket.md](../../../backend/websocket/websocket.md) |
| `capacity_controller_managed` | api, websocket, worker | **Future work** — kill-switch for automatic capacity control; unused today |
| `target_clients` / `reserve_capacity` / `drain_timeout` | websocket | **Future work** — soft-cap / drain policy; unused by sync today |

Capacity sync membership is **label-discovered** in [`docker-stack.yml`](../../../../docker-stack.yml): only services with `eip.capacity.sync=1` (api / websocket / worker). ws-router has capacity labels but is **not** synced.

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
| `paths.grafana` + `addons.observability.grafana.base_url` | Grafana PathPrefix labels; `GF_SERVER_ROOT_URL` = Base URL + Path (blank base → `http://127.0.0.1`) — if `eip_grafana` running. Route labels → [traefik.md](../../../stack/traefik.md) |
| `addons.observability.grafana.public` | Access Public / Private — edge membership → [network.md](../../../stack/network.md); Traefik enable → [traefik.md](../../../stack/traefik.md) |
| Labeled network membership | Prom ↔ `eip-obs` from obs toggle; Grafana edge from Access — [network.md](../../../stack/network.md) |
| `proxy.trusted_*` | Traefik trusted-proxy / forwardedHeaders |
| File bodies for services labeled `eip.config.sync=1` | Hash-diff Swarm configs (Prometheus yml on data; Loki/Alloy/… when obs on) |

Bring-up / rematerialize also interpolates ports/paths/proxy into stack templates from this YAML.

`GRAFANA_ROOT_URL` is a SyncEnv expand bridge only — not a Secrets / `.env` field.

## Observability addon

Toggle: **`addons.observability.enabled`** (default **off**).

| On | Off |
|----|-----|
| Swarm merges [`docker-stack.obs.yml`](../../../../docker-stack.obs.yml): Grafana, Loki, Alloy (+ docker proxy), exporters, asynqmon, node_exporter | Obs services absent; apps must run without Alloy/Grafana |

**Prometheus stays on the data fragment** (`docker-stack.data.yml`) — always on, outside this toggle. Membership → [network.md](../../../stack/network.md).

### Turning the addon on or off

`eip sync` does not add or remove the obs fragment. Toggle takes effect on stack rematerialize (bring-up or day-2 rematerialize — [deploy.md](../../../deployment/deployment-tool/cli/deploy.md), [verbs.md](../../../deployment/deployment-tool/cli/verbs.md)).

With the addon **off**, `eip sync` skips obs file-config stacks, Grafana apply, and Grafana edge membership (no `eip_grafana`).

### Grafana (when the addon is on)

TUI Settings → **Grafana**: Path, Base URL, Access.

| Access | Behaviour |
|--------|-----------|
| **Private** (default) | Internal only (`eip-obs`). |
| **Public** | On the site at Base URL + Path via Traefik. Requires non-empty Path. |

Networks → [network.md](../../../stack/network.md). Traefik → [traefik.md](../../../stack/traefik.md).

### What sync does when the addon is already on

| YAML / stack | Effect |
|--------------|--------|
| Path / Base URL / Access | Above + [traefik.md](../../../stack/traefik.md) / [network.md](../../../stack/network.md) |
| Obs services with `eip.config.sync=1` | Hash-sync embedded/host file configs (Loki, Alloy, …) when content changes |
| Data `eip_prometheus` (`eip.config.sync=1`) | Same hash-sync for `prometheus.yml` — independent of the addon toggle |
