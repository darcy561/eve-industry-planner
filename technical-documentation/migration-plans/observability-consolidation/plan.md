# Observability consolidation — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans), plus
[`../../stack/technical-rules.md`](../../stack/technical-rules.md) and
[`../../deployment/deployment-tool/technical-rules.md`](../../deployment/deployment-tool/technical-rules.md)
for the two areas this touches.
Phase 1 (project folders/docs) before any product work.
No Go surfaces are in scope, so no `go fix` sweep applies; if that changes, it runs on the touched
packages only.
Live SoT will not be edited until this project is complete and promotion is approved.

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

Alloy is already the only thing applications talk to. They emit one OTLP stream and know nothing
about Prometheus or Loki, which is what makes the backend swappable by editing one file.

Three facts shape everything below.

**Grafana stores no telemetry.** `grafana.db` is 5.2 MB of `dashboard`, `data_source`, `alert_rule`,
`annotation`, `user` — its own configuration. The metrics are 70 MB of TSDB blocks under
`/prometheus`. There is no "store it in Grafana" option because Grafana has never stored it.

**Alloy stores nothing either.** It has `prometheus.receive_http` and `prometheus.remote_write` —
an inlet and an outlet — and no storage or query component. It is a pipe.

**The traces pipeline exists and nothing feeds it.** `config.alloy` accepts OTLP traces and ends the
pipeline at `otelcol.exporter.debug "discard_traces"`, but no application sends any: `telemetry.go`
exports traces through `sentryotlp.NewTraceExporter` to the Sentry DSN, and only metrics and logs go
to the collector. Its own comment says so — *"App OTLP remains for metrics and logs to the collector"*
— and so does Alloy's — *"app traces go to Sentry, not Alloy"*. The SPA emits none either.

Tracing is also currently off at source: `SENTRY_TRACES_SAMPLE_RATE=0` installs a noop tracer
provider, so spans are created and discarded before export.

**The instrumentation is not Sentry-coupled.** Span creation is the plain OTel API, propagation is
W3C TraceContext, and the auto-instrumentation is `otelhttp` / `redisotel` / `otelmongo`. Only the
exporter names Sentry, so pointing traces at the collector is an exporter swap, not a re-instrumenting.

## One collector, one backend

```
apps ──────────OTLP──────────┐
docker stdout ─▶ loki.source.docker ─▶ otelcol.receiver.loki ─┤
node/redis/mongo/nats ─▶ prometheus.exporter.* (embedded) ────┤
                                                              ▼
                                                            Alloy
                                                              │
                                                              ▼
                                                        OpenObserve
```

Everything enters through Alloy; everything lands in one backend that stores metrics, logs and
traces and serves its own dashboards. Two services carry the pipeline. `alloy-docker-proxy` remains
as a trust boundary and `asynqmon` as a queue UI, neither of which is pipeline.

Ten services become four. The reduction comes from two independent changes that touch the same
file, so they land together: standalone exporters become Alloy components, and one backend replaces
three.

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
receiver (`--web.enable-otlp-receiver`, currently not enabled), so this is possible. It removes
Alloy from the metrics path only, leaving it in place for logs, and costs more than it saves:
applications gain a second export destination, metric names shift because Alloy's
`add_metric_suffixes = false` no longer applies, and the `job="otel_collector"` relabel that every
dashboard filters on disappears.

**`grafana/otel-lgtm` — rejected.** Bundles Grafana, Prometheus, Loki, Tempo and a collector in one
container, but Grafana Labs ships it for development and demonstration rather than production, and
it covers neither the Docker stdout scrape nor the exporters without adding that configuration back.

## Verified facts

Checked against the running stack and current vendor documentation rather than recalled, because
several are the kind that go stale.

| Fact | How it was checked |
|---|---|
| Alloy embeds `prometheus.exporter.unix`, `.redis`, `.mongodb`, `.nats` | `alloy validate` in the running container, with a deliberately invalid component as a negative control |
| Alloy has no storage or query component | Same method: `prometheus.storage`, `.tsdb`, `.query` all report "cannot find the definition" |
| `otelcol.receiver.loki` exists, so the Docker stdout scrape can be bridged to OTLP | Same method |
| Grafana stores configuration, not telemetry | Table names read out of `grafana.db`; sizes compared against the Prometheus TSDB |
| Prometheus scrapes 7 targets unrelated to OTLP | `prometheus.yml` job list |
| Prometheus is v3.2.1 with `--web.enable-remote-write-receiver` and no OTLP receiver | Service inspect on the running task |
| SeaweedFS already serves S3 on `:8333` with credentials in the stack | `S3_URL`, `S3_ACCESS_KEY`, `S3_BUCKET` in the stack YAML |
| OpenObserve single-node is one container; HA needs Kubernetes | Vendor architecture documentation |
| OpenObserve is AGPL-3.0; SSO, advanced RBAC, audit trail, federated search and redaction are Enterprise | Project repository |
| SigNoz self-hosted is five containers with a 4 GB memory floor | Vendor install documentation |

**Not verified, and the reason Stage B exists:** OpenObserve claims full PromQL compatibility. No
independent limitations list was found, and the claim is marketing rather than a compatibility
matrix. It decides whether twelve metric dashboards port or are rewritten.

## Phases

Phase 1 — this folder — is complete when the plan, contents map, overlay scaffold and section row
exist. No product work starts before that.

### Stage A — run both, cut nothing over

Add single-node OpenObserve to `docker-stack.obs.yml`, backed by the existing SeaweedFS S3.
`prometheus.remote_write` takes multiple `endpoint` blocks, so add a second alongside the Prometheus
one and both stores receive every metric. Add a parallel `otelcol.exporter.otlphttp` for logs.

Prometheus, Loki and Grafana keep running untouched. Rollback is deleting one service and one
config block.

Done when the same metric can be read from both stores for the same timestamp.

### Stage B — the decision gate

Rebuild the ESI limiter dashboard in OpenObserve. It is needed regardless, and it is the honest
PromQL test: it exercises observable gauges, monotonic counters, histogram quantiles, and label
filtering on `group`, `scope`, `class` and `reason`.

**This stage decides the project.** If PromQL holds on real panels, continue. If it does not, stop
here: the parallel run is deleted, the ESI dashboard is built in Grafana instead, and only Stage C
(which is independent of the backend) proceeds.

What the limiter emits, and why bucket state is reported once by core while queue depth is reported
per replica, is [backend/shared/esi.md](../../backend/shared/esi.md) § What it reports.

### Stage C — exporters become components

Fold `node_exporter`, `redis-exporter`, `mongodb-exporter` and `nats-exporter` into `config.alloy`
as `prometheus.exporter.*` components and delete their services and scrape jobs.

Independent of the backend choice, so it lands whichever way Stage B goes.

Three things to get right:

- `prometheus.exporter.unix` inside a container sees the container's namespace. It needs the host
  `/proc`, `/sys` and rootfs mounts that `node_exporter` has today.
- Each embedded exporter needs a relabel preserving its `job` name. The existing
  `prometheus.relabel "otel_collector"` stamps `job="otel_collector"` on everything crossing that
  path, and the infrastructure dashboards filter on `job="node"`, `job="redis"` and so on.
- Redis and Mongo credentials move into Alloy configuration, delivered by environment expansion
  from the existing secrets rather than restated.

### Stage D — traces stop being discarded

Two changes, not one. **This stage was scoped as config-only and is not.**

- **In the applications:** add an OTLP trace exporter alongside or instead of the Sentry one, and
  raise `SENTRY_TRACES_SAMPLE_RATE` above zero so spans are sampled at all. `telemetry.go` already
  resolves the collector endpoint for metrics and logs, so this is roughly ten lines against a
  vendor-neutral instrumentation. Whether Sentry keeps receiving traces as well is a decision: one
  provider can carry two exporters.
- **In Alloy:** repoint `otelcol.exporter.debug "discard_traces"` at the backend.

Doing only the second produces an empty traces view.

Held until after Stage B because it only pays off on a backend that stores traces.

### Stage H — the spans say what a trace needs

Turning tracing on is worth little if the spans carry nothing. Three faults, found while rebuilding
the worker and none of them structural:

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
conventions are what make a trace render in whichever backend Stage B picks.

**Verification needs tracing on.** None of this is observable while the sample rate is zero, so this
stage follows D rather than preceding it.

### Stage E — the remaining dashboards

Eighteen dashboards, and the cost is lopsided:

- **Twelve metric dashboards** port or are rewritten depending on Stage B.
- **Six `logs-*` dashboards** are rewritten regardless. They are LogQL against Loki; the target
  queries logs with SQL. No amount of PromQL compatibility helps here.

### Stage F — cutover

Remove the second `remote_write` endpoint, then Grafana, Prometheus and Loki, their volumes and
their provisioning from the embedded kit.

The point of no return is deleting the Prometheus and Loki volumes; historical data does not
migrate. Decide the retention question below before this stage, not during it.

### Stage G — promote and delete

Promote the overlay into live SoT under [`stack/`](../../stack/contents.md) and
[`deployment/`](../../deployment/contents.md), then delete this folder and its row.

## Wire compatibility

**Breaking, and the reason for the parallel run:**

- **Dashboard format.** Grafana JSON does not import. Every dashboard is rebuilt, not converted.
- **Provisioning.** The Deployment Tool embeds Grafana's file-based provisioning —
  `datasources.yaml`, `dashboards.yaml`, and eighteen `grafana_dash_*` configs in the stack YAML.
  The target manages dashboards through its API, so that path is rebuilt rather than reconfigured.
- **Historical telemetry.** Prometheus TSDB and Loki chunks do not migrate. Whatever retention
  matters must survive as a parallel-run overlap, not a copy.
- **`job` labels.** Both the exporter collapse and any change to the write path can rewrite them,
  and every infrastructure dashboard filters on them.

**Additive:** traces becoming queryable.

The applications are unchanged for metrics and logs, which do only ever talk to Alloy. **Traces are
the exception:** Stage D changes their exporter and Stage H changes what the spans carry, so the
claim that this project never touches application code holds for every stage but those two.

## Cutover and rollback

Every stage before F is reversible by deleting what it added, because the existing stack keeps
running alongside. Stage A adds a second write destination rather than moving the first.

After Stage F, rollback means restoring Prometheus, Loki and Grafana from the stack fragment and
accepting the gap in history for the period the old stores were not being written.

Rollback triggers worth naming in advance: PromQL gaps found after Stage B, query performance worse
than Prometheus on the panels that matter, or single-node ingestion falling behind.

## Done when

- Applications, unchanged, emit to Alloy and their telemetry is queryable.
- One backend answers for metrics, logs and traces.
- No standalone exporter containers remain; their metrics still arrive.
- Traces are queryable rather than discarded.
- Grafana, Prometheus and Loki are gone from the stack fragment and the embedded kit.
- `docker service ls` shows four observability services.
- Live SoT describes the new shape and this folder is deleted.

## Open questions

1. **Are traces actually wanted?** The only answer that would send this back to SigNoz. OpenObserve
   stores traces, so the question is whether dedicated APM tooling is worth five containers rather
   than whether tracing is possible. A "no" retires Stages D and H rather than deferring them, and
   the instrumentation would then be carrying a cost with no consumer — worth deciding deliberately,
   because it is portable and one exporter away from working.
6. **Does Sentry keep receiving traces?** One tracer provider can export to both. Sentry ties a trace
   to the error it already captures; the collector puts traces beside the metrics and logs. Deciding
   this is part of Stage D, not after it.
2. **How much history matters?** Decides how long the parallel run lasts, since nothing migrates.
3. **Does anyone but the operator need dashboards?** SSO and advanced RBAC are Enterprise in
   OpenObserve; Grafana OSS gives more here. Irrelevant for a single operator, decisive if not.
4. **Retention and storage sizing on SeaweedFS.** Object storage changes the retention economics
   against a local TSDB volume, and the current 70 MB is not a useful guide to what a year looks
   like.
5. **Does asynqmon stay?** It is a queue UI and a scrape target. Out of scope here, but it is one of
   the four remaining services and worth asking about when the count is the point.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | Done |
| A — run both, cut nothing over | Not started |
| B — decision gate (ESI dashboard, PromQL verification) | Not started |
| C — exporters become components | Not started |
| D — traces stop being discarded | Not started |
| H — the spans say what a trace needs | Not started |
| E — remaining dashboards | Not started |
| F — cutover | Not started |
| G — promote and delete | Not started |

Lettering follows when a stage was written, not when it runs: H was added after G existed and runs
straight after D, while G stays last.
