# Dependency map — measured

Everything here was measured against `services/` at plan time (123 packages, ~65k non-test lines of
service code, ~21k in `shared/`). Read this before starting any phase in [plan.md](./plan.md); the
module boundaries proposed there are derived from these numbers, not chosen by taste.

Regenerate with `go list -deps` from `services/`; the plan's phases assume these shapes still hold.

## What each candidate module would have to contain

Internal (in-module) closure of each candidate root — the packages that must travel with it:

| Candidate root | Internal closure |
|---|---|
| `shared/logs` | none — leaf |
| `shared/models` | `crypto/aesgcm` |
| `shared/telemetry` | `logs`, `container` |
| `shared/core/redis` | `logs`, `core/config`, `core/swarmsecret`, `crypto/aesgcm`, `crypto/aesgcm/keyrings` |
| `shared/core/nats` | the same four, plus `telemetry/natsprop` |
| `shared/mongo` | the same four, plus `models`, `documentschema` |
| `shared/core/documentlock` | 13 packages — `mongo`, `core/nats`, `core/redis`, `core/objectstore`, `stackservices`, `models`, … |

The three client libraries share one floor: **logs, core/config, core/swarmsecret, crypto/aesgcm(+keyrings)**.
That intersection is what `eip/base` is in the plan.

`documentlock` spans four clients and `stackservices`; it is an application component rather than a
library and stays in the services module.

## Fan-in — why `shared` does not split by section

Distinct importers per shared package (services and other shared packages):

| Package | Importers |
|---|---|
| `shared/logs` | 18 |
| `shared/models` | 12 |
| `shared/mongo` | 11 |
| `shared/core/nats` | 10 |
| `shared/core/config` | 8 |
| `shared/container`, `shared/lifecycle` | 7 |
| `shared/telemetry`, `shared/stackservices`, `shared/core/redis`, `shared/orchestrationprobes` | 6 |
| `shared/crypto/entityid` | 6 |

Packages with a **single** consumer, all small: `shared/httpclient` (worker), `shared/archivestats`
(worker), `shared/dependency` (api), `shared/mongo/writers` (api), `shared/telemetry/apimetrics`
(api), `shared/telemetry/workermetrics` (worker), `shared/core/firebaseuserdoc` (worker). These are
candidates to move **into their owning service**, not to become modules.

## `api` is not a leaf

`api/helper/auth` (3.5k lines) is imported by three other services, and `api/helper/sso` by one:

```
core/singleton            -> api/helper/auth
websocket                 -> api/middleware
websocket/server          -> api/helper/auth
worker/tasks/esi          -> api/helper/auth, api/helper/sso
worker/tasks/maintenance  -> api/helper/auth
```

Used from outside api: session upsert/touch/extract, grant updates, session-cleanup options and the
maintenance loop, planner-session id resolution, app-session cookie reads, reauth deadlines,
corporation/alliance stores, and the two ESI SSO token calls. This is cross-service surface living
inside a service — it blocks per-service modules (Track C) and is the natural first tenant of an
`eip/auth` module.

## External dependency spread

Transitive external modules reachable per service: api 95, core 97, worker 95, capacity-controller
75, websocket 65, ws-router 18.

Of ~100 external modules, only **14** are reachable from exactly one service — the Moby set
(capacity-controller), `gorilla/websocket` and `alitto/pond` (websocket), `gocron` and `clockwork`
(core). Every heavy client — mongo-driver, nats, redis, minio, grpc, otel — arrives through
`shared/core` or `shared/logs`, which every service uses.

**Splitting modules does not shrink any binary.** Go already links only reachable code. The gain
this project is after is build-input isolation (Track B), not link-time isolation.

### The one edge that spoils the floor

```
ws-router -> shared/core/nats -> shared/core/config -> shared/crypto/aesgcm/keyrings -> mongo-driver/v2/bson
```

`core/config` reaching into `keyrings` is why a service that touches no database still pulls the
BSON library. If `eip/base` ships with that edge intact, every service's floor carries mongo-driver.
Open decision 2 in [plan.md](./plan.md).

## What actually couples the builds today

None of these is the Go module boundary:

| Cause | Where | Effect |
|---|---|---|
| `COPY . .` with build context `./services` | all six `services/*/Dockerfile` | any file under `services/` changes every service's COPY layer, so every image gets a new digest |
| No path filter on the publish matrix | [publish-containers-public.yml](../../../.github/workflows/publish-containers-public.yml) — `service: [api, websocket, worker, core, frontend, capacity-controller]` | all six build every release regardless of what changed |
| `APP_VERSION` baked via `-ldflags -X …BakedRelease` | every service Dockerfile; also local bake ([bake.go](../../../deployment-tool/internal/images/bake.go)) | identical source produces a different binary whenever the version changes |

The third is **release-scoped** — a version bump rolling every container is expected. The first two
are what make a mid-cycle edit to one shared package rebuild six images.

BuildKit keys a COPY layer on the contents of the files that instruction matches, not on the whole
context. A narrowed COPY is therefore sufficient to give each service an independent cache key —
which is what Track B trades on.

## Residual coupling after Track B

With libraries split and COPY narrowed, each service still copies `services/go.mod` and
`services/go.sum`, which list the union of every dependency the services module reaches. A
dependency bump anywhere still changes those two files and busts all six caches.

Only per-service modules (Track C) remove that. Dependency bumps are far rarer than code edits, so
this is the small remainder rather than the main prize.
