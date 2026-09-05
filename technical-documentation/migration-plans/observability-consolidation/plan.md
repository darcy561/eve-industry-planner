# Observability consolidation — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans), plus
[`../../stack/technical-rules.md`](../../stack/technical-rules.md),
[`../../backend/technical-rules.md`](../../backend/technical-rules.md) and
[`../../deployment/deployment-tool/technical-rules.md`](../../deployment/deployment-tool/technical-rules.md)
for the three areas this touches.
Phase 1 (project folders/docs) before any product work.
Go surfaces are in scope — `services/shared/logs`, `services/shared/telemetry`, `services/ws-router`,
`services/worker/asynq` and the Deployment Tool's Grafana surface — so `go fix -diff` runs on those
packages only, before the slice that touches them and again after.
Live SoT will not be edited until this project is complete and promotion is approved.

## The shape of the change

**Everything that produces telemetry sends it to Alloy. Alloy sends it to Prometheus and Loki.**

The second half of that sentence was very nearly a different backend. It is not, and
[Choosing the backend](#choosing-the-backend) records why. What matters for everything below is the
first half: one collector, entered by every producer, so the store behind it is a single repoint
rather than a per-source migration.

That is one sentence but it is not one change. Today Alloy is the only thing the *Go applications*
talk to, and four other collection paths run beside it: Prometheus scrapes seven targets directly,
Traefik exposes a Prometheus endpoint rather than pushing, the Docker stdout scrape writes to Loki
with no OTLP anywhere in the path, and traces leave the process for Sentry without passing through
the collector at all. Consolidating means closing all four, and only then is the backend swap a
question about one exporter.

The layer is also optional. `OBSERVABILITY_ENABLED` decides whether any of this runs, and with it off
every service falls back to writing stdout. That fallback has to be a mode the stack supports
deliberately, not the shape the logging happens to take when the collector is absent — which is what
it is today.

## What runs today

Ten services carry observability for a single-host Swarm:

| Service | Role |
|---|---|
| `alloy` | Receives OTLP from apps (metrics, logs, traces); scrapes Docker stdout |
| `alloy-docker-proxy` | Least-privilege Docker socket for the stdout scrape |
| `prometheus` | Metric store. Two inlets: `remote_write` from Alloy, and scraping 7 targets |
| `loki` | Log store |
| `grafana` | Queries the two stores. Stores no telemetry |
| `node_exporter`, `redis-exporter`, `mongodb-exporter`, `nats-exporter` | Standalone exporters |
| `asynqmon` | Queue UI, also a Prometheus scrape target |

### Every producer, and where its telemetry goes

| Producer | Signal | Path today |
|---|---|---|
| `api`, `core`, `worker`, `websocket`, `capacity-controller` | metrics | OTLP/gRPC → `alloy:4317` → `prometheus.remote_write` → Prometheus |
| the same five | logs | OTLP/gRPC → Alloy → `otelcol.exporter.otlphttp` → Loki `/otlp` |
| the same five | traces | Sentry OTLP exporter → Sentry DSN. **Never reaches Alloy** |
| the same five | errors | Sentry SDK, DSN baked at build |
| `ws-router` | — | **No instrumentation at all.** Stdout only |
| `capacity-controller` | stdout | Scraped *as well as* exporting OTLP logs — duplicated into Loki whenever the stdout mirror is on |
| `traefik` | metrics | Native Prometheus exposition on `:8082`, **scraped by Prometheus** |
| `traefik`, `frontend`, `nats`, `redis`, `mongo`, `seaweedfs`, obs infra | stdout | `loki.source.docker` → `loki.write` → Loki push API |
| `nats`, `redis`, `mongo`, host | metrics | Standalone exporter container → **scraped by Prometheus** |
| `asynqmon` | metrics | `--enable-metrics-exporter` → **scraped by Prometheus** |
| `prometheus` | metrics | Self-scrape |
| `alloy`, `loki`, `grafana` | own metrics | Exposed, **nothing scrapes them** |
| `seaweedfs` | metrics | **Not collected.** It runs `mini` with no metrics port, so nothing is exposed to collect |
| SPA (browser) | errors, tracing | Sentry browser SDK direct |
| SPA (browser) | page views, web-vitals | Google Analytics 4 — external, out of scope |
| SPA (browser) | product events | POST to `api`, which records them as `web.frontend_*` OTel metrics |

Five facts shape everything below.

**Grafana stores no telemetry.** `grafana.db` is 5.2 MB of `dashboard`, `data_source`, `alert_rule`,
`annotation`, `user` — its own configuration. The metrics are 70 MB of TSDB blocks under
`/prometheus`. There is no "store it in Grafana" option because Grafana has never stored it.

**Alloy stores nothing either.** It has `prometheus.receive_http` and `prometheus.remote_write` —
an inlet and an outlet — and no storage or query component. It is a pipe.

**The traces pipeline exists and nothing feeds it.** `config.alloy` accepts OTLP traces and ends the
pipeline at `otelcol.exporter.debug "discard_traces"`, but no application sends any: `telemetry.go`
exports traces through `sentryotlp.NewTraceExporter` to the Sentry DSN, and only metrics and logs go
to the collector. Tracing is also off at source — `SENTRY_TRACES_SAMPLE_RATE=0` installs a noop
tracer provider, so spans are created and discarded before export.

**The instrumentation is not Sentry-coupled.** Span creation is the plain OTel API, propagation is
W3C TraceContext, and the auto-instrumentation is `otelhttp` / `redisotel` / `otelmongo`. Only the
exporter names Sentry, so pointing traces at the collector is an exporter swap, not a
re-instrumenting.

### How a Go service actually logs

Every Go service logs through `services/shared/logs`, a zap root logger built once per process and
rebuilt when `ResetRoot` is called. `telemetry.Init` calls `logs.EnableOTLPExport()` **only** when
`OTLPEndpoint` is non-empty, which requires `OBSERVABILITY_ENABLED=true`. So there are two shapes:

| `OBSERVABILITY_ENABLED` | Root logger |
|---|---|
| `false` | One JSON stdout core, with caller |
| `true` | An `otelzap` core over the global LoggerProvider, **teed** with a stdout core when `logStdoutEnabled()` |

Four properties of that arrangement decide how much work the off-mode needs.

**The process never filters by level.** `buildRoot` pins `zapcore.DebugLevel` unconditionally, and
the comment says why: everything is exported and Alloy drops below `LOG_LEVEL` before Loki. No Go
code reads `LOG_LEVEL` at all — its only consumer is the `alloy` container's environment.

**`LOG_STDOUT` never reaches a container.** It is a Deployment Tool env-template field with help text
describing an override, but it appears in no service environment in any fragment. The only control
that actually reaches a process is `ENVIRONMENT`, through `isDevelopmentEnv()`.

**`debug_steps` is stripped by Alloy, not by the process.** The transform runs on the OTLP branch and
only when `LOG_LEVEL` is not `debug`.

**No fragment sets a `logging:` driver.** Container stdout goes to whatever the host daemon defaults
to, with whatever rotation that daemon has.

Put together: **with the observability layer off, every service writes every debug line, with
`debug_steps` attached, to a stdout the operator cannot raise the level of, into a log file the stack
does not configure rotation for.** That is not a supported mode; it is what is left when the on-mode
is absent.

All four are closed by [Stage A](#stage-a--logging-holds-with-the-layer-off); the overlay records the
shape now. This subsection stays as the baseline the work was justified against.

**Half the log volume never touches OTLP.** Application logs are OTLP end to end. Docker stdout goes
`loki.source.docker` → `loki.write`, which is Loki's own push API. The two paths are also not
filtered alike: the `LOG_LEVEL` severity filter and the `strip_debug_steps` transform sit only on
the OTLP branch.

## One collector

```
apps (6 Go services) ─────────────OTLP──────────────┐
traefik ──────────────────────────OTLP──────────────┤
docker stdout ─▶ loki.source.docker ─▶ otelcol.receiver.loki ─┤
node/redis/mongo ─▶ prometheus.exporter.* (embedded) ───────┤
nats-exporter, asynqmon, seaweedfs ─▶ prometheus.scrape ────┤
                                                    ▼
                                                  Alloy
                                                    │
                                          ┌─────────┴─────────┐
                                          ▼                   ▼
                                     Prometheus              Loki
                                          └─────────┬─────────┘
                                                    ▼
                                                 Grafana
```

Everything enters through Alloy. Prometheus and Loki store it and Grafana queries both — the single
collector is the consolidation; the store behind it stayed as it was. Two services carry the
ingestion path. `alloy-docker-proxy` remains
as a trust boundary and `asynqmon` as a queue UI, neither of which is pipeline.

Ten services become seven. The reduction comes from two changes that touch the same file: the
exporters Alloy can embed become components, and the rest move onto Alloy as scrape targets or push
to it. `nats-exporter` survives because Alloy has no NATS
exporter component — it stays a container that Alloy scrapes, like `asynqmon`.

## Decisions taken

These were open when the plan was first written and are settled now. They are recorded here rather
than in the stages so that a reader knows the stages are executing a decision, not proposing one.

**Sentry keeps errors; traces move.** Error capture, grouping and release tracking stay on Sentry
for both the backend and the SPA — that is the job it does well and a telemetry store does not
replace it.
Span export switches to the collector. One tracer provider, one exporter, pointed at Alloy. This
means `sentryotel.NewOtelIntegration` no longer has spans to attach to errors, which is the cost of
the split and is accepted.

**`ws-router` gets instrumented.** It is the only Go service with no metrics, no traces and no OTLP
logs, and its stdout is scraped as though it were infrastructure. A consolidation whose premise is
that applications speak one protocol cannot leave one application outside it.

**Running without the observability layer is a supported mode.** `OBSERVABILITY_ENABLED=false` has
to leave a service logging usefully to stdout — at a level the operator chose, without `debug_steps`
noise, into a log the host will rotate. That means the level floor moves into the process, where it
belongs, instead of living in a collector that may not be deployed.

**Traefik pushes rather than being scraped.** Traefik v3 exports OTLP metrics natively, so the fix
is to remove a scrape target rather than relocate it. This also opens Traefik's native OTLP tracing,
which puts edge spans on the same trace as the application spans they precede.

## Choosing the backend

**The stack keeps Grafana, Prometheus and Loki.** A single-node OpenObserve was built, deployed and
measured against the running stack, then removed. This section records the measurement so the
question is not reopened without new information.

**The target host is 2 cores and 8 GB.** The rest of the stack uses about 2.5 GB, so a telemetry
backend has roughly 1–1.5 GB before the host is uncomfortable.

| Configuration | Metric streams | Memory | CPU |
|---|---|---|---|
| Grafana + Prometheus + Loki | — | **466 MB** combined | idle |
| OpenObserve, defaults | 7,314 | 3.7 GB | — |
| OpenObserve, caches capped | 7,314 | 3.0–3.2 GB | 180–540% |
| OpenObserve, caches capped, MongoDB collection off | 721 | 1.2 GB | 3–16% |

Three things came out of that.

**It sizes itself off the host it boots on.** Left alone it claimed a 3.9 GB memory cache, a 5.8 GB
query pool and a 100 GB disk cache from a 16 GB development machine — the same ratios come to about
5 GB on the target host. Capping the caches brought it to 3.0–3.2 GB.

**Most of what remained was our own cardinality.** The MongoDB exporter emits 6,569 distinct metric
names — 90% of every stream — and OpenObserve keeps a schema and flush cycle per stream, where
Prometheus treats a metric name as one more label in a single TSDB. Disabling MongoDB collection
took it to 721 streams and 1.2 GB. The exporter's `enable_coll_stats`, `enable_index_stats`,
`enable_db_stats`, `enable_diagnostic_data` and `enable_top_metrics` toggles do **not** reduce this:
measured against the live database, all five disabled still produced exactly 6,569 names, because
`collect_all` overrides them.

**1.2 GB is the floor, not the cost.** That figure is a development stack with no users: no request
traffic, no application log volume, no dashboard queries. Against 466 MB for the three services it
would replace, the backend swap was a memory increase on a host that has none to spare, in exchange
for a footprint that only grows once real usage arrives.

Rejected for the same reason, before that measurement:

**SigNoz — footprint.** Five containers (ClickHouse, ClickHouse Keeper, PostgreSQL, its own OTel
collector, the SigNoz backend) and a documented 4 GB floor. Against the three services it would
replace that is a net increase of two containers plus a second database and a coordination service,
and its HA path needs Kubernetes. It is the stronger dedicated APM product and would be worth
revisiting if tracing became the primary need.

**Apps pushing OTLP straight to Prometheus.** Prometheus v3.2.1 has a native OTLP receiver, so this
is possible. It is also the opposite of this project: it removes Alloy from the metrics path while
leaving it in place for logs, so the stack keeps two ingestion paths and gains a second export
destination in every application.

**`grafana/otel-lgtm`.** Ships for development and demonstration rather than production, and covers
neither the Docker stdout scrape nor the exporters without adding that configuration back.

### What the evaluation left behind

Alloy remains the sole ingestion point, which was the consolidation's actual goal. Every producer
enters through one component, so changing the store later is one repoint in one file rather than a
migration per source. The cardinality finding also stands on its own: 6,569 MongoDB series that one
dashboard queries ten of are being collected and stored today, and Prometheus pays for that too —
just more quietly.

## Verified facts

Checked against the running stack, the shipped configuration and current vendor documentation rather
than recalled, because several are the kind that go stale.

| Fact | How it was checked |
|---|---|
| Alloy embeds `prometheus.exporter.unix`, `.redis` and `.mongodb` — but **not** `.nats`, at v1.16.1 or at the current v1.19.2 | `alloy validate` against candidate blocks in both images; `prometheus.exporter.nats`, `.gnatsd` and `.nats_streaming` all report "cannot find the definition", while `.redis`, `.mongodb`, `.unix`, `.statsd`, `.cadvisor` and `.blackbox` accept |
| Alloy v1.19.2 runs the current `config.alloy` unchanged | `alloy validate --stability.level=experimental` in the v1.19.2 image against the shipped file, exit 0 |
| Alloy's `env()` is deprecated; configuration reads the environment with `sys.env()` | Same method — `env()` validates with a deprecation warning |
| Alloy has no storage or query component | Same method: `prometheus.storage`, `.tsdb`, `.query` all report "cannot find the definition" |
| `otelcol.receiver.loki` exists, so the Docker stdout scrape can be bridged to OTLP | Same method |
| Grafana stores configuration, not telemetry | Table names read out of `grafana.db`; sizes compared against the Prometheus TSDB |
| Prometheus scrapes 7 targets, of which only 4 are exporter containers | `prometheus.yml` job list: `prometheus`, `asynqmon`, `traefik` are the other three |
| Prometheus is v3.2.1 with `--web.enable-remote-write-receiver` and no OTLP receiver | Service inspect on the running task |
| `ws-router` never calls `telemetry.Init` and has no `OBSERVABILITY_ENABLED` | Call-site grep across `services/`; stack fragment environment |
| `capacity-controller` stdout is not in the Alloy drop regex, so its logs arrive twice whenever the stdout mirror is on | `discovery.relabel "docker"` drops `(api\|core\|worker\|websocket)` only |
| No Go code reads `LOG_LEVEL`; the root zap logger is pinned to debug and Alloy is the only filter | `buildRoot` in `services/shared/logs/logger.go`; grep for the key across `services/` |
| `LOG_STDOUT` is an env-template field that reaches no container | Absent from every service environment in every fragment; only `logger.go` and its tests read it |
| No fragment sets a `logging:` driver, so stdout rotation is the host daemon's default | Fragment scan for `logging:` |
| Traefik v3 exports OTLP metrics with `--metrics.otlp.grpc=true`, `--metrics.otlp.grpc.endpoint`, `--metrics.otlp.grpc.insecure`, `--metrics.otlp.pushInterval`, and the same router/service label switches | Traefik v3 install-configuration reference |
| SeaweedFS already serves S3 on `:8333` with credentials in the stack | `S3_URL`, `S3_ACCESS_KEY`, `S3_BUCKET` in the stack YAML |
| `weed mini -metricsPort` serves 48 SeaweedFS metric families (master, filer, filerStore, volumeServer, admin) on one port; `-s3.metricsPort` is accepted but never listens under `mini` | Throwaway `chrislusf/seaweedfs:4.40 mini` container with both flags set, then curl against each port: 200 and connection refused |
| There are **20** dashboards: 11 Prometheus-only, 7 Loki-only, 2 mixed | Datasource and expression audit across `kit/obs/grafana/.../definitions/` |
| Two dashboards query metrics nothing emits — 15 series in total | Every dashboard expression audited against the instrument names registered across `services/`: `core-esi-limits.json` selects `core_esi_group_*` against emitted `core.esi.bucket.*`, and ten `api-otel-metrics.json` panels select `api_static_data_*` series that no instrument creates |

**Measured, and the reason the backend was not adopted:** OpenObserve idles at 1.2 GB on a stack
with no users once its caches are capped and MongoDB's cardinality is removed, against 466 MB for
the three services it would have replaced. Its PromQL compatibility was never tested, because the
footprint decided it first.

## Phases

Phase 1 — this folder — is complete when the plan, contents map, overlay scaffold and section row
exist. No product work starts before that.

### Stage A — logging holds with the layer off

First, because it is the mode the stack falls back to and it is currently the least designed part of
the pipeline. Independent of the backend and of everything below it.

**Move the level floor into the process.** `services/shared/logs` reads `LOG_LEVEL` and applies it to
the root logger, so a service emits what the operator asked for whether or not a collector exists.

The alternative was to leave the floor in Alloy and give the stdout core a second, separate knob.
That keeps today's on-mode behaviour byte for byte and lets the level change with an Alloy restart
rather than a service update — but it means `LOG_LEVEL` means one thing when the layer is on and
another when it is off, and the off-mode knob would be the one nobody remembers exists. One key, one
meaning, read where the log is produced. The cost is real and small: changing the level restarts the
services rather than the collector, and both are a config sync either way.

Alloy's `LOG_LEVEL` branch does two separable things, and only one of them moves:

| Alloy did | After |
|---|---|
| `otelcol.processor.filter` dropped below `LOG_LEVEL` | Deleted — the process floors first |
| `strip_debug_steps` removed `debug_steps` unless `LOG_LEVEL=debug` | Deleted, and the decision changed while implementing (below) |

The plan had `strip_debug_steps` staying, on the reasoning that `debug_steps` ride on access logs
that pass the severity floor, so flooring alone would not remove them. True — but the fix belongs at
the source rather than in the collector. `logs.DebugStepsField` now returns `zap.Skip` unless
`LOG_LEVEL` is debug, so the field is never emitted rather than emitted and then scrubbed. The steps
are still *collected* regardless, so raising the level needs no separate code path.

That leaves `LOG_LEVEL` out of `config.alloy` entirely, and out of the `alloy` service's environment.
The cost is one deploy-shaped edge: during a rolling update, a task still running the previous build
emits `debug_steps` at info and nothing downstream strips them any more. It ends when the roll does.

**Wire `LOG_STDOUT` into the containers.** It is documented in the env template and reaches no
process, so the only working control is `ENVIRONMENT=development`. Add it to the app services'
environment anchor so the documented override does what it says. Keep the existing precedence:
explicit value wins, unset falls back to the development check.

**Configure log rotation in the fragments.** No fragment set a `logging:` driver, so stdout went
wherever the host daemon put it with whatever rotation that daemon had. With the layer off, stdout is
the *only* copy. It is one shared anchor per fragment applied to every service, the way `x-common-dns`
already is — deliberately uniform, because a service that outgrows it has a logging bug rather than a
tuning problem. The values are fixed in the fragment rather than exposed as operator knobs; if host
disk turns out to want per-deployment sizing, they promote to `.env` keys the same way the others
did.

**Keep the stdout format machine-readable.** JSON with caller, as now. The temptation with an
operator-facing fallback is a console encoder, but `eip logs` output that `jq` can read is worth more
than colour, and it keeps the two modes comparable when diagnosing which one is running.

Done when a service started with `OBSERVABILITY_ENABLED=false` and `LOG_LEVEL=info` emits info and
above, carries no `debug_steps`, and rotates — and when the same service with the layer on behaves
exactly as it does today.

**Landed:** the level floor in `services/shared/logs` (applied once with `zap.IncreaseLevel`, so
stdout and OTLP cannot disagree), `DebugStepsField` at the three access-log call sites, the two Alloy
processors deleted, and an `x-log-env` anchor carrying `LOG_LEVEL` and `LOG_STDOUT` to all six Go
services — `ws-router` and `capacity-controller` included, which had neither. Covered by
`log_level_test.go` beside the existing `stdout_env_test.go`.

Rotation is `json-file` at 10 MB × 5 on all 25 services across the three fragments. The stack is
applied with `docker stack deploy -c`, so Swarm honours the key directly and no Deployment Tool
mapping was needed.

### Stage B — every metrics target moves onto Alloy

Everything that produces telemetry reaches Alloy before any of it is pointed anywhere new. Doing this
first means the backend change is one exporter rather than a fan-out repeated for each source as it
arrives, and it means the consolidation is verified against Prometheus and the dashboards that
already exist rather than against a store nobody has decided to keep.

- **Three exporters become components.** Fold `node_exporter`, `redis-exporter` and
  `mongodb-exporter` into `config.alloy` as `prometheus.exporter.unix`, `.redis` and `.mongodb`, and
  delete their services and scrape jobs.
- **`nats-exporter` stays a container.** Alloy has no NATS exporter component — checked at v1.16.1
  and again at v1.19.2 — so this one cannot be embedded. It keeps running and Alloy scrapes it, which still removes the Prometheus
  dependency even though it does not remove the container.
- **`asynqmon` becomes an Alloy scrape target.** It publishes Prometheus exposition and nothing else,
  so it must be scraped; the scraper becomes `prometheus.scrape` in Alloy.
- **`seaweedfs` starts being collected at all.** It is the one piece of infrastructure with no
  telemetry anywhere today, and this project is about to make it the store behind the store: the
  backend's data sits on its S3. Give `mini` a `-metricsPort` and scrape it from Alloy. One endpoint
  covers it: under `mini` that port serves master, filer, filerStore, volume server and admin
  metrics together, and the separate `-s3.metricsPort` the CLI advertises does not listen in that
  mode — so there are no distinct S3 gateway metrics to collect. The flag is inert when the
  observability addon is off, since nothing scrapes it, so the data fragment stays usable on its own.
- **Traefik switches to native OTLP push.** Replace `--metrics.prometheus*` with `--metrics.otlp.grpc`
  pointed at `alloy:4317`, keeping the entryPoint, router and service label switches and the
  histogram boundaries. Its `traefik` scrape job goes with it.
- **The Prometheus self-scrape** disappears with Prometheus. Alloy's own metrics on `:12345` are
  exposed and unscraped today; this is the moment to decide whether the collector monitors itself.

This stage stands on its own: it is worth doing whether or not the backend ever changes. The backend
did not change, and none of it was wasted.

Five things to get right:

- `prometheus.exporter.unix` inside a container sees the container's namespace. It needs the host
  `/proc`, `/sys` and rootfs mounts that `node_exporter` has today.
- Each embedded exporter needs a relabel preserving its `job` name. The existing
  `prometheus.relabel "otel_collector"` stamps `job="otel_collector"` on everything crossing that
  path, and the infrastructure dashboards filter on `job="node"`, `job="redis"` and so on.
- Redis and Mongo credentials move into Alloy configuration, delivered by environment expansion
  from the existing secrets rather than restated.
- Traefik's metric names change when it exports OTLP rather than Prometheus exposition, and
  `traefik.json` filters on the current ones. Treat the Traefik dashboard as a Stage H rewrite, not
  a port.
- `prometheus.relabel "otel_collector"` stamps `job="otel_collector"` on everything that crosses it,
  which was harmless while only application metrics did. Traefik's metrics now travel that same OTLP
  path, so the relabel has to stop being unconditional or Traefik's series lose their identity the
  moment they arrive.

### Stage C — the application tier all speaks OTLP

Three gaps that make "every application talks to Alloy" false today, or make the next service that
tries harder than it should be.

- **Instrument `ws-router`.** It was further outside the shared surface than the plan assumed: it
  used the standard library `log` package at seven call sites and never touched `services/shared/logs`
  at all. So this is three things — adopt the shared logger, add `telemetry.Init` and
  `OBSERVABILITY_ENABLED`, and add it to the Alloy stdout drop regex once its logs arrive over OTLP.
  What it should *measure* is a design question, not a plumbing one — connection routing decisions
  and fan-out are the obvious candidates — and is worth settling separately.
- **Give the instruments one set of scaffolding.** `shared/telemetry` owns SDK setup and `natsprop`
  owns propagation, but everything from the meter down is copied per package. `must*` wrapper pairs
  exist four times — `apimetrics/wrap.go`, `workermetrics`, `esiclient/metrics.go` and
  `websocket/server/metrics.go` as `mustWSCounter`/`mustWSHist` — meter singletons three times, and
  the `eve-industry-planner/<component>` instrumentation name appears as a bare literal in six
  places with no owner, having already drifted (`apimetrics` registers under both `.../api` and
  `.../web`). Adding `wsroutermetrics` made it a fifth style rather than reusing one.

  Add `Meter(component)` and `Tracer(component)` to `shared/telemetry`, owning that naming
  convention and memoising, plus `MustCounter` / `MustHist` / `MustIntHist` / `MustGauge`, then
  convert the five call sites and delete the duplicates outright. **Instrument definitions stay
  per-service** — what a service measures is a domain fact belonging beside the code that records
  it; only the scaffolding moves. Worth doing before Stage G, which adds span helpers on top of the
  same foundation.

- **Stop duplicating `capacity-controller` logs.** It exports OTLP logs and its stdout is scraped,
  because the drop regex names only `api|core|worker|websocket`. Whenever the stdout mirror is on —
  development today, and anywhere `LOG_STDOUT=true` once Stage A makes that reach the container —
  every line lands in Loki twice, by two paths with two label sets. The regex needs to name every
  service that exports OTLP logs, which after this stage is all six.

Like Stage B, this is worth doing on its own terms, and it survived the backend evaluation intact.

### Stage D — backend evaluation (closed, backend not adopted)

A single-node OpenObserve was added to `docker-stack.obs.yml` on the existing SeaweedFS S3, Alloy's
three exporters were repointed onto it, and the result was measured against the running stack. It
was then removed and Alloy repointed back at Prometheus and Loki.
[Choosing the backend](#choosing-the-backend) carries the numbers and the reasoning.

Two collection defects surfaced while the store was swapped, both predating this project and both
invisible while Loki was the only log destination, because Loki deduplicates by label set:

- **`loki.source.docker` was tailing every container.** It took `discovery.docker.docker.targets`
  with `relabel_rules` supplied separately, so `drop` actions applied to entry labels rather than to
  the tailing set: all 23 services were tailed and the six Go services and four socket proxies
  arrived despite being named in a drop rule. It now takes `discovery.relabel.docker.output`.
- **`capacity-docker-proxy` was missing from the proxy drop group** its three siblings were in.

Together these were about 60% of ingested log volume. Both fixes are kept.

**What did not survive the revert:** bridging container stdout through `otelcol.receiver.loki` onto
the OTLP exporter. That is correct when the destination indexes every attribute, and wrong for Loki
— the bridge delivers `compose_service` and its siblings as structured metadata rather than stream
labels, and every `logs-*` dashboard selects `{compose_service="…"}`. Container stdout keeps
`loki.write`.

### Stage F — traces stop being discarded

Three changes, not one. **This stage was originally scoped as config-only and is not.**

- **In `services/shared/telemetry`:** the tracer provider is only constructed when
  `SentryDSN != "" && SentryTracesSampleRate > 0`; every other case installs a noop provider. Exporting
  to the collector means restructuring that branch so a provider is built whenever *either*
  destination is on, swapping `sentryotlp.NewTraceExporter` for the OTLP exporter against
  `OTLPEndpoint`, and adopting `TRACES_SAMPLE_RATE` as the sampler's rate. That key already exists
  and already drives Traefik's edge sampling; because sampling is head-based, the services should
  follow the edge decision (`ParentBased`) rather than sample independently, or a trace will arrive
  with holes in it. Sentry keeps error capture; it stops receiving spans.
- **Around the edges of that:** a new `Config` field, an env field in the Deployment Tool's
  `kit/templates/env/fields.go`, a baked default, and the two GitHub workflow pass-throughs that
  carry the current variable.
- **In Alloy:** repoint `otelcol.exporter.debug "discard_traces"` at the backend. Traefik edge spans
  already arrive there and are discarded with the rest.

Doing only the last produces an empty traces view.

**Loki and Prometheus store no traces, so this stage now needs a trace destination of its own.**
Tempo is the obvious candidate — it completes the Grafana stack, Grafana already queries it as a
datasource, and the exporter change in `shared/telemetry` is the same work either way. That is the
open question this stage must answer before it starts: add Tempo, or leave traces discarded.

### Stage G — the spans say what a trace needs

Turning tracing on is worth little if the spans carry nothing. Three faults, none structural:

**The task execution span has no span kind.** `worker/asynq` starts `asynq.task` without
`trace.WithSpanKind`, so it defaults to `Internal` — a queue consumer rendered as an internal call.
The publish and bridge spans both set theirs. Backends key their consumer views off it.

**What matters about a task is on log lines, not on the span.** The execution span carries only
`asynq.task.type`; delivery count and sequence go into `debug_steps` in the log. A trace therefore
cannot answer "which attempt is this?" — the question a trace is best placed to answer.
`taskrun.Current(ctx)` now yields the task id, queue, retries used and retries allowed, so putting
them on the span is a few lines.

**The bridge is in the trace but not in the causal chain.** `Enqueue` builds the Asynq headers from
the *inbound* NATS headers, so the execution span inherits the publisher's context and becomes a
sibling of the bridge span rather than its child. Time waiting in Redis shows only as a gap between
siblings. **To decide:** make execution a child of the bridge, so queue latency is a duration, or
give it a span link to the producer as the messaging conventions suggest. It is currently neither by
accident rather than by choice.

Span names (`nats.publish_task`, `nats.enqueue_task`, `asynq.task`) are bespoke rather than the
`{destination} {operation}` the conventions use. Worth a sweep alongside the decision above, since
conventions are what make a trace render in any backend.

**Verification needs tracing on.** None of this is observable while the sample rate is zero, so this
stage follows F rather than preceding it.

### Stage H — the dashboards

Grafana stays, so this is no longer a rebuild. The twenty dashboards keep their format, their
datasources and their queries; what they need is the defects fixing. The audit that was done to
scope a rebuild found them, and they are real today:

| Dashboard | What it queries | What exists |
|---|---|---|
| `core-esi-limits.json` | `core_esi_group_token_limit`, `_token_used`, `_token_remaining`, `_seconds_into_window`, `_seconds_until_reset` — all five panels | `core.esi.bucket.token_limit`, `.token_used`, `.token_remaining`, `.fill`, `.seconds_until_open` |
| `api-otel-metrics.json` | ten panels on `api_static_data_*_requests_total` and `_duration_milliseconds_bucket` | Nothing. Those endpoints call `LogRequestMetrics`, which despite its name emits **log lines**, not instruments |
| `mongodb.json` | one panel on `mongodb_oplog_stats_size` | `mongodb_oplog_stats_storageStats_size` |

Sixteen dead series across three dashboards. Confirmed against the live store: the `core_esi_group_*`
names are in the index with no current samples and nothing has written them since the limiter was
renamed.

That audit only catches names that were renamed or never existed. It cannot see a panel whose metric
still exists but now carries different labels, a different unit, or a different cardinality — and the
label surface has moved: the `job="otel_collector"` stamp, `resource_to_telemetry_conversion`
promoting `service_name` and `service_instance_id`, and the `class` / `reason` / `group` / `scope`
attributes all arrived after some of these dashboards were written.

The `logs-*` dashboards have the same problem in a form no audit catches, because LogQL selectors do
not fail loudly. They filter on a log shape that gets rewritten before it lands: `debug_steps` absent
unless `LOG_LEVEL=debug` (at the source, since Stage A), the `code.*` and `telemetry.sdk.*`
attributes scrubbed by Alloy, and scope name blanked.

**One dashboard is genuinely new.** SeaweedFS has never been dashboarded because it was never
collected before Stage B. It matters more than it sounds: storage growth is where retention problems
show up first.

**And one question this stage should answer rather than inherit.** The MongoDB exporter emits 6,569
distinct metric names; `mongodb.json` queries ten of them. That cardinality was what made the
alternative backend unaffordable, and Prometheus stores it too — it just absorbs the cost more
quietly. Deciding what MongoDB telemetry is actually wanted belongs with the dashboard that consumes
it. An allowlist modelled during the backend evaluation kept every queried series and cut the stream
count by 85%.

### Stage I — retired

There is no cutover. Grafana, Prometheus and Loki stay, so the Deployment Tool's Grafana surface —
388 references across 33 Go files, `addons.observability.grafana.public`, `paths.grafana`,
`grafana_apply.go`, `grafana_url.go`, the Traefik router that `eip sync` drives, and the
`GRAFANA_ADMIN_*` env fields — stays exactly as it is. Nothing to rename, nothing to generalise.

### Stage J — promote and delete

Promote the overlay into live SoT under [`stack/`](../../stack/contents.md) and
[`deployment/`](../../deployment/contents.md), then delete this folder and its row.

## Wire compatibility

**Migrate-required:**

- **`eip.config.yaml`.** `addons.observability.grafana.*` and `paths.grafana` are operator-facing
  keys naming a product that will not be there. Renaming them needs an upgrade path for existing
  config files, and it is the only part of this project an operator has to act on.
- **`.env`.** `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` are replaced by the new backend's
  credentials, which the env template generates and locks the same way.

**Breaking, and accepted at the cut:**

- **Dashboard format.** Grafana JSON does not import. Every dashboard is rebuilt, not converted.
- **Provisioning.** The Deployment Tool embeds Grafana's file-based provisioning —
  `datasources.yaml`, `dashboards.yaml`, and twenty `grafana_dash_*` configs in the stack YAML.
  The target manages dashboards through its API, so that path is rebuilt rather than reconfigured.
- **Historical telemetry.** Prometheus TSDB and Loki chunks do not migrate and are not copied.
  The cut is hard: history before it is readable only until Stage I deletes the volumes, and not
  after.
- **`job` labels.** The exporter collapse, the Traefik OTLP switch and any change to the write path
  can each rewrite them, and every infrastructure dashboard filters on them.
- **Traefik metric names.** Prometheus exposition and OTLP export do not name the same series.

**Changed meaning, no operator action:** `LOG_LEVEL` currently sets the Loki ingest floor in Alloy;
after Stage A it sets what a service emits. Same key, same values, and the observable result is the
same when the layer is on — but it now also applies when the layer is off, which is the point.

**Additive:** `TRACES_SAMPLE_RATE`, a new `.env` key defaulting to 0 so nothing traces until it is
raised; SeaweedFS metrics existing for the first time; `LOG_STDOUT` beginning to work as documented; a `logging:` driver anchor on the
fragments; traces becoming queryable; `ws-router` appearing in metrics for the first time; Traefik
edge spans joining application traces.

**Application code changes** in Stages A, C, F and G — how a service logs, what `ws-router` reports,
where spans go and what they carry. Only the metrics path is untouched application-side, and that is
the whole of the claim that this project is a configuration change.

## Rollback

Every stage is reversible by reverting the change that made it. Stage A is the one that changes how
services log rather than what collects them, so it reverts by reverting the code; the rest are
Alloy configuration and stack fragments.

The backend evaluation is the worked example: OpenObserve was added, Alloy was repointed onto it,
and both were undone in one pass with the old stores never having been deleted. That is why
[Stage I](#stage-i--retired) exists only to say there is nothing to cut over.

## Done when

- With the layer off, every service logs to stdout at the level the operator set, without
  `debug_steps`, into a rotated log.
- Every producer sends to Alloy, and nothing collects telemetry except Alloy.
- The exporters Alloy can embed are gone as containers; `nats-exporter` remains, scraped by Alloy.
- SeaweedFS reports, including the S3 gateway the backend stores through.
- Traces are either queryable or a deliberate decision not to store them, and Sentry still receives
  errors.
- `ws-router` reports like the other five services, and no service's logs arrive twice.
- The dashboards describe what the code actually emits.
- Live SoT describes the new shape and this folder is deleted.

## Open questions

1. **Do traces get a store?** Stage F moves spans off Sentry and onto the collector, but Prometheus
   and Loki hold none. Either Tempo joins the stack or traces stay discarded and Stage F is dropped.
   Nothing else in the plan depends on the answer.
2. **What should `ws-router` measure?** Stage C added the plumbing; the instrumentation it carries is
   a separate design question.
3. **How much MongoDB telemetry is actually wanted?** 6,569 metric names collected, ten queried.
   Stage H is where this gets decided, alongside the dashboard that consumes them.
4. **Does `asynqmon` stay?** It is a queue UI and a scrape target, and it is one of the remaining
   observability services.
5. **Does the SPA's browser telemetry ever move?** Sentry keeps its errors by decision and GA4 is
   external by design, so the browser stays outside Alloy. Worth revisiting only if browser spans
   need to join backend traces beyond the `traceparent` already propagated.

## Stage status

Picking this up on a different machine, or after a gap, starts at [handoff.md](./handoff.md).
Stages A to C are committed as `dd0454b9` on `feature/archived-jobs-stats`; the backend evaluation
and its removal followed on the same branch.

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | Done |
| A — logging holds with the layer off | Done |
| B — every metrics target moves onto Alloy | Done |
| C — the application tier all speaks OTLP | Done |
| D — backend evaluation | Closed — backend not adopted |
| E — query gate | Dropped with the backend |
| F — traces stop being discarded | Not started — needs a trace store decided first |
| G — the spans say what a trace needs | Not started |
| H — fix the dashboards | Not started |
| I — cutover | Retired — nothing to cut over |
| J — promote and delete | Not started |

The consolidation ran before any backend change, and that ordering is what made the backend
evaluation cheap: every producer already reached Alloy, so standing up a candidate store was one
repoint in one file, and undoing it was the same repoint back. The stages that landed are
independent of which store sits behind the collector.
