# Swarm stack

Live SoT for Swarm stack name **`eip`**: fragment files, membership, replica identity, stop grace, and orchestration probe port. Bring-up → [guide.md](../deployment/guide.md); verbs → [verbs.md](../deployment/deployment-tool/cli/verbs.md). Edge → [traefik.md](./traefik.md). Networks → [network.md](./network.md).

## Fragment files

| File | Role |
|------|------|
| [`docker-stack.data.yml`](../../docker-stack.data.yml) | **Data** fragment — mongo, redis, nats, SeaweedFS, **Prometheus** (not the obs addon). Membership = top-level `services:` |
| [`docker-stack.yml`](../../docker-stack.yml) | **App** fragment — Traefik + api / websocket / worker / ws-router / core / frontend + socket proxies |
| [`docker-stack.obs.yml`](../../docker-stack.obs.yml) | **Obs** addon — Grafana/Loki/Alloy/exporters/asynqmon; merged only when `addons.observability.enabled` |
| [`docker-stack.dev.yml`](../../docker-stack.dev.yml) | **Dev overlay** — per-role `${TAG_*}` image refs (merged on `eip dev` / `eip rebuild`) |

Operator YAML defaults → [config.md](./config.md). Secrets → [secrets.md](./secrets.md). Bake / image tags → [verbs.md](../deployment/deployment-tool/cli/verbs.md).

## Membership

```text
data   mongo · redis · nats · seaweedfs · prometheus
app    traefik (+ traefik-docker-proxy) · frontend · api · websocket
       · worker · ws-router (+ ws-docker-proxy) · core
obs*   grafana · loki · alloy (+ alloy-docker-proxy) · exporters · asynqmon · node_exporter
```

\* When `addons.observability.enabled` merges `docker-stack.obs.yml` ([config.md](./config.md)).

**Prometheus is data**, not obs. Overlay membership → [network.md](./network.md). Per-service behaviour → [backend/](../backend/contents.md).

Data deploy runs first on bring-up, then data+app with `--prune`. App rolls (`eip rebuild` / `eip update`) must not bounce data-layer services unless their pinned image/config in stack YAML changed.

## Start-first deploy & stop grace

App services that roll **start-first** (`x-app-deploy`) also merge service-root **`stop_grace_period: 60s`** via YAML anchor `x-app-stop-grace` in [`docker-stack.yml`](../../docker-stack.yml).

| Piece | Value |
|-------|--------|
| Anchor | `x-app-stop-grace` → `stop_grace_period: 60s` |
| Consumers | traefik, api, websocket, ws-router, worker, core, frontend |
| Not applied | `x-proxy-deploy` socket proxies (stop-first, short-lived) |

Compose puts grace **outside** `deploy:` — hence a separate service-root merge, not inside `x-app-deploy`.

Websocket process cleanup budget (`shutdownTimeout` / SIGTERM drain wait) is **60s** to match this grace — [websocket.md](../backend/websocket/websocket.md). Other start-first services may use shorter in-process timers; Docker still waits up to 60s before SIGKILL.

## Replica identity

Stable per-process IDs for JetStream durables, OTLP `service.instance.id`, and `ws_instance_id` metrics. Stack SoT in [`docker-stack.yml`](../../docker-stack.yml); resolution in [`instanceid.Replica`](../../services/shared/core/instanceid/replica.go).

| Service | `OTEL_SERVICE_INSTANCE_ID` |
|---------|----------------------------|
| api | `api-{{.Task.Slot}}` |
| websocket | `websocket-{{.Task.Slot}}` |
| worker | `worker-{{.Task.Slot}}` |
| ws-router | `ws-router-{{.Task.Slot}}` |
| core | fixed `core` (`replicas: 1`) |

Resolution order: `OTEL_SERVICE_INSTANCE_ID` → `WS_CONSUMER_NAME` → `DOCKER_CONTAINER_NAME` → `CONTAINER_NAME` → `HOSTNAME` → `os.Hostname()` → `"local"` (sanitized, max 64). **Do not** set the same id on two live replicas of the same role. After `service scale` / recreate, the same slot must reuse the same suffix so durables stay continuous. Traefik has no slot id. ws-router placement stores **slot ids** (`websocket-N`), not raw IPs.

## Probes

App roles expose orchestration probes on **`:19100`** (`/healthy`, `/ready`). Go SoT: `shared/orchestrationprobes.ListenPort` — stack literals must match. Traefik LB healthchecks for api / ws-router use `healthcheck.port=19100`. Core `/ready` = handoff-ready standby (not lease holder) — [core.md](../backend/core/core.md). Websocket `/ready` fails while local roll drain is in progress — [websocket.md](../backend/websocket/websocket.md).
