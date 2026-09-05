# Service library modules — plan

**Status:** Phase 1 (docs) — complete; no track work started
**Code in scope:** [`services/`](../../../services/) (all areas), the six `services/*/Dockerfile`, [`.github/workflows/`](../../../.github/workflows/) publish + test workflows
**Live SoT (until promote):** [backend/contents.md](../../backend/contents.md), [stack/stack.md](../../stack/stack.md), [technical-rules.md](../../technical-rules.md) § Package / module layout and refactors

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

Measured import graph, closures, and build-coupling facts: [dependency-map.md](./dependency-map.md).
Read it before starting any phase.

## Goals

1. Split the platform packages under `services/shared/` into a small set of **local** Go modules —
   `eip/base` plus one per infrastructure client — so each module's `go.mod` declares its own
   dependency closure.
2. Use those declared closures to build each service image from **only the source it needs**, so a
   change to one library stops rebuilding and rolling services that do not import it.
3. Keep everything moving together in one commit: no tags, no publishing, no version skew.

## Non-goals (this project)

- **Independent versioning.** The modules are wired with local `replace` directives, exactly as
  [`testing/`](../../../testing/) is today. No tags, no module proxy, no per-library release step,
  and no two services on different versions of the same library. A change to a library and its call
  sites lands in one commit.
- Per-service modules (`api`, `worker`, …) — deferred, see Track C.
- Moving `shared/core/documentlock` out of the services module; its closure spans four clients
  ([dependency-map.md](./dependency-map.md)).
- The `go fix` backlog — owned by [go-127-adoption](../go-127-adoption/plan.md) § Track C.
- Any change to HTTP, websocket, NATS, asynq, Redis or Mongo document shapes.

## Target layout

```
services/
  lib/
    base/        logs, container, core/config, core/swarmsecret, crypto/aesgcm(+keyrings)
    models/      models, documentschema                → base
    mongo/       shared/mongo                          → base, models
    redis/       core/redis, core/redis/lease          → base
    nats/        core/nats, telemetry/natsprop         → base
    telemetry/   telemetry                             → base
  api/ core/ worker/ websocket/ ws-router/ capacity-controller/   (one module, unchanged)
```

Libraries sit **under `services/`** so the Docker build context stays `./services`. Moving them to
the repo root beside `testing/` would force the context to `.`, which drags the frontend tree into
every service's cache key — the exact coupling this project removes. `testing/` stays where it is.

Each library's `go.mod` carries `replace` directives for its own dependencies. Docker builds do not
see a `go.work`, so `replace` has to be authoritative; a root `go.work` on top is an ergonomics
question only (open decision 3).

The `eip/base` composition above is **the measured intersection** of what the client libraries need,
not a design choice — see open decision 1 for how it may be split further later.

## Track A — Carve the libraries

```mermaid
flowchart LR
  A1["A1 break config→keyrings edge"]
  A2["A2 eip/base"]
  A3["A3 eip/models, eip/mongo,<br/>eip/redis, eip/nats, eip/telemetry"]
  A1 --> A2 --> A3
```

### Phase A1 — Break the `core/config` → `keyrings` edge

`shared/core/config` imports `crypto/aesgcm/keyrings`, which imports `mongo-driver/v2/bson`. Left
alone, `eip/base` ships the BSON library to every service including ws-router, which touches no
database. Resolve before `eip/base` exists, since it decides that module's dependency floor.

Done when: `go list -deps ./ws-router` no longer reaches `mongo-driver`, or open decision 2 records
that the edge is deliberately kept and why.

### Phase A2 — `eip/base`

Create `services/lib/base/` holding the measured floor, with its own `go.mod`, and rewrite every
importer. Mechanical: new module, `replace` wiring in `services/go.mod`, import-path rewrite,
`go build ./...` and `go test ./...` green on both modules.

`shared/logs` is a leaf with 18 importers and no internal dependencies — carve it first inside this
phase as the proof that the module mechanics, CI, and Docker wiring work before the rest follows.

Done when: `services/lib/base` builds and tests standalone, nothing under `services/shared/` remains
that duplicates it, and no forwarding shim is left at the old import paths
([technical-rules.md](../../technical-rules.md) § Package / module layout).

### Phase A3 — The client libraries

One slice per module, in order: `eip/models`, `eip/mongo`, `eip/redis`, `eip/nats`, `eip/telemetry`.
Each slice moves the packages, rewrites importers, and finishes its cutover within that slice.

Naming: the packages currently sit under `shared/core/` (`core/nats`, `core/redis`, …). Whether the
move also flattens that prefix is open decision 5 — decide it before A3 starts, because it changes
every rewritten import path.

Done when: each module builds and tests standalone, and `services/shared/` retains only the packages
this project deliberately leaves behind (`documentlock`, `stackservices`, `lifecycle`,
`orchestrationprobes`, `wsplacement`, `crypto/entityid`, `protectedfields`, `jobidentity`,
`archiveimport`, `archivestats`, `migration`, and the single-consumer packages pending open
decision 4).

## Track B — Build from the declared closure

This is where the payoff lands; Track A alone changes nothing about how images build.

### Phase B1 — Generate the per-service source closure

A script that, for each service, resolves its module closure from `go list -deps` and emits the
directory list. Both B2 and B3 consume that output, so the COPY lists and CI filters cannot drift
from the import graph.

### Phase B2 — Narrow the Dockerfiles

Replace `COPY . .` in all six `services/*/Dockerfile` with the service's closure. Verify by building
twice with an unrelated library edited in between and confirming the COPY layer is cached and the
image digest is unchanged.

### Phase B3 — Filter the publish matrix

Add per-service path filters to
[publish-containers-public.yml](../../../.github/workflows/publish-containers-public.yml) (and the
prerelease workflow) so a service is only rebuilt when its own closure changed. Keep a stable
required check that tolerates skipped services, matching the pattern already in
[test.yml](../../../.github/workflows/test.yml).

Also add per-module jobs to the test workflow, alongside the existing `services` and
`shared testing library` jobs.

Done when: editing a package inside one library rebuilds only the services whose closure contains
it, verified on a real branch, and the roll-everything case is limited to version bumps.

## Track C — Per-service modules (deferred)

Not started here. Recorded so the shape is known:

The remaining coupling after Track B is `services/go.mod` / `go.sum`, copied by every service
([dependency-map.md](./dependency-map.md) § Residual coupling). Removing it means one module per
service, which first requires `api/helper/auth` and `api/helper/sso` to leave the api service — the
natural landing is an `eip/auth` library from Track A's pattern. Revisit once Track B is measured.

## Open decisions

| # | Decision | Needed by |
|---|----------|-----------|
| 1 | **How `eip/base` splits.** It starts as the measured floor (logs, container, config, swarmsecret, aesgcm+keyrings). Whether it later becomes separate `eip/logs`, `eip/config`, `eip/crypto` modules, or stays one, is deliberately left open — revisit after Track B shows how often base actually changes and who it rolls. | After Track B |
| 2 | Does `shared/core/config` keep its `crypto/aesgcm/keyrings` dependency (and with it, BSON in every service's floor), or is the edge broken? | Phase A1 |
| 3 | Is a root `go.work` committed for editor and `go test ./...` ergonomics, or do the `replace` directives stand alone? | Phase A2 |
| 4 | Do the single-consumer shared packages (`httpclient`, `dependency`, `archivestats`, `mongo/writers`, the two metrics packages, `core/firebaseuserdoc`) move into their owning service as part of this, or stay put? | Phase A3 |
| 5 | Does the move flatten the `shared/core/` prefix (`core/nats` → `nats`), or preserve current path shapes under the new modules? | Phase A3 |

## Sequencing against `go fix`

`go fix -diff ./...` on `services/` currently reports **47 files** — `interface{}` → `any`,
`strings.Cut`, `errors.AsType`, gofmt alignment, plus six `omitempty` → `omitzero` suggestions that
carry a behaviour change and are not automatic. That backlog belongs to
[go-127-adoption](../go-127-adoption/plan.md) § Track C.

Track A rewrites import paths across nearly every file in the module, so the two will conflict on
touch. Land the `go fix` slice for an area **before** that area's packages move, so each review reads
clean. Re-run `go fix -diff` on the packages each slice edits, scoped to that slice only.

## Wire compatibility

**Neutral throughout.** Import paths are internal to the repo; no HTTP contract, websocket envelope,
NATS subject, asynq payload, Redis key, or persisted document shape changes in any phase. No operator
env key, Swarm label, or `eip` verb changes.

Track B changes **which** images get a new digest on a given commit, not what the images contain or
how they are deployed. The first build after B2 rebuilds everything once, as the COPY instructions
themselves changed.

## Done-when (project)

Track A and Track B closed, open decisions 2–5 recorded with their outcomes in
[overlay.md](./overlay.md), decision 1 either resolved or explicitly carried forward, Track C either
started as its own project or declined, and go-ahead given to promote the landed layout and build
behaviour into live SoT.
