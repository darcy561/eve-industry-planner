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
Stage B and may be deferred without blocking the rest — decide at Stage B close.

### Stage D — Statistics API

Endpoints for rollups, timelines, and snapshot history, per account and per corporation. Additive
to the existing statistics router; the current build-stats endpoint keeps its contract until the
frontend no longer calls it.

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
| B — account statistics pipeline | **Written, not committed** — transformation, worker rebuild, queue drain and the archived-jobs producer are in the working tree. The drain has no schedule, so nothing consumes the queue yet |
| C — corporation statistics pipeline | Not started, may be deferred |
| D — statistics API | Not started |
| E — frontend | Not started |

## Done when

- Account and corporation statistics are produced by the new pipeline, with rollups and snapshots
  persisted and served.
- The frontend reads the new endpoints and the previous flat aggregate has no remaining callers.
- Tests ship with each stage, not as a later wave.
- Overlays in this folder describe the landed behaviour, ready to promote into live SoT.

## Handoff status

**The Stage B work is uncommitted.** It exists only in the working tree of the machine it was
written on. To pick it up anywhere else it has to be committed and pushed first — nothing below is
reachable from a clone until that happens.

Uncommitted paths:

```
 M services/api/v1endpoints/archivedjobs/putHandler.go   queue the account after a write
 M services/shared/models/job.go                         JobMetaData.RetainedStockBuild
 M services/shared/mongo/build_stats.go                  load / revoke / prune helpers
?? services/shared/archivestats/                         the pure transformation + tests
?? services/worker/tasks/archivedjobs/rebuild_account.go
?? services/worker/tasks/archivedjobs/drain_rebuild_queue.go
?? services/worker/tasks/archivedjobs/rebuild_account_test.go
```

`services` and `deployment-tool` both build, vet and test clean with these applied, and
`go fix -diff` is empty on every package they touch.

**Start here:** finish Stage B by wiring the drain — a `Task` entry in `shared/tasks/types.go`, a
scheduler registration in `core/scheduler/archivedjobs/` modelled on
`ScheduleProcessArchivedBuildStats`, a worker handler routing that subject to
`DrainAccountRebuildQueue`, and a cadence. Behaviour → [overlay.md](./overlay.md) § Stage B.

### Open questions

1. **Live coverage.** The Mongo-facing rebuild behaviour — revoke on removal, bucket pruning,
   write-then-remove ordering — has only nil-handle and argument tests. It needs a live test in the
   `EIP_MONGO_PARITY_LIVE` style before running against real data. The rebuild-queue live test in
   `shared/mongo/live_rebuild_queue_test.go` is written but **has never been executed**: Mongo sits
   on the Swarm overlay and was not reachable from the machine it was written on.
2. **Unarchiving.** `feature/archived-jobs-redesign` had a separate `removal.go` path rather than
   relying on a wholesale rebuild to notice a job had gone. Revoke-on-rebuild covers it, but only
   when something queues the account — decide whether unarchive needs its own producer.
3. **Keep-list size.** Revoke and prune pass every surviving id in a `$nin`. Fine at hundreds; an
   account with tens of thousands of archived jobs would want a generation counter on the rows
   instead.
4. **Producer without consumer.** Merging as-is fills the queue with nothing draining it. Harmless
   and self-correcting, but a choice rather than an accident.

### Decisions already made, so they are not re-litigated

- Rebuilds are **wholesale per account**, not incremental. The queue stores `{accountID, claim}`
  and cannot express which jobs changed, and wholesale is idempotent, which the claim protocol
  depends on.
- Entity ids reach `archivestats` as **refs**, never raw. Corporation inference works on refs
  because raw ids do not survive a write.
- The B1 / B2 / B3 split is conversational shorthand, not a documented structure: B1 pure
  transformation, B2 worker tasks, B3 scheduling and producers. This plan defines Stage B as one
  stage.

**Recommended pickup order:** A → B → D → E, with C either after B or deferred. D depends on the
Stage A models; E depends on D's response shapes.

**Reference material:** `feature/archived-jobs-redesign` on origin. Read it for pipeline shapes and
bucketing logic; do not merge or cherry-pick its Mongo-touching commits.
