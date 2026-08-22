# Archived jobs statistics — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

Archived jobs currently produce a single flat aggregate per account and item type. This project
replaces that with a statistics surface that answers questions over time and across a corporation:

- Per-account build statistics with monthly rollups and retained snapshots.
- Per-corporation aggregation, derived from the jobs its members archived.
- API endpoints serving rollups, timelines, and snapshot history.
- Dashboard and archive-dialogue views that present them.

## Starting position

An earlier branch, `feature/archived-jobs-redesign` (tip `2b0d06c31`, branched 2026-05-20 from
`1ff1f67df`), implements most of this design: 3 commits, 251 files, ~11,180 insertions.

That branch is **not merged and will not be merged**. It is kept as a design reference only.
Measured against `Development` at `23fb88e52`:

| Blocker | Detail |
|---------|--------|
| Mongo driver | Branch targets `mongo-driver v1.17.9`; Development is on `mongo-driver/v2 v2.8.0`. ~95 branch files import an API that no longer exists. |
| Conflict surface | `git merge-tree` reports **144 conflicting paths**, 57% of the branch's own footprint. |
| Duplicate refactor | Both sides independently flattened `services/shared/shared/*` → `services/shared/*`, producing 10 rename-collision conflicts in files the branch never edited. |
| Deleted trees | `services/shared/core/mongo/` moved to `services/shared/mongo/` on Development; `docs/` was replaced by `technical-documentation/`. The branch's 19 `docs/` files would resurrect a deleted tree. |
| Retired code | The branch modifies per-type market price tests that Development removed in `8daa88e09`. |

Development has landed 29 commits since the branch point, including the Swarm hard cutover, the
Mongo driver v2 rewrite, document-lock work, an auth rework, and the region market orders change.

The branch also predates the project's documentation and technical rules, which arrived with the
Swarm cutover (`557c18946`) — its tree contains no `technical-documentation/` at all. Carried-forward
code is therefore reviewed against the current bars rather than assumed to meet them.

### What the branch is worth

The design is sound and driver-agnostic: aggregation pipeline shapes, rollup bucketing, rebuild-queue
semantics, and the account/corporation split all survive the driver change. The code around them
does not. Treat the branch as a specification.

## Salvage decisions

| Disposition | Surface |
|-------------|---------|
| **Carry forward, review before use** | Frontend delta — 11 new components/modules plus 10 files still byte-identical to the merge base. Leaf packages with no Mongo dependency: `archivestats/`, `core/moneyutil/`, `core/jobid/corpinference/`, `core/jobid/linkedjobcorp/`, `core/sealedfields/` (+ `entityids/`). |
| **Reimplement against driver v2** | `worker/tasks/archivedjobs/` including its `helpers/` package, `api/v1endpoints/statistics/` endpoints, `core/scheduler/archivedjobs/publish_fanout.go`, and all Mongo query code. |
| **Relocate** | The branch's `shared/core/mongo/indexing/` package. Index ownership sits in the Deployment Tool (`internal/dataplane/mongo/index_specs.go`, applied by `eip ensure-mongo`); Development has no index-creation code in `services/`. New collections get `IndexSpec` entries there rather than a services-side indexing package called from `main.go`. |
| **Drop** | `services/shared/shared/*` renames (already landed on Development), all 19 `docs/` files (content re-targeted into this project folder), `go.mod` / `go.sum` changes, `frontend/package-lock.json` (regenerate). |
| **Separate decision** | The branch's `core/crypto/authzhmac/` package implements [entity-id-encryption/plan.md](../entity-id-encryption/plan.md), not this project. The `crypto/aesgcm_keyring.go` → `crypto/aesgcm/keyring.go` nesting is orthogonal to archived jobs and collides with recent auth work; land it separately if still wanted. |

## Phases

Phase 1 is this folder. Later stages run only after that gate.

### Stage A — Data model and Mongo layer

Models for archived job statistics, corporation statistics, and snapshot documents; the Mongo
queries, indexes, and rebuild-queue collections they need. Gates every later stage.

Wire compatibility: new persisted document shapes are additive; existing `BuildStatsRow` documents
stay readable until Stage B replaces their producer.

### Stage B — Account statistics pipeline

Worker tasks that aggregate an account's archived jobs into rollup buckets and snapshots, with the
rebuild queue that holds accounts needing recomputation. Replaces the current flat per-account
aggregate.

### Stage C — Corporation statistics pipeline

Corporation-level aggregation over member jobs, its own rebuild queue and pruning. Separable from
Stage B and deferred without blocking the rest — decided at Stage B close.

#### Stage C is deferred

Decided at Stage B close. **The blocker is a missing producer, not effort.**

More of this stage exists than the original plan assumed:

| Already built | Where |
|---------------|-------|
| The attribution rule — one distinct corporation across a job's linked industry jobs resolves, two or more resolve to none | `shared/archivestats.InferJobCorp`, with tests |
| The persisted shapes | `models.CorpBuildStatsRow`, `CorpRollupMonthlyBucket`, `CorpRollupOwnedLane` |
| The org-scoped delivery path — routing, tenant key, scope matching, payload stripping | Traced end to end in [overlay.md](./overlay.md) § Stage C |
| The routing field itself | `models.MetaData.CorporationRef` → `_meta.corporationRef` |

What is missing is anything that **writes** `_meta.corporationRef`. No write path in `services/`
assigns it, so every stored job carries it empty. Building the aggregation now would produce a
pipeline that reads nothing, with query and index shapes chosen against no data — the same failure
the partial indexes were held back to avoid.

Revisit when a producer exists, which in practice means corporation documents exist. The contract
such a document must satisfy is already written down in [overlay.md](./overlay.md) § Stage C.

Still to land with the stage when it starts: the corporation collections, `QueueCorpRebuild` /
`ListQueuedCorpRefs`, the corp `_id` builders, a `CollectionGroup` entry (all four existing groups
are account scoped, so no corporation collection is watched), and index specs in the Deployment
Tool.

These are **new** collections, so they are named to the convention in
[collection-naming](../collection-naming/plan.md) from the start rather than renamed later:
`corporation_archived_jobs`, `corporation_production_totals`, `corporation_timeline_months`,
`corporation_stats_rebuild_queue`. Corporation-scoped data is the case the `<scope>_` prefix exists
for, and it is the first collection set that will not be account scoped.

### Stage D — Statistics API

Endpoints for monthly timelines and lifetime totals, per account and per corporation. Additive to
the existing statistics router; the current build-stats endpoint keeps its contract until the
frontend no longer calls it.

`/api/v1/statistics` and `/api/v1/statistics/` are already mounted to the package `Router` in
`apiServer.go`'s private route table, so new sub-paths need no route-table or wiring change. The
`GetAPIStatistics` metrics bag is shared by every handler in the package — new endpoints reuse it
and distinguish themselves by the `reason` label rather than adding instruments.

#### Scope in the path, filters in the query

The account is resolved by auth middleware from the session cookie and is never read from the
request, so it does not appear in a route. Corporation reads cannot follow that rule — a user may
belong to several — so the scope has to be nameable:

```
/api/v1/statistics/account/{view}          scope implicit (the session's account)
/api/v1/statistics/corporation/{corpRef}/{view}
```

with the range and `typeID` as query parameters. Adding corporation views then adds a segment rather
than reshaping account routes, and the account and corporation forms of a view stay visibly the same
shape.

Two views:

| View | Returns |
|------|---------|
| `timeline` | monthly figures over a range, one entry per calendar month and item type. `from` / `to` as `YYYY-MM`, `typeID` optional |
| `totals` | one all-time aggregate per item type — what `build-stats` serves today |

**`timeline` is the only range query.** An earlier sketch had `rollups` for the buckets and
`timeline` for a chart series; they read the same documents over the same filter and differ only in
serialisation, so a second endpoint would have bought a second index and a second cache key for one
response shape. The consumer reshapes.

**The range defaults to the trailing 3 months** when `from` / `to` are absent, so a caller that
omits them cannot accidentally request an account's whole history. Bound the maximum span too, and
reject rather than silently truncate — a truncated range looks like missing data to a chart.

The alternative — `?scope=corp&corpRef=…` on flat routes — was rejected because it makes the
authorization boundary a query parameter, which is exactly the input a caller controls.

`GET /api/v1/statistics/build-stats` keeps its current flat path regardless; it is the one endpoint
with live SPA callers, and it retires in Stage E rather than moving.

#### Corporation authorization has an answer

Sessions already carry the corporation refs they may see:
`auth.ExtractSessionGrants` returns `Grants.CorporationRefs`, and the websocket dispatch path
already authorizes org-scoped delivery by matching against exactly that list.

So a corporation endpoint compares `{corpRef}` against the session's granted refs and returns 403
when absent. Refs are compared as refs; an id is converted to a ref first, never the reverse. This
removes what would otherwise be an open question for Stage C.

#### Naming

**`rollup` goes.** It is the internal aggregation verb and reads as jargon on a URL and in a
response body. The wire name is `timeline`; internal names follow it rather than keeping a second
vocabulary, so the same thing is not called a bucket in Mongo, a rollup in the worker and a timeline
on the wire.

Rename with Stage D, before the first endpoint ships — the name otherwise lands in the route, the
JSON, the React Query keys and the `_id` builders at once, and each extra copy makes it harder to
undo. Surfaces carrying `rollup` today:

| Surface | Today |
|---------|-------|
| Collection | `user_rollup_buckets` (`names.go`, `store.go`) → `account_timeline_months`, per [collection-naming](../collection-naming/plan.md) |
| Model | `UserRollupMonthlyBucket`, `CorpRollupMonthlyBucket`, `BuildStatsRollupTotals`, `CorpRollupOwnedLane` |
| `_id` builder | `UserRollupMonthlyDocumentID` |
| Transformation | `archivestats/rollup_buckets.go`, `AccumulateAccountBuckets`, `AccountBuckets` |
| Mongo handle / helpers | `UserRollupBuckets`, `PruneAccountRollupBuckets` |

The collection moves with them — see [Collection renames](#collection-renames-are-the-expensive-part)
for why `user_rollup_buckets` is cheap to rename and `build_stats` is not.

#### `build-stats` becomes `totals`

`build-stats` says almost nothing — every view here is a build statistic. What the endpoint serves
is **one all-time aggregate per item type**: `BuildStatsRow`, running totals with a `dataSnapshots`
history, keyed by account and `typeID`. The distinction that matters is lifetime totals against a
range of months, so the view is `totals` and internal names say **production totals** — clearer
about what is being totalled than "build stats", which reads as a category rather than a measure.

Not a free rename: `GET /api/v1/statistics/build-stats` is the one statistics endpoint with live SPA
callers — three read sites plus its React Query hooks — and `dataSnapshots` is read directly. The
endpoint keeps its contract until Stage E moves the frontend off it, so the wire rename lands with
that move rather than as a separate break.

#### Collection renames are the expensive part

Renaming a Go symbol is a refactor. Renaming a **collection** moves live documents and crosses a
module boundary, so the two cases differ sharply:

| Collection | Holds | Rename cost |
|------------|-------|-------------|
| `user_rollup_buckets` | Buckets this project created | **Low.** No other subsystem references it. The wholesale rebuild repopulates it from archived jobs, so a rename can drop the old collection rather than migrate it |
| `build_stats` | The aggregate the SPA reads today | **High — do not rename with Stage D** |

`build_stats` is not contained. Beyond `names.go` and `store.go` it appears in the changestream
`archive_and_stats` collection group and in the websocket subscribe-auth allow-list, so the name is
part of a **live client-facing subscription surface**, not just storage. Renaming it would break
realtime subscriptions for a collection the SPA still reads, to rename a document set that Stage E
retires anyway. Leave it; if it moves at all, it moves after the frontend no longer reads it.

Both names are also duplicated across a module boundary: `services/shared/mongo/names.go` holds the
constant, while `deployment-tool/internal/dataplane/mongo/index_specs.go` repeats the collection as
a **bare string**, because `deployment-tool` cannot import `services`. A rename that misses the
Deployment Tool leaves `eip ensure-mongo` building indexes on a collection nothing reads — silently,
since creating an index on an absent collection is not an error. The same two-module pinning the
partial filters use applies here, and index specs must move in the same change as the constant.

### Stage E — Frontend

Dashboard overview, archive-dialogue breakdown, and the React Query hooks and endpoint modules that
feed them. Mostly carried from the branch; applies cleanly against today's components apart from
`ThemeContext.jsx`, which drifted and needs a hand-merge.

## Go modernization in scope

Per the planning gate, `go fix -diff` was run against the packages this project will touch
(`worker/tasks/archivedjobs/…`, `core/scheduler/archivedjobs/…`, `api/v1endpoints/statistics/…`,
`shared/models/…`, `shared/mongo/…`). One suggestion was reported, in
`shared/models/group_template.go`. Land it with Stage A rather than as a separate sweep. No other
in-scope package needs modernization before the work starts.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| A — data model and Mongo layer | Complete for the account scope — entity refs on job documents, statistics models, Mongo layer and index specs landed. Corp scope held for C; partial indexes land with D |
| B — account statistics pipeline | **Complete** — transformation, worker rebuild, queue drain, its task and asynq handler, the hourly schedule, and the archived-jobs producer are all landed. Queue → publish → drain runs end to end, and the claim protocol, revoke, prune and write-then-remove ordering are pinned by passing live tests. The worker's end-to-end composition of those helpers has no live test yet (see Open questions) |
| C — corporation statistics pipeline | **Deferred** at Stage B close — blocked on a producer for `_meta.corporationRef`, not on effort. See § Stage C is deferred |
| D — statistics API | Not started |
| E — frontend | Not started |

## Done when

- Account and corporation statistics are produced by the new pipeline, with rollups and snapshots
  persisted and served.
- The frontend reads the new endpoints and the previous flat aggregate has no remaining callers.
- Tests ship with each stage, not as a later wave.
- Overlays in this folder describe the landed behaviour, ready to promote into live SoT.

## Handoff status

**Stage B is committed on `feature/archived-jobs-stats`**, apart from the schedule. The
transformation, the worker rebuild, the drain, its task and asynq handler, and the archived-jobs
producer are all reachable from a clone.

`services` builds, vets and tests clean, and `go fix -diff` reports nothing on any package this
stage touched. The one outstanding `go fix` suggestion in scope is `shared/tasks/queue_scale.go`
(a `maps` import), which predates this work and sits outside its touch surface — it was left rather
than swept in.

**Stage B is closed.** The account pipeline runs end to end: `PUT /archived-jobs` queues an account,
`ScheduleDrainAccountStatsRebuildQueue` publishes hourly at minute 30, the worker drains, and the
claim protocol decides what stays queued. Behaviour → [overlay.md](./overlay.md) § Stage B.

**Start here:** two things, in either order.

1. **Stage D.** It depends only on the Stage A account models, so nothing blocks it, and it is what
   unblocks E. Stage C is deferred (below), which does not hold D up.
2. **Watch the first live drains.** Revoke, prune and write-then-remove ordering now have live
   coverage and pass, so the individual Mongo helpers are no longer taken on trust. What the cron
   still exercises untested is the worker's composition of them end to end — see Open question 1.

Stage D depends on the Stage A models, not on C, so it can start regardless.

### Open questions

1. **Live coverage.** Narrowed to one gap; the Mongo helpers themselves are covered.

   **Confirmed against stack Mongo**, all passing:

   | Test | Pins |
   |------|------|
   | `live_rebuild_queue_test.go` | The claim protocol — `queuedAt` survives a re-queue while `claim` increments, a stale claim clears nothing, the current claim clears the account |
   | `live_account_rebuild_test.go` § revokeAndPrune | Keep-list rows survive, absent ones are revoked not deleted, produced months stay and empty ones are pruned |
   | `live_account_rebuild_test.go` § emptyKeepListClearsTheAccount | An empty keep-list drops the `$nin` and empties the account, rather than leaving it untouched |
   | `live_account_rebuild_test.go` § writesBeforeRemoving | Both outgoing and incoming rows are readable between the write and removal halves, so a mid-rebuild reader sees no gap |

   **Still open:** no live test drives `RebuildAccountStatistics` end to end over seeded archived
   jobs. The helpers are pinned individually, but the worker's own composition of them — load,
   build rows, upsert, revoke, prune — is exercised only by the hourly cron against real data.
   Closing this needs full `models.Job` fixtures, which is why it was not done with the rest.

   **The revoke idempotency assertion is deliberately awkward.** It passes a *later* timestamp on
   the second pass, because `$set` writes `revokedAt` as well as `revoked`: with the same
   timestamp, re-matching an already-revoked row changes nothing, Mongo reports no modification,
   and the assertion holds even with the `revoked: {$ne: true}` guard deleted. That weaker version
   was written first and confirmed worthless by deleting the guard and watching the test still
   pass. Do not simplify it back.

   **Running a live test needs a container on the overlay.** Mongo publishes no host port and the
   app credentials are Swarm secrets, so `go test` from a host shell cannot reach it. Cross-compile
   the package (`GOOS=linux go test -c ./shared/mongo/`), build it into a scratch image, and run it
   as a one-off service on `eip-core` with `MONGO_USERNAME` / `MONGO_PASSWORD` mounted from the
   stack secrets and `MONGO_HOST=mongo`, `MONGO_PORT=27017`, `EIP_MONGO_PARITY_LIVE=1` in the
   environment. Publishing 27017 to the host in dev would make this ordinary; that is a stack
   decision, not one this project should take unilaterally.
2. **Unarchiving.** `feature/archived-jobs-redesign` had a separate `removal.go` path rather than
   relying on a wholesale rebuild to notice a job had gone. Revoke-on-rebuild covers it, but only
   when something queues the account — decide whether unarchive needs its own producer.
3. **Keep-list size.** Revoke and prune pass every surviving id in a `$nin`. Fine at hundreds; an
   account with tens of thousands of archived jobs would want a generation counter on the rows
   instead.
4. ~~**Producer without consumer.**~~ Closed: the hourly drain schedule landed, so the queue has a
   consumer and the first pass picks up whatever accumulated.

### Decisions already made, so they are not re-litigated

- Rebuilds are **wholesale per account**, not incremental. The queue stores `{accountID, claim}`
  and cannot express which jobs changed, and wholesale is idempotent, which the claim protocol
  depends on.
- Entity ids reach `archivestats` as **refs**, never raw. Corporation inference works on refs
  because raw ids do not survive a write.
- The drain cron runs **hourly at minute 30**, offset from the build stats fan-out on minute 0
  because both read archived-jobs data and contending every hour buys nothing. It publishes
  **unconditionally** rather than reading the queue first: that read would duplicate the worker's
  own and give the scheduler a Mongo dependency to fail on, to save one message an hour.
- The drain is **one task over the whole queue**, not one task per account, even though the
  neighbouring `ProcessArchivedBuildStats` fans out per account. The claim protocol that keeps a
  mid-rebuild re-queue from being cleared lives in the drain; per-account fan-out would move that
  logic into a path the queue's semantics are not tested against, to buy parallelism a queue of this
  size does not need. Revisit if a pass approaches its 15 minute timeout.
- The B1 / B2 / B3 split is conversational shorthand, not a documented structure: B1 pure
  transformation, B2 worker tasks, B3 scheduling and producers. This plan defines Stage B as one
  stage.

**Recommended pickup order:** A → B → D → E. A and B are done; C is deferred until a producer for
`_meta.corporationRef` exists. D depends on the Stage A models; E depends on D's response shapes.

**Reference material:** `feature/archived-jobs-redesign` on origin. Read it for pipeline shapes and
bucketing logic; do not merge or cherry-pick its Mongo-touching commits.
