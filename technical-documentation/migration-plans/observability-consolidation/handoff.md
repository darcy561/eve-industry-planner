# Observability consolidation — handoff

State of the work, what a session picking it up needs before touching anything, and the traps that
cost time the first time round. Stage detail lives in [plan.md](./plan.md); how the parts behave
after each landed stage lives in [overlay.md](./overlay.md).

## Start here

1. Read [plan.md](./plan.md) § Stage status for what is done, then § Decisions taken — those four
   are settled and are not to be reopened without a reason.
2. **The code is committed** as `dd0454b9` on `feature/archived-jobs-stats`, docs included. That
   branch is where the work lives; it is not on `Development`. It is pushed — a machine without it
   needs the branch fetched.
3. Stages A, B and C are written and all three are now verified against a running stack.
4. **There is no parallel run.** That decision was taken after Stage C landed and it re-scoped
   Stages D, E and I — read those three before assuming the older "run both" shape.
5. Stage D has landed and is verified: OpenObserve is the only store, and Prometheus and Loki
   receive nothing. They stay deployed until Stage I so the dashboard rebuild can be checked
   against them.
6. Next work is Stage E, the query gate — run it before Stage I deletes anything.

## Where the code is

The project's code spans three areas, all in one commit so the branch builds at every point.

| Area | Files |
|---|---|
| Stack fragments | `docker-stack.yml`, `docker-stack.data.yml`, `docker-stack.obs.yml` |
| Embedded kit | `kit/obs/alloy/config.alloy`, `kit/obs/prometheus/prometheus.yml`, three dashboard definitions, `kit/templates/env/fields.go`, `catalogue/services.go` |
| Services | `shared/logs`, `shared/telemetry` (including new `scope.go` and `wsroutermetrics/`), `shared/nats`, `shared/esiclient`, `core/metrics/common`, `core/scheduler`, `websocket/server`, `worker/asynq`, `ws-router`, `api/middleware` |

`shared/telemetry/scope.go` defines `Must`, `Meter` and `Tracer`, and fifteen files call them, so
they travel together — splitting them across commits leaves the branch unable to build.

The working tree is shared with other sessions and carries unrelated work. Stage paths explicitly;
never `git add -A`. Staging for this commit picked up two files a peer had already staged (a
deletion under `core/commands`), which had to be removed from the index first — worth checking
`git diff --cached --name-only` before every commit here.

## Stage C verification — done

Stage C was deployed and checked against the running stack. What held:

- Application series names survived the fifteen-file instrument scaffolding refactor, the change with
  the widest blast radius. `api_*`, `core_*`, `worker_*` and `ws_*` all still register under their
  existing names. There is **no bare `esi_*` prefix** — the limiter's series are `core_esi_*`, so a
  check written against `esi_*` proves nothing.
- `ws-router` appears in Loki's `compose_service` values, so it reports over OTLP for the first time.
- All three `ws_placement_*` gauges are live: `flag`, `target_clients`, `client_cutoff`.

Still inert by design: Traefik tracing flags and `TRACES_SAMPLE_RATE`, while the rate is 0.

## How a change actually reaches the stack

The observability configuration is **embedded in the `eip` binary** (`//go:embed obs/**` in
`kit/obs.go`), materialised to disk and shipped as a Swarm config object. Stack fragments are read
from disk. The two halves therefore land at different times:

```
edit kit/obs/**            → needs ./scripts/deployment-tool/build-host.sh, then a deploy
edit docker-stack*.yml     → needs a deploy
```

Deploying a kit change without rebuilding the binary applies the stack half only. During Stage B
that removed an exporter container while leaving its replacement absent — Redis had no collector at
all until the next build. Check before deploying:

```bash
grep -a -c 'prometheus.exporter.redis' eip.exe   # 0 means the binary predates the kit edit
```

## Traps found the hard way

**`alloy validate` needs the stack's stability level.** Without `--stability.level=experimental` it
rejects `otelcol.exporter.debug`, which the config uses. Validate against the pinned image:

```bash
docker run --rm -v "$PWD/deployment-tool/internal/kit/obs/alloy/config.alloy":/c.alloy:ro \
  grafana/alloy:v1.19.2 validate --stability.level=experimental /c.alloy
```

**Docker refuses bind mounts from some host paths.** Mounting a probe file from a scratch directory
failed with "mounts denied", and a check that grepped the output for a validation error read the
failure as a pass — every component looked present. Write probe configs inside the container
(`--entrypoint sh` with a heredoc) or mount from under the repo, and assert on exit codes.

**Prometheus instant queries stamp the evaluation time, not the sample time.** Two series both
looked 0.3s old when one had been stale for five minutes. Use `timestamp(<metric>)` when the
question is whether something is still being written.

**Alloy's component health is not a failure signal.** During the `discovery.docker` outage every
component reported healthy while the Docker log scrape collected nothing. Trust the error log and
the data in the store.

**`strings` is not installed in this environment.** The staleness probe below returns 0 with an
error on stderr whether or not the binary is current, which reads as "stale" either way. Use
`grep -a -c '<marker>' eip.exe` instead.

**`build-host.sh` fails on Windows/Git Bash.** It assigns `mktemp`'s output to `TMP`, which is
already the Windows temp-directory variable Go reads for its build work dir, so `go build` tries to
`mkdir` inside a file. Build by invoking `go build` directly with the script's ldflags and
`-trimpath`, then copy over `eip.exe`.

**`loki.source.docker` needs the relabelled target list, not the raw one.** Passing
`discovery.docker.docker.targets` with `relabel_rules` set separately applies `drop` actions to
entry labels, not to the tailing set — every container gets tailed and dropped services still
arrive. Pass `discovery.relabel.docker.output` instead. Loki hid this by deduplicating on label set;
the OTLP path does not, so it surfaced as 60% junk log volume the moment the backend changed.

**Alloy's own reload burst looks like a regression.** After a config change Alloy logs a few hundred
"node exited without error" lines, which arrive unlabelled and can read as a broken drop rule. Wait
for the reload to settle before judging a log-routing change.

**Embedded exporters ignore `prometheus.scrape`'s `job_name`.** Their targets arrive carrying
`job="integrations/<name>"`, and a target label wins, so each needs a `discovery.relabel`. Static
scrape targets have no `job` of their own and take `job_name` directly. The failure is silent:
metrics arrive, dashboards filtering on `job` stay empty.

**Infrastructure scrapes must bypass `prometheus.relabel "otel_collector"`.** It stamps
`job="otel_collector"` on everything crossing it. Traefik is the deliberate exception, pulled back
out by a second ordered rule.

## Defects found in passing, not owned by this project

Three dashboards query metrics nothing emits, all predating this work. They are worth fixing on
their own terms and are described in [plan.md](./plan.md) § Stage H.

Two smaller ones: `capacity-docker-proxy` is missing from the Alloy proxy drop group its three
siblings are in, and `go fix` suggests `interface{}` → `any` in `core/metrics/appconfig`, a package
this project has not otherwise touched.

## Verification commands

Run from the repo root; `eip-obs` is the observability overlay.

```bash
# what has reached the backend, by source (needs OBS_ADMIN_* from .env)
U=$(grep -E '^OBS_ADMIN_USER=' .env | cut -d= -f2-); P=$(grep -E '^OBS_ADMIN_PASSWORD=' .env | cut -d= -f2-)
NOW=$(( $(date +%s) * 1000000 )); AGO=$(( NOW - 60000000 ))
docker run --rm --network eip-obs curlimages/curl:8.11.1 -s -u "$U:$P"   -H 'Content-Type: application/json'   -d "{\"query\":{\"sql\":\"SELECT compose_service, count(*) AS n FROM \\\"default\\\" GROUP BY compose_service ORDER BY n DESC\",\"start_time\":$AGO,\"end_time\":$NOW,\"size\":30}}"   'http://openobserve:5080/api/default/_search'

# which containers Alloy is actually tailing (should exclude the six Go services and four proxies)
cid=$(docker ps --format '{{.ID}} {{.Names}}' | grep 'eip_alloy\.1' | awk '{print $1}')
docker run --rm --network container:$cid curlimages/curl:8.11.1 -s   'http://localhost:12345/api/v0/web/components/loki.source.docker.docker'

# every collection job, with real sample ages
docker run --rm --network eip-obs curlimages/curl:8.11.1 -s --data-urlencode \
  'query=timestamp({__name__=~"redis_up|node_load1|mongodb_up|asynq_queue_size"})' \
  'http://prometheus:9090/api/v1/query'

# what a metric's labels actually are, including per-container identity
docker run --rm --network eip-obs curlimages/curl:8.11.1 -s \
  'http://prometheus:9090/api/v1/query?query=ws_connected_clients'

# which services reach Loki
docker run --rm --network eip-obs curlimages/curl:8.11.1 -s \
  'http://loki:3100/loki/api/v1/label/compose_service/values'

# Alloy's own view (component health, and its error log)
docker run --rm --network container:$(docker ps --format '{{.Names}}' | grep 'eip_alloy\.1') \
  curlimages/curl:8.11.1 -s 'http://localhost:12345/api/v0/web/components'
```
