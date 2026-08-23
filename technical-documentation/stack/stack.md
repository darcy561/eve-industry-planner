# Swarm stack

Live SoT for Swarm stack name **`eip`**: fragment files, membership, replica identity, stop grace, and orchestration probe port. Bring-up → [guide.md](../deployment/guide.md); verbs → [verbs.md](../deployment/deployment-tool/cli/verbs.md). Edge → [traefik.md](./traefik.md). Networks → [network.md](./network.md).

## Fragment files

| File | Role |
|------|------|
| [`docker-stack.data.yml`](../../docker-stack.data.yml) | **Data** fragment — mongo, redis, nats, SeaweedFS (lean). Membership = top-level `services:` |
| [`docker-stack.yml`](../../docker-stack.yml) | **App** fragment — Traefik + api / websocket / worker / ws-router / core / frontend / **capacity-controller** (+ socket proxies) |
| [`docker-stack.obs.yml`](../../docker-stack.obs.yml) | **Obs** addon — **Prometheus**, Grafana/Loki/Alloy/exporters/asynqmon; merged only when `addons.observability.enabled` |
| [`docker-stack.dev.yml`](../../docker-stack.dev.yml) | **Dev overlay** — per-role `${TAG_*}` image refs (merged on `eip dev` / `eip rebuild`) |
| [`docker-stack.data.dev.yml`](../../docker-stack.data.dev.yml) | **Data dev overlay** — publishes mongo `27017` and redis `6379` on the host (`mode: host`) for local tooling; merged on `eip dev` / `eip rebuild` **when present**, never by `eip up` |

Operator YAML defaults → [config.md](./config.md). Secrets → [secrets.md](./secrets.md). Bake / image tags → [verbs.md](../deployment/deployment-tool/cli/verbs.md).

## Membership

```text
data   mongo · redis · nats · seaweedfs
app    traefik (+ traefik-docker-proxy) · frontend · api · websocket
       · worker · ws-router (+ ws-docker-proxy) · core
       · capacity-controller (+ capacity-docker-proxy)
obs*   prometheus · grafana · loki · alloy (+ alloy-docker-proxy)
       · exporters · asynqmon · node_exporter
```

\* When `addons.observability.enabled` merges `docker-stack.obs.yml` ([config.md](./config.md)).

**Prometheus is obs**, not data. Capacity controller Evaluate does not query Prom. Per-role Apply is gated by `services.*.capacity_controller_managed` in operator YAML. Controller behaviour → [capacity-controller.md](./capacity-controller.md). Overlay membership → [network.md](./network.md). Per-service behaviour → [backend/](../backend/contents.md). Operator capacity verbs → [verbs.md](../deployment/deployment-tool/cli/verbs.md) (`eip capacity`).

Data deploy runs first on bring-up, then data+app with `--prune`. App rolls (`eip rebuild` / `eip update`) must not bounce data-layer services unless their pinned image/config in stack YAML changed.

## Start-first deploy & stop grace

App services that roll **start-first** (`x-app-deploy`) also merge service-root **`stop_grace_period: 60s`** via YAML anchor `x-app-stop-grace` in [`docker-stack.yml`](../../docker-stack.yml).

| Piece | Value |
|-------|--------|
| Anchor | `x-app-stop-grace` → `stop_grace_period: 60s` |
| Consumers | traefik, api, websocket, ws-router, worker, core, frontend, capacity-controller |
| Not applied | `x-proxy-deploy` socket proxies (stop-first, short-lived) |

Compose puts grace **outside** `deploy:` — hence a separate service-root merge, not inside `x-app-deploy`.

Websocket process cleanup budget (`shutdownTimeout` / SIGTERM drain wait) is **60s** to match this grace — [websocket.md](../backend/websocket/websocket.md). Other start-first services may use shorter in-process timers; Docker still waits up to 60s before SIGKILL.

## Replica identity

Per-process identity is the Docker **short container id** — in-container `HOSTNAME` (default), externally `ContainerStatus.ContainerID[:12]`. Helper: [`container.ID()`](../../services/shared/container/id.go). Used for OTel `service.instance.id`, JetStream durable suffixes, placement backend keys / `PlacementState.container_id`, lease holders, and probes bus instance fields.

| Piece | Rule |
|-------|------|
| SoT | `container.ID()` from `HOSTNAME` (then `os.Hostname()`, then `"local"`) |
| Telemetry | OTel `service.name` + `service.instance.id` only — no parallel `ws_instance_id` |
| Stack env | Do **not** inject `OTEL_SERVICE_INSTANCE_ID` as identity SoT |
| Swarm `Task.Slot` | Orchestration ordinal only — not placement or durable identity |
| Continuity | Replacement containers get a **new** id; stale place → reassign; durables are deleted on graceful drain (crash backstop: JetStream `InactiveThreshold` + reconcile) |

**Do not** set the same identity on two live replicas of the same role. Traefik has no replica identity. ws-router placement stores **container ids**, not `websocket-N` slot names and not raw IPs. Operators target the **current** container id — do not teach pin/cordon/drain “across replace” via slot names.

## Probes

App roles expose orchestration probes on **`:19100`** (`/healthy`, `/ready`). Go SoT: `shared/orchestrationprobes.ListenPort` — stack literals must match. Traefik LB healthchecks for api / ws-router use `healthcheck.port=19100`. Core `/ready` = handoff-ready standby (not lease holder) — [core.md](../backend/core/core.md). Websocket `/ready` fails while local roll drain is in progress — [websocket.md](../backend/websocket/websocket.md).
