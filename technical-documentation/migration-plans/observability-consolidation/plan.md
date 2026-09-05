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

**Everything that produces telemetry sends it to Alloy. Alloy sends it to OpenObserve.**

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

## One collector, one backend

```
apps (6 Go services) ─────────────OTLP──────────────┐
traefik ──────────────────────────OTLP──────────────┤
docker stdout ─▶ loki.source.docker ─▶ otelcol.receiver.loki ─┤
node/redis/mongo ─▶ prometheus.exporter.* (embedded) ───────┤
nats-exporter, asynqmon, seaweedfs ─▶ prometheus.scrape ────┤
                                                    ▼
                                                  Alloy
                                                    │
                                                    ▼
                                              OpenObserve
```

Everything enters through Alloy; everything lands in one backend that stores metrics, logs and
traces and serves its own dashboards. Two services carry the pipeline. `alloy-docker-proxy` remains
as a trust boundary and `asynqmon` as a queue UI, neither of which is pipeline.

Ten services become five. The reduction comes from three independent changes that touch the same
file: the exporters Alloy can embed become components, the rest move onto Alloy as scrape targets or
push to it, and one backend replaces three. `nats-exporter` survives because Alloy has no NATS
exporter component — it stays a container that Alloy scrapes, like `asynqmon`.

## Decisions taken

These were open when the plan was first written and are settled now. They are recorded here rather
than in the stages so that a reader knows the stages are executing a decision, not proposing one.

**Sentry keeps errors; traces move.** Error capture, grouping and release tracking stay on Sentry
for both the backend and the SPA — that is the job it does well and OpenObserve does not replace it.
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

Four options were measured against a single-host Swarm with no Kubernetes.

**OpenObserve, single-node — chosen.** One container: metrics, logs, traces, dashboards and
alerting, with SQLite for metadata and either local disk or S3 for data. It accepts OTLP and
Prometheus `remote_write`. AGPL-3.0, and the open-source edition is feature-complete for every
signal this stack carries.

**SigNoz — rejected on footprint.** Self-hosted needs five containers (ClickHouse, ClickHouse
Keeper, PostgreSQL, its own OTel collector, and the SigNoz backend) and documents a floor of 4 GB
of memory for Docker. Against the same three services it would replace, that is a net increase of
two containers plus a second database and a coordination service. Its HA path needs Kubernetes,
which is not available here. SigNoz is the stronger dedicated APM product and would be worth
revisiting if tracing became the primary need — but OpenObserve stores traces too, so "we would
need SigNoz for traces" is not the reason to take it.

**Apps pushing OTLP straight to Prometheus — rejected.** Prometheus v3.2.1 has a native OTLP
receiver (`--web.enable-otlp-receiver`, currently not enabled), so this is possible. It is also the
opposite of this project: it removes Alloy from the metrics path while leaving it in place for logs,
so the stack keeps two ingestion paths and gains a second export destination in every application.

**`grafana/otel-lgtm` — rejected.** Bundles Grafana, Prometheus, Loki, Tempo and a collector in one
container, but Grafana Labs ships it for development and demonstration rather than production, and
it covers neither the Docker stdout scrape nor the exporters without adding that configuration back.

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
| OpenObserve takes `remote_write` at `/api/<org>/prometheus/api/v1/write` and OTLP at `/api/<org>/v1/{logs,metrics,traces}` (HTTP `:5080`, gRPC `:5081`), authenticated with `Authorization: Basic` and an optional `stream-name` header | Vendor ingestion documentation |
| SeaweedFS already serves S3 on `:8333` with credentials in the stack | `S3_URL`, `S3_ACCESS_KEY`, `S3_BUCKET` in the stack YAML |
| `weed mini -metricsPort` serves 48 SeaweedFS metric families (master, filer, filerStore, volumeServer, admin) on one port; `-s3.metricsPort` is accepted but never listens under `mini` | Throwaway `chrislusf/seaweedfs:4.40 mini` container with both flags set, then curl against each port: 200 and connection refused |
| OpenObserve single-node is one container; HA needs Kubernetes | Vendor architecture documentation |
| OpenObserve is AGPL-3.0; SSO, advanced RBAC, audit trail, federated search and redaction are Enterprise | Project repository |
| SigNoz self-hosted is five containers with a 4 GB memory floor | Vendor install documentation |
| There are **20** dashboards: 11 Prometheus-only, 7 Loki-only, 2 mixed | Datasource and expression audit across `kit/obs/grafana/.../definitions/` |
| Two dashboards query metrics nothing emits — 15 series in total | Every dashboard expression audited against the instrument names registered across `services/`: `core-esi-limits.json` selects `core_esi_group_*` against emitted `core.esi.bucket.*`, and ten `api-otel-metrics.json` panels select `api_static_data_*` series that no instrument creates |

**Not verified, and the reason Stage E exists:** OpenObserve claims full PromQL compatibility. No
independent limitations list was found, and the claim is marketing rather than a compatibility
matrix. Arithmetic between two metrics has regressed there before (issue #5703, fixed in #5719),
and this stack has fourteen expressions of exactly that shape. It decides whether thirteen metric
dashboards port or are rewritten.

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

This stage stands on its own: it is worth doing whether or not the backend ever changes, and if
Stage E rules OpenObserve out, none of it is wasted.

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

Like Stage B, this is worth doing on its own terms and survives whatever Stage E decides.

### Stage D — run both, cut nothing over

By now Alloy carries everything, which is what makes this stage small. Add single-node OpenObserve to
`docker-stack.obs.yml`, backed by the existing SeaweedFS S3, then fan out the paths Alloy owns —
every source rides one of them, so nothing needs a second destination of its own:

- **Metrics.** `prometheus.remote_write` takes multiple `endpoint` blocks; add a second alongside the
  Prometheus one.
- **Application logs.** Add a second `otelcol.exporter.otlphttp` beside the Loki one.
- **Docker stdout.** This one is not a second exporter. The path is Loki-native push with no OTLP in
  it, so duplicating it means inserting `otelcol.receiver.loki` and forwarding `loki.source.docker`
  to both the existing `loki.write` and the new OTLP branch. **Decide here whether the bridged copy
  passes through the same `LOG_LEVEL` filter and `strip_debug_steps` transform the application logs
  get** — today it does not, and the parallel run is where that difference becomes visible.

Prometheus, Loki and Grafana keep running untouched. Rollback is deleting one service and the added
config blocks.

Done when the same metric and the same log line can be read from both stores for the same timestamp.

### Stage E — the decision gate

Rebuild the ESI limiter dashboard in OpenObserve, and alongside it a probe panel set covering the
PromQL constructs this stack actually depends on.

**This stage decides the backend, not the project.** If PromQL holds on real panels, continue. It
decides only that: whether the *queries* survive, not whether the dashboards still describe the
system — see [Stage H](#stage-h--the-dashboards). The consolidation landed in Stages B and C keeps
its value either way, which is why they run first.

If PromQL does not hold, stop here: delete the parallel run, build the ESI dashboard in Grafana
instead, and keep Prometheus, Loki and Grafana as the store. Stages B and C have already landed and
stay landed; the stack keeps one collector and loses only the second backend.

Two things about the ESI dashboard specifically. First, **the shipped one is broken today**, and has
been since the limiter's metrics were renamed: its five panels select `core_esi_group_token_limit`,
`_token_used`, `_token_remaining`, `_seconds_into_window` and `_seconds_until_reset`, while the code
emits `core.esi.bucket.token_limit`, `.token_used`, `.token_remaining`, `.fill` and
`.seconds_until_open`. That is a live defect independent of this project and worth fixing on its own
terms; here it means the rebuild starts from the live doc, not from the JSON.

Second, **as shipped it is five bare gauge selectors and proves nothing about PromQL.** The
histograms and the `class` / `reason` labels live in `esiclient`, a different emitter from the core
gauges. A gate that decides the project has to be built to exercise:

| Construct | Where it is used today |
|---|---|
| `rate` over counters, `histogram_quantile` | 139 and 25 occurrences across the dashboards |
| Arithmetic between two metrics | 14 expressions — the construct with a known regression history |
| `label_replace` | 12 occurrences |
| `on() group_left(...)` vector matching | `app-activity.json` |
| `topk`, `irate`, `clamp_min`, `or` fallback | `frontend-events`, `mongodb` |
| Grafana-isms with no equivalent | `$__rate_interval` and dashboard template variables — these do not port, they get replaced |

What the limiter emits, and why bucket state is reported once by core while queue depth is reported
per replica, is [backend/shared/esi.md](../../backend/shared/esi.md) § What it reports.

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

Held until after Stage E because it only pays off on a backend that stores traces.

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
conventions are what make a trace render in whichever backend Stage E picks.

**Verification needs tracing on.** None of this is observable while the sample rate is zero, so this
stage follows F rather than preceding it.

### Stage H — the dashboards

Twenty dashboards, and the cost is lopsided:

- **Eleven Prometheus-only.** Stage E decides whether their queries can be carried across at all;
  the note below decides how much of each one is worth carrying. `traefik.json` was expected to be a
  rewrite regardless, on the assumption that OTLP export would rename Traefik's series. It did not:
  all 22 `traefik_*` families came through the switch unchanged, `_bucket` histograms included.
- **Seven Loki-only** (`logs-api`, `logs-core`, `logs-frontend`, `logs-traefik`, `logs-websocket`,
  `logs-worker`, `observability-stack`) are rewritten regardless. They are LogQL; the target queries
  logs with SQL. No amount of PromQL compatibility helps here.
- **Two mixed** (`asynq-queues`, `worker-tasks`) need both halves.
- **One new.** SeaweedFS has never been dashboarded because it has never been collected. It is a
  build, not a port, and it matters more after cutover than before: retention and ingestion problems
  in the backend show up as storage problems first.

**Treat none of these as a direct port.** The question Stage E answers is whether PromQL survives the
backend change; it does not tell you whether a dashboard still describes the system. Metric and log
shapes have moved underneath these definitions since they were written, and a panel that ports
cleanly into a query the new backend accepts is still a panel returning nothing.

Two cases are already confirmed by an audit of every dashboard expression against the instruments
`services/` actually registers:

| Dashboard | What it queries | What exists |
|---|---|---|
| `core-esi-limits.json` | `core_esi_group_token_limit`, `_token_used`, `_token_remaining`, `_seconds_into_window`, `_seconds_until_reset` — all five panels | `core.esi.bucket.token_limit`, `.token_used`, `.token_remaining`, `.fill`, `.seconds_until_open` |
| `api-otel-metrics.json` | ten panels on `api_static_data_*_requests_total` and `_duration_milliseconds_bucket` | Nothing. Those endpoints call `LogRequestMetrics`, which despite its name emits **log lines**, not instruments |
| `mongodb.json` | one panel on `mongodb_oplog_stats_size` | `mongodb_oplog_stats_storageStats_size`. Confirmed against the live store: zero samples for the queried name across 12 hours, while the real one recorded throughout |

Sixteen dead series across three dashboards, and that audit only catches names that were renamed or
never existed. It cannot see a panel whose metric still exists but now carries different labels, a
different unit, or a different cardinality — and the label surface has moved too: the
`job="otel_collector"` stamp, `resource_to_telemetry_conversion` promoting `service_name` and
`service_instance_id`, and the `class` / `reason` / `group` / `scope` attributes all arrived after
some of these dashboards were written.

The `logs-*` dashboards have the same problem in a form no audit catches, because LogQL selectors do
not fail loudly. They filter on a log shape that gets rewritten before it lands: `debug_steps` absent
unless `LOG_LEVEL=debug` (at the source, since Stage A), the `code.*` and `telemetry.sdk.*`
attributes scrubbed by Alloy, scope name blanked, `compose_service` arriving as a resource attribute
rather than a scrape label. Stage A also moved the severity floor into the process, which changes
what reaches the store at all.

So the rebuild starts from **what the code emits today** — the instrument registrations and the live
topic docs — and not from the JSON. Where a dashboard turns out to have been broken for a while, that
is a defect to fix on its own terms rather than a rewrite to schedule: `core-esi-limits.json` and the
static-data panels are wrong in Grafana right now, and would still be wrong if this project were
cancelled. The same is true of the `mongodb.json` oplog panel.

### Stage I — cutover

Remove the second destinations added in Stage D, then Grafana, Prometheus and Loki, their volumes
and their provisioning.

The Deployment Tool work is the bulk of this stage and is not a deletion. Grafana is a first-class
concept there — **388 references across 33 Go files** — including `addons.observability.grafana.public`
and `base_url` in the config schema, `paths.grafana`, `grafana_apply.go`, `grafana_url.go`,
`GrafanaApplySurfaceFromDoc` in `stackfile.go`, the `grafana.public` network attach-when, the
Traefik router enable/disable that `eip sync` drives, and `GRAFANA_ADMIN_USER` /
`GRAFANA_ADMIN_PASSWORD` in the env template. OpenObserve needs the same edge-exposure surface, so
this is a rename-and-generalise refactor with its tests, not a delete.

The point of no return is deleting the Prometheus and Loki volumes; historical data does not
migrate. Decide the retention question below before this stage, not during it.

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

**Breaking, and the reason for the parallel run:**

- **Dashboard format.** Grafana JSON does not import. Every dashboard is rebuilt, not converted.
- **Provisioning.** The Deployment Tool embeds Grafana's file-based provisioning —
  `datasources.yaml`, `dashboards.yaml`, and twenty `grafana_dash_*` configs in the stack YAML.
  The target manages dashboards through its API, so that path is rebuilt rather than reconfigured.
- **Historical telemetry.** Prometheus TSDB and Loki chunks do not migrate. Whatever retention
  matters must survive as a parallel-run overlap, not a copy.
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

## Cutover and rollback

Every stage before I is reversible by deleting what it added, because the existing stack keeps
running alongside. Stage D adds second destinations rather than moving the first.

Stage A is the exception in kind rather than in risk: it changes how services log rather than adding
a destination, so it reverts by reverting the change. It is also the one stage that improves the
stack whether or not anything after it happens.

After Stage I, rollback means restoring Prometheus, Loki and Grafana from the stack fragment and
accepting the gap in history for the period the old stores were not being written. Restoring
Prometheus does **not** mean undoing Stage B: it comes back as a `remote_write` target with an empty
scrape list, because Alloy now owns collection and that is true whichever backend stores the result.

Rollback triggers worth naming in advance: PromQL gaps found after Stage E, query performance worse
than Prometheus on the panels that matter, or single-node ingestion falling behind.

## Done when

- With the layer off, every service logs to stdout at the level the operator set, without
  `debug_steps`, into a rotated log.
- Every producer sends to Alloy, and nothing collects telemetry except Alloy.
- One backend answers for metrics, logs and traces.
- The exporters Alloy can embed are gone as containers; `nats-exporter` remains, scraped by Alloy.
- SeaweedFS reports, including the S3 gateway the backend stores through.
- Traces are queryable rather than discarded, and Sentry still receives errors.
- `ws-router` reports like the other five services, and no service's logs arrive twice.
- Grafana, Prometheus and Loki are gone from the stack fragment, the embedded kit and the
  Deployment Tool's configuration surface.
- `docker service ls` shows five observability services.
- Live SoT describes the new shape and this folder is deleted.

## Open questions

1. **How much history matters?** Decides how long the parallel run lasts, since nothing migrates.
2. **Does anyone but the operator need dashboards?** SSO and advanced RBAC are Enterprise in
   OpenObserve; Grafana OSS gives more here. Irrelevant for a single operator, decisive if not.
3. **Retention and storage sizing on SeaweedFS.** Object storage changes the retention economics
   against a local TSDB volume, and the current 70 MB is not a useful guide to what a year looks
   like. Stage B makes this answerable rather than guessable: once SeaweedFS reports, the growth
   curve is measurable during the parallel run instead of estimated before it.
4. **Does `asynqmon` stay?** It is a queue UI and a scrape target. Out of scope here, but it is one
   of the four remaining services and worth asking about when the count is the point.
5. **What should `ws-router` measure?** Stage C adds the plumbing; the instrumentation it carries is
   a separate design question.
6. **Does the SPA's browser telemetry ever move?** Sentry keeps its errors by decision, and GA4 is
   external by design, so the browser is the one producer that stays outside Alloy. Worth revisiting
   only if browser spans need to join backend traces beyond the `traceparent` already propagated.

## Stage status

Picking this up on a different machine, or after a gap, starts at [handoff.md](./handoff.md) — the
code through Stage C is uncommitted working tree and does not travel with these docs.

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | Done |
| A — logging holds with the layer off | Done |
| B — every metrics target moves onto Alloy | Done |
| C — the application tier all speaks OTLP | Done |
| D — run both, cut nothing over | Not started |
| E — decision gate (ESI dashboard, PromQL verification) | Not started |
| F — traces stop being discarded | Not started |
| G — the spans say what a trace needs | Not started |
| H — the dashboards | Not started |
| I — cutover | Not started |
| J — promote and delete | Not started |

The consolidation runs before the backend arrives. Every producer reaches Alloy first, so standing up
OpenObserve is one fan-out at one place rather than a destination added per source, and each
consolidation stage is verifiable against the store and dashboards that already exist.
