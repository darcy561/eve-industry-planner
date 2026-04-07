# Patch Notes

## Summary

Adds end-to-end **operational observability** to the Docker Compose stack (metrics, logs, traces, Grafana), instruments **Go services** with **OpenTelemetry** (traces and metrics) and **structured JSON logging** for Loki, and refreshes **deployment/bootstrap scripts** so servers can pull `docker-compose.yml`, `observability/`, and `scripts/` from the **Public** branch via a single archive.

## Highlights

### Observability stack (`docker-compose.yml`, `observability/`)

- **Prometheus** for scraping (including app OTLP-derived metrics exposed via the collector and existing targets such as Asynq).
- **Loki** + **Promtail** for container log aggregation (JSON logs from services).
- **OpenTelemetry Collector** receiving OTLP from apps (`otel-collector:4317`), with pipelines for traces, metrics, and log handling per `observability/otel-collector/config.yaml` (ensure the trace **exporter** in that file matches the **trace backend service** named in Compose—e.g. Jaeger OTLP or Tempo—before release).
- **Grafana** with provisioned **datasources** and **dashboards** under `observability/grafana/provisioning/` (stack overview, per-service logs, API OTel metrics, worker tasks, Asynq queues, core ESI limits, app activity, etc.).

### Go services (`services/`)

- **OpenTelemetry** dependencies and **OTLP** export from **api**, **core**, **worker**, and **websocket** (service names and environment wired through Compose).
- **Shared logging** oriented toward **structured JSON** and correlation with traces/metrics where applicable.
- **API** middleware refresh (e.g. request lifecycle logging, timeouts, start-time propagation) replacing older request-ID–centric pieces where refactored.
- **Core** additions for **ESI limit** visibility and **metrics** used by dashboards (`esilimits`, `esimetrics` and related wiring).
- Broad touch across handlers and background tasks for **span** boundaries and consistent instrumentation.

### Configuration and deployment

- **`env.example`:** Grafana admin variables, logging/OTEL/deployment hints, and notes on **`$` escaping** in Compose for passwords.
- **`Makefile`:** `make dev` depends on **`download-setup-scripts`** so compose and observability configs are present before local builds; help text clarifies dev vs `make up`.
- **`scripts/download-setup-scripts.sh`** / **`scripts/version-tracker.sh`:** sync from GitHub **Public** by downloading the **branch tarball** and replacing **`docker-compose.yml`**, the full **`observability/`** tree, and **`scripts/`** (no per-file manifest; **`docker-compose.dev.yml`** is **not** part of that download—clone-only for dev overlay).
- **`DEPLOYMENT.md`:** documents archive-based sync, `tar` / optional `rsync`, and dev vs production paths.
- **`.github/workflows`:** adjustments related to container publish/build where included in this branch.

## Operator notes

- After merge, confirm **one** trace stack in Compose matches **`observability/otel-collector/config.yaml`** (OTLP endpoint and protocol).
- Set **`GRAFANA_ADMIN_PASSWORD`** (and user) in `.env` for any environment where Grafana is reachable; avoid defaults on exposed networks.
- **`make up`** only fetches the archive when required paths are **missing**; use **`make update-files`** to refresh synced files when **Public** moves.
- **`sync_bundle`** in **`.downloaded-versions.json`** records the last archive sync commit when `jq` is available; legacy per-file keys may still exist until overwritten.
