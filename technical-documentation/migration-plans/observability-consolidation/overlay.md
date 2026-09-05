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

**Grafana runs 13.2.1.** The pin had sat at 13.0.1 while the line had moved on by eight patch
releases, and the browse page was failing in a way that looked version-related at the time. It was
not — that fault turned out to be client-side, and is recorded under § The Grafana dashboards browse page — but
the upgrade is worth keeping on its own terms and every dashboard came through it unchanged.

It now runs `allowUiUpdates: false` with `editable: false`. Measured against `grafana/grafana:13.0.1`
before the change: with the flag off a dashboard reports `provisioned: true`, keeps the `refresh`
value its file sets, and picks up a file edit automatically within `updateIntervalSeconds` — no
restart and no `eip sync`. The comment that justified the flag warned that provisioned auto-refresh
would be ignored; that does not happen on this version.

**`api-otel-metrics.json`** was reorganised rather than repaired. Its queries were sound, but two
panels carried sixteen series each — auth flows, static file serving and CRUD endpoints sharing one
axis despite differing by orders of magnitude in both rate and latency. It now opens with four stat
tiles (requests, errors, slowest endpoint, market data gaps), then a `topk(5)` pair naming the
busiest and slowest endpoints, then a row per concern: auth and SSO, content endpoints, lookup and
static data, and errors. Each row's panels carry three to nine related series.

The `topk` panels label their series with `label_replace`, because the underlying instruments are
separate metric names rather than one metric with an `endpoint` label. Their legends are tables on
the right: the per-series `mean` and `max` columns push the endpoint name out of a legend placed
underneath.

**A per-container row breaks the same figures down by replica.** The capacity controller runs one to
five API replicas, and `resource_to_telemetry_conversion` puts `service_instance_id` on every series,
so request rate, error rate and p96 latency each group by it. An uneven spread means traffic is not
landing evenly; one replica erroring alone points at that container rather than at the endpoint.

Those three panels join their metrics with `or`, not `+`. Addition requires the instance label to be
present on both sides, so a single endpoint with no traffic empties the whole panel; `or` unions the
series instead. A replica that has stopped reporting leaves NaN buckets behind, which is why the
latency panel can show a dead container until its samples age out.

**Static-data endpoints stay folded into the main panels.** They are registered and correct; they
simply see no traffic on a stack with no users, which is why they read empty.

**`websocket-otel-metrics.json`** now covers the router as well as the backends, and is titled
"WebSocket · delivery and placement" for it. The five `wsrouter_*` instruments Stage C added were
being collected and shown nowhere, as were the three `ws_placement_*` gauges — between them the
placement decision that puts a tenant on a backend, and the capacity ladder that decides when a
backend stops accepting new ones.

Six rows: what is connected now; the router's placement decisions, home skips and proxy errors;
connected clients plotted against the soft and full thresholds they are measured by, with the flags
each backend is publishing; the upgrade handshake; connection churn and fanout; and the per-backend
and per-account breakdowns.

**Who is connected is reported per owner, not per kind.** The websocket server already kept
`userConnections`, `corpRefToClients` and `allianceRefToClients` to route document updates by scope,
but nothing observed them, so there was no way to see which groups were connected or where the
router had put them. `services/websocket/server/metrics.go` now registers
`ws.owner_connected_clients`, labelled `owner_kind` and `owner_id`, with `ws.connected_owners` as
the total.

One instrument rather than one per kind, because `models.OwnerKind` is the thing that decides what
an owner can be, and it already carries four values — a planner is an owner too, and a metric named
for corporations and alliances would have missed it. A kind added there is picked up by extending
the callback, and the dashboards split on the label rather than on a metric name.

The maps are read under the existing `corpRefIndexMu` / `allianceRefIndexMu` locks, in the order
`types.go` sets out. Cardinality is bounded by owners with someone connected, which is at most the
account cardinality `ws.account_connected_clients` already carries plus the groups those accounts
belong to.

Two of those panels break each owner down by `service_instance_id`. That is the question a large
group raises: not how many clients it has, but whether they all landed on one backend. An owner
concentrated on a single backend is what drives that backend to soft and then full while its peers
sit idle.

The placement panels stack their series, because the question there is the mix — a rising share of
`reassigned` or `sticky_fallback` against `hit` means tenants are being moved rather than staying
put. What each result means, and the soft/full/cutoff ladder, is
[backend/ws-router/ws-router.md](../../backend/ws-router/ws-router.md) § Placement.

**`app-activity.json`** was nineteen tiles in an undifferentiated grid with no rows at all. It now
reads in three bands — usage and growth, usage shape, and build and configuration — across twelve
tiles.

**A metric measured over several windows is one panel, not one panel per window.** Distinct
characters, distinct logged-in accounts, new users and jobs archived each collapsed from separate
24h/7d/30d tiles into a single panel carrying the windows as series. That removed seven tiles and
let the remaining bands divide the grid evenly, where the per-window tiles had left panels stretched
across whatever width was left over.

Who is using the app and how that is growing now read together in one band, with the new-users trend
chart beside the tile it explains rather than orphaned at the foot of the dashboard.

Elsewhere the stat panels rendered `value_and_name`, which reprinted the series name inside the box
directly beneath the panel title that already said it; those show the value alone, and the legend
strings that fed them are gone. The consolidated panels keep `value_and_name`, because there the
name is the window label and it is the only thing distinguishing the figures.

Two panels were saying less than they appeared to. **Registered accounts** — formerly "Total users ·
Mongo" — counts documents in the users collection, meaning every account ever registered rather than
anything live. **SDE build** reports 0 with version `unknown` until an import calls
`SetCurrentVersion`, so a value of 0 now renders as "not imported" rather than as a bare zero that
reads like a fault.

**`mongodb.json`** was also the last dashboard built on the retired renderers: thirteen `graph` and
three `singlestat` panels on schema version 27, both deprecated in Grafana 13. They are now
`timeseries` and `stat` on schema 39, each carrying forward the unit its old y-axis declared.
Titles, positions, queries and legend formats are unchanged — only the rendering moved.

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

### How a change actually reaches the stack

The observability configuration is **embedded in the `eip` binary** (`//go:embed obs/**` in
`kit/obs.go`), materialised to disk and shipped as a Swarm config object. Stack fragments are read
from disk. The two halves therefore land at different times:

```
edit kit/obs/**            → rebuild the binary, then deploy
edit docker-stack*.yml     → deploy
```

Deploying a kit change without rebuilding the binary applies the stack half only. During Stage B
that removed an exporter container while leaving its replacement absent — Redis had no collector at
all until the next build. Check before deploying:

```bash
grep -a -c 'prometheus.exporter.redis' eip.exe   # 0 means the binary predates the kit edit
```

A **dashboard-only** change does not need `eip dev`: rebuild the binary so the embedded kit carries
the edit, then `eip sync`, which is a targeted config update rather than a bake of seven application
images. Grafana then re-reads its provisioned files on a fifteen-second cycle — the config object is
replaced immediately, but the API serves the previous dashboard until that cycle runs, so wait for
the panel count to change rather than concluding the deploy failed.

### Verification commands

Run from the repo root; `eip-obs` is the observability overlay.

```bash
# every collection job, with real sample ages
docker run --rm --network eip-obs curlimages/curl:8.11.1 -s --data-urlencode \
  'query=timestamp({__name__=~"redis_up|node_load1|mongodb_up|asynq_queue_size"})' \
  'http://prometheus:9090/api/v1/query'

# which containers Alloy is tailing (should exclude the six Go services and four proxies)
cid=$(docker ps --format '{{.ID}} {{.Names}}' | grep 'eip_alloy\.1' | awk '{print $1}')
docker run --rm --network container:$cid curlimages/curl:8.11.1 -s \
  'http://localhost:12345/api/v0/web/components/loki.source.docker.docker'

# what a metric's labels actually are, including per-container identity
docker run --rm --network eip-obs curlimages/curl:8.11.1 -s \
  'http://prometheus:9090/api/v1/query?query=ws_connected_clients'

# which services reach Loki
docker run --rm --network eip-obs curlimages/curl:8.11.1 -s \
  'http://loki:3100/loki/api/v1/label/compose_service/values'

# Alloy's own view (component health, and its error log)
docker run --rm --network container:$cid curlimages/curl:8.11.1 -s \
  'http://localhost:12345/api/v0/web/components'
```

### Traps this stack has already cost time on

**`alloy validate` needs the stack's stability level.** Without `--stability.level=experimental` it
rejects `otelcol.exporter.debug`, which the config uses. Validate against the pinned image:

```bash
docker run --rm -v "$PWD/deployment-tool/internal/kit/obs/alloy/config.alloy":/c.alloy:ro \
  grafana/alloy:v1.19.2 validate --stability.level=experimental /c.alloy
```

**Docker refuses bind mounts from some host paths.** Mounting a probe file from a scratch directory
fails with "mounts denied", and a check that greps the output for a validation error reads that
failure as a pass. Write probe configs inside the container or mount from under the repo, and assert
on exit codes.

**Prometheus instant queries stamp the evaluation time, not the sample time.** Two series both
looked 0.3s old when one had been stale for five minutes. Use `timestamp(<metric>)` when the question
is whether something is still being written — but note `timestamp(<metric>) < N` can return empty
even while data arrives, so confirm with `count({__name__=~".+"})` or a known series before
concluding a store is not receiving.

**Alloy's component health is not a failure signal.** During the `discovery.docker` outage every
component reported healthy while the Docker log scrape collected nothing. Trust the error log and the
data in the store. Its reload burst misleads too: after a config change Alloy logs a few hundred
"node exited without error" lines, which arrive unlabelled and read as a broken drop rule.

**Loki indexes OTLP resource attributes as structured metadata, not stream labels.** A log arriving
by the OTLP path carries `compose_service` in `loki_attribute_labels`, and `{compose_service="x"}`
matches nothing. Check a label is queryable against
`/loki/api/v1/label/compose_service/values` before assuming a log path works.

**`strings` is not installed in this environment.** A staleness probe using it returns 0 with an
error on stderr whether or not the binary is current. Use `grep -a -c '<marker>' eip.exe`.

**`build-host.sh` fails on Windows/Git Bash.** It assigns `mktemp`'s output to `TMP`, already the
Windows temp-directory variable Go reads for its build work dir, so `go build` tries to `mkdir`
inside a file. Invoke `go build` directly with the script's ldflags and `-trimpath`, then copy the
result over `eip.exe`.

### The Grafana dashboards browse page

The dashboards **list** page can fail in a normal browser with
`TypeError: Cannot use 'in' operator to search for 'parentUID' in <!DOCTYPE html>`, while every
individual dashboard opens fine and the same page works in a private window. It is client-side
state, not the stack: a request loses the `/grafana` prefix, lands on the SPA's catch-all at the
document root, and Grafana parses the HTML it gets back as JSON.

Ruled out by measurement, so do not spend time on them again: the dashboard definitions (a blank
Grafana with a fresh database fails identically), the provisioning settings, `base_url`, and the
Grafana version. The likeliest remaining cause is a service worker registered by an older frontend
build — `5f0021418` removed the PWA artifacts, and a browser that visited before that still has one
installed. Unregistering it under devtools → Application → Service Workers is the thing to try.

## Missing live SoT to draft here

The observability stack has no live topic of its own today: what exists is spread between
[`stack/stack.md`](../../stack/stack.md) for fragment membership and the Deployment Tool's embedded
kit for the configuration itself. On promote this project needs a topic that says what collects
what, where it lands, and how an operator reaches it — drafted in this section first rather than
written straight into the live tree.

_Empty until Stage I lands._
