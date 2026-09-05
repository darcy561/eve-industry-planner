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

OpenObserve is the only store. Alloy's three exporters point at it and nothing else; Prometheus,
Loki and Grafana are still deployed but no longer receive anything, and they hold only history from
before the cut.

| Signal | Path |
|---|---|
| Application metrics | OTLP → Alloy → `prometheus.remote_write` → `/api/default/prometheus/api/v1/write` |
| Infrastructure metrics | Alloy exporters and scrapes → the same `remote_write` |
| Traefik metrics | Native OTLP push → Alloy → the same `remote_write` |
| Application logs | OTLP → `scrub_otlp_boilerplate` → `otelcol.exporter.otlphttp "backend"` → `/api/default` |
| Container stdout | `loki.source.docker` → `otelcol.receiver.loki` → the same exporter |
| Traces | Still discarded — Stage F |

Alloy authenticates with `OBS_ADMIN_USER` / `OBS_ADMIN_PASSWORD`, read with `sys.env`, as HTTP basic
on both the metrics and logs exporters. The backend stores on the existing SeaweedFS S3 in an
`observability` bucket, created by `eip ensure-s3` from the `AppBuckets` list.

**SeaweedFS joins `eip-obs` when the addon is enabled**, through the `eip.network.attach` /
`attach.when: observability` labels the Deployment Tool already understands. The backend reaches
storage without the addon gaining a foothold on `eip-core`, where the application services live.

**The bridged stdout copy does not pass through `scrub_otlp_boilerplate`.** That transform removes
OTel SDK and zap caller attributes, which container stdout never carries.

### Two collection defects the cut exposed

Both predate this stage and were invisible while Loki was the log store, because Loki deduplicates
by label set and the OTLP path does not.

**`loki.source.docker` was tailing every container.** It took `discovery.docker.docker.targets` (the
raw list) with `relabel_rules` supplied separately. In that arrangement the `drop` actions apply to
entry labels rather than to the tailing set, so all 23 services were tailed and the six Go services
and four socket proxies arrived despite being named in a drop rule. It now takes
`discovery.relabel.docker.output`, the already-relabelled target list: 21 targets, none of them
dropped services.

**`capacity-docker-proxy` was missing from the proxy drop group** its three siblings were in.

Together these were 60% of ingested log volume, none of it wanted.

## Reading the ESI limiter

_Empty until Stage E lands._

## Traces

_Empty until Stage F and Stage G land._

## Dashboards

_Empty until Stage H lands._

## Operating the observability stack

_Empty until Stage I lands._

## Missing live SoT to draft here

The observability stack has no live topic of its own today: what exists is spread between
[`stack/stack.md`](../../stack/stack.md) for fragment membership and the Deployment Tool's embedded
kit for the configuration itself. On promote this project needs a topic that says what collects
what, where it lands, and how an operator reaches it — drafted in this section first rather than
written straight into the live tree.

_Empty until Stage I lands._
