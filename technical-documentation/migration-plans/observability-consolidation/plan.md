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

**Traces are collected and thrown away.** Applications already emit them; `config.alloy` ends that
pipeline at `otelcol.exporter.debug "discard_traces"`.

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

Depends on the ESI project wiring `esiclient.RegisterMetrics`, which currently has no callers, so
the worker's queue-depth and per-bucket gauges never reach any backend. That is an
[esi-rate-limiting](../esi-rate-limiting/contents.md) item, not this project's.

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

Repoint `otelcol.exporter.debug "discard_traces"` at the backend. The applications already emit
traces, so this is a routing change that turns on distributed tracing across api, worker and
websocket.

Held until after Stage B because it only pays off on a backend that stores traces.

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

**Additive:** traces becoming queryable; the applications are unchanged throughout, because they
only ever talk to Alloy.

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
   than whether tracing is possible.
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
| E — remaining dashboards | Not started |
| F — cutover | Not started |
| G — promote and delete | Not started |
