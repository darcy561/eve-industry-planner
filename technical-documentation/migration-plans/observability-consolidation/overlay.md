# Observability consolidation — behaviour overlay

How the parts this project touches work **after** each stage lands. Live docs remain the truth
wherever this file has no section. Sections fill in as stages complete — see
[plan.md](./plan.md) § Stage status.

## Logging with the observability layer off

`LOG_LEVEL` is the floor for everything a Go service emits, read in `services/shared/logs` and
applied once with `zap.IncreaseLevel` so the stdout core and the OTLP core cannot disagree about what
was logged. Accepted values are `debug`, `info`, `warn` and `error`; anything else, including unset,
is `info`. Changing it restarts the services rather than the collector.

Nothing downstream filters by severity any more. `config.alloy` carries no `LOG_LEVEL` and the
`alloy` service no longer receives one, because a process that floors at source leaves the collector
nothing to drop.

`debug_steps` follows the same rule. `logs.DebugStepsField` returns `zap.Skip` unless the level is
debug, so the field is never emitted rather than emitted and scrubbed downstream. Steps are still
collected on every operation, so raising the level is a restart and not a code path.

Which sinks a service writes to is unchanged and still decided by `OBSERVABILITY_ENABLED`:

| Layer | Sinks |
|---|---|
| Off | Stdout only, JSON with caller |
| On | OTLP to the collector, plus a stdout mirror when `LOG_STDOUT` is true or `ENVIRONMENT` is development |

`LOG_STDOUT` now reaches the processes it documents. It and `LOG_LEVEL` travel together on the
`x-log-env` anchor in `docker-stack.yml`, which every Go service merges — `ws-router` and
`capacity-controller` included, neither of which received either variable before.

Every service in every fragment rotates its stdout: `json-file`, 10 MB per file, 5 files. It is an
`x-log-rotate` anchor defined once per fragment and merged onto each service, so there is nothing
per-service to keep in step. That matters most with the layer off, when stdout is the only copy of a
container's logs.

## Infrastructure and edge metrics

Alloy collects everything. Prometheus scrapes nothing but itself, and its `scrape_configs` holds one
job for that reason alone.

| Source | How Alloy gets it | `job` |
|---|---|---|
| Redis | `prometheus.exporter.redis` (embedded) | `redis` |
| Host | `prometheus.exporter.unix` (embedded) | `node` |
| MongoDB | `prometheus.exporter.mongodb` (embedded) | `mongodb` |
| NATS | `prometheus.scrape` of the `nats-exporter` container | `nats` |
| Asynq queues | `prometheus.scrape` of `asynqmon` | `asynqmon` |
| SeaweedFS | `prometheus.scrape` of `seaweedfs:9327` | `seaweedfs` |
| Traefik | native OTLP push to `alloy:4317` | `traefik` |

Three exporter containers are gone. `nats-exporter` remains because Alloy has no NATS exporter
component; `asynqmon` remains because it is a queue UI as well as a metrics source.

**Embedded exporters do not take their `job` from the scrape.** Their targets arrive carrying
`job="integrations/<name>"`, and a target label beats `prometheus.scrape`'s `job_name`, so each one
passes through a `discovery.relabel` that rewrites `job` before the scrape. The static scrapes carry
no target `job`, so `job_name` works there directly. Getting this wrong is silent: metrics arrive and
the dashboards that filter on `job` stay empty.

**Infrastructure scrapes bypass `prometheus.relabel "otel_collector"`.** That component stamps
`job="otel_collector"` on everything crossing it, which is what the application dashboards filter on.
Each infrastructure scrape forwards straight to `prometheus.remote_write.local.receiver` instead.

**Traefik is the exception that goes through it**, because OTLP push lands on the same pipeline as the
applications. A second rule keyed on `service_name = "traefik"` runs after the stamp and takes it back
out — relabel rules apply in order. Its metric names are unchanged from the Prometheus exposition it
replaced, `_bucket` histogram series included.

**Alloy holds credentials and host access it did not before.** `REDIS_PASSWORD`,
`MONGO_ROOT_USERNAME` and `MONGO_ROOT_PASSWORD` reach it as environment, read with `sys.env`, and the
host filesystem is bound read-only at `/host` for the unix exporter's `rootfs_path`, `procfs_path` and
`sysfs_path`. That avoids putting Alloy in the host PID namespace, which is how `node_exporter` used
to read host `/proc`. Mongo credentials sit inside `mongodb_uri` because the component takes them no
other way; that is safe unescaped only because `EnvFields` constrains a generated password to the
url-safe base64 alphabet.

**SeaweedFS is new coverage**, not a move — it was never collected before. Under `mini` one port
serves master, filer, filerStore, volume server and admin metrics together; the `-s3.metricsPort` the
CLI advertises never listens in that mode.

## What each service reports

_Empty until Stage C lands._

## Where telemetry goes

Alloy is the only collector. Prometheus stores metrics, Loki stores logs, Grafana queries both.

| Signal | Path |
|---|---|
| Application metrics | OTLP → Alloy → `prometheus.remote_write` → Prometheus |
| Infrastructure metrics | Alloy's embedded exporters and scrapes → the same `remote_write` |
| Traefik metrics | Native OTLP push → Alloy → the same `remote_write` |
| Application logs | OTLP → `scrub_otlp_boilerplate` → `otelcol.exporter.otlphttp` → Loki `/otlp` |
| Container stdout | `loki.source.docker` → `loki.write` → Loki's push API |
| Traces | Discarded at `otelcol.exporter.debug` |

**Container stdout keeps Loki's native push rather than being bridged onto OTLP.** Sending it through
`otelcol.receiver.loki` and out of the shared OTLP exporter works, and was in place while an
alternative backend was evaluated, but against Loki it delivers `compose_service`, `container`,
`swarm_service` and `task_slot` as structured metadata instead of stream labels. Every `logs-*`
dashboard selects `{compose_service="…"}`, so those queries return nothing. The two log paths
therefore leave Alloy by different exporters, and that is deliberate.

**`loki.source.docker` takes `discovery.relabel.docker.output`, not the raw target list.** Passing
`discovery.docker.docker.targets` with `relabel_rules` supplied separately applies `drop` actions to
entry labels rather than to the tailing set: every container gets tailed, and services named in a
drop rule still arrive. The dropped set is the six Go services, which export OTLP logs of their own,
and the four socket proxies.

## Reading the ESI limiter

_Empty until Stage E lands._

## Traces

_Empty until Stage F and Stage G land._

## Dashboards

**`core-esi-limits.json`** reads the five bucket gauges `services/core/metrics/esi` registers:
`core_esi_bucket_token_limit`, `.token_used`, `.token_remaining`, `.fill` and
`.seconds_until_open`. It previously selected a `core_esi_group_*` spelling that nothing has
written since the limiter was renamed, so every panel was empty.

The layout leads with three radial gauges — allowance still available, tokens remaining, and seconds
until a refusing bucket admits again — over a time series of tokens remaining and the two snapshot
tables. Current state is what the limiter is usually consulted for; the trend underneath keeps the
history a gauge alone would lose. The allowance gauge runs 0–1 with thresholds that redden as it
drains, and the wait gauge treats any non-zero value as the interesting case.

Two panels changed subject rather than name, because the metric they described no longer exists:
`seconds_into_window` and `seconds_until_reset` were replaced by `fill` (share of the allowance
still available, `percentunit`) and `seconds_until_open` (seconds until a refusing bucket admits
again).

**The dashboard files are the source of truth, and Grafana now honours that.** The provisioning
provider ran with `allowUiUpdates: true`, which lets Grafana keep its own database copy of a
dashboard: the file seeds it once, and a later edit to that file no longer reaches the dashboard.
Every one of the twenty reported `provisioned: false` as a result, so a shipped change could land in
the container and still not be what Grafana served.

It now runs `allowUiUpdates: false` with `editable: false`. Measured against `grafana/grafana:13.0.1`
before the change: with the flag off a dashboard reports `provisioned: true`, keeps the `refresh`
value its file sets, and picks up a file edit automatically within `updateIntervalSeconds` — no
restart and no `eip sync`. The comment that justified the flag warned that provisioned auto-refresh
would be ignored; that does not happen on this version.

**`mongodb.json`** reads oplog size from `mongodb_oplog_stats_storageStats_size`. It previously
selected `mongodb_oplog_stats_size`, which the exporter has never emitted. Every one of the eleven
metrics this dashboard queries now resolves against the store.

**Every panel of `core-esi-limits.json` aggregates with `max by (group, scope)`.** Bucket state belongs to the fleet and is
reported once by core — [backend/shared/esi.md](../../backend/shared/esi.md) § What it reports — but
`resource_to_telemetry_conversion` promotes `service_instance_id` onto each series, so a restarted
container leaves its own copy behind until it goes stale. Selecting the raw series draws one line
per container id that has ever reported. `max` collapses them without summing, which would double
a fleet-wide figure.

## Operating the observability stack

_Empty until Stage I lands._

## Missing live SoT to draft here

The observability stack has no live topic of its own today: what exists is spread between
[`stack/stack.md`](../../stack/stack.md) for fragment membership and the Deployment Tool's embedded
kit for the configuration itself. On promote this project needs a topic that says what collects
what, where it lands, and how an operator reaches it — drafted in this section first rather than
written straight into the live tree.

_Empty until Stage I lands._
