# Observability consolidation — handoff

State of the work, what a session picking it up needs before touching anything, and the traps that
cost time the first time round. Stage detail lives in [plan.md](./plan.md); how the parts behave
after each landed stage lives in [overlay.md](./overlay.md).

## Start here

1. Read [plan.md](./plan.md) § Stage status for what is done, then § Decisions taken — those four
   are settled and are not to be reopened without a reason.
2. **The code is committed** as `dd0454b9` on `feature/archived-jobs-stats`, docs included. That
   branch is where the work lives; it is not on `Development`. A machine without it needs the branch
   fetched, and the commit is not yet pushed at the time of writing — check before assuming.
3. Stages A, B and C are written and A and B are verified against a running stack. **Stage C has not
   been deployed**, so its behaviour is unverified — see § Landed but unverified.
4. Next work is Stage D. Nothing in D depends on C being deployed first, but deploying C first keeps
   the two verifications separable.

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

## Landed but unverified

Written, building and tested, but never deployed:

- `ws-router` reporting over OTLP at all — structured logs, placement metrics, a routing span.
- Both duplicate-log paths closed (`ws-router`, `capacity-controller` added to the Alloy drop regex).
- Six websocket placement gauges (`ws.placement.flag`, `ws.placement.target_clients`,
  `ws.placement.client_cutoff`).
- The shared instrument scaffolding refactor across fifteen files — the change with the widest
  blast radius, since every metrics package moved onto it.
- Traefik tracing flags and the `TRACES_SAMPLE_RATE` env key, both inert while the rate is 0.

First deploy should confirm the existing series still appear under unchanged names — `api_*`,
`core_*`, `worker_*`, `ws_*`, `esi_*` — because the scaffolding refactor touched every one of them.

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
strings eip | grep -c 'prometheus.exporter.redis'   # 0 means the binary predates the kit edit
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
