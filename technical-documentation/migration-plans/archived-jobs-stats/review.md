# Archived jobs statistics — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

## Summary

The project replaced one flat aggregate per account and item with statistics that answer over time:
per-job rows, monthly buckets, lifetime totals, an owner-shaped API, an archive that can be listed and
restored, and a page over all of it. **The code is finished and the plan's status table is right about
every stage it lists.** What stands between here and closing is not implementation.

Two things need attention:

1. **The plan describes a release that has since changed shape.** § Operational steps owed lists eight
   0.9.0 steps and a separate `tasks backfillMetaOwner`; `prepare_release.go` now holds 26 steps in one
   release, the owner stamp is one of them, and the statistics copy is the general backup.
2. **One landed stage is missing from the status table, and several names in the plan no longer exist
   in the code.** Stage K is built and promoted but has no status row; `shared/archivestats` is
   `shared/statistics`.

## Verified status

Paths are under `services/` unless they begin `frontend/`, `deployment-tool/` or `testing/`.

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---------------|-----------|----------------|----------|---------|
| Phase 1 — project docs | Complete | Folder, `contents.md`, plan with rules block, overlay | this folder | confirmed |
| A — data model and Mongo layer | Complete for the account scope; "corp scope held for C; partial indexes land with D" | Models, the Mongo layer and five index specs are in, all keyed on an owner rather than an account | `shared/models/archived_job_stats.go`, `production_totals.go`, `production_totals_timeline.go`; `shared/mongo/statistics_rows.go`, `statistics_timeline.go`, `statistics_production_totals.go`; `deployment-tool/internal/dataplane/mongo/index_specs.go` (`aajs_owner_*`, `atm_owner_*`, `apt_owner_typeID_1`) | partly — landed, but the row still speaks of a corporation scope held back, which the Stage C row says was never needed |
| B — account statistics pipeline | Complete | Reduction, rebuild, dispatch, handlers and schedule all present and wired | `shared/statistics/` (`RowFromFigures`, `ContributionOf`); `worker/tasks/archivedjobs/rebuild_statistics.go` (`RebuildStatistics`), `dispatch_rebuilds.go`; `worker/asynq/handlers.go`; `core/scheduler/jobs.go` (`*/2`) | confirmed |
| C — corporation statistics pipeline | Never needed, and not built | No corporation collections or pipeline exist. The route already serves any owner the session's membership reaches | `api/v1endpoints/statistics/owner.go` (`requireOwnedBySession`); `shared/mongo/planner_get.go` (`AccountMayReach`) | confirmed |
| D — statistics API | Complete for the account scope, "under `/api/v1/statistics/account/`" | Three views served under an owner handle | `api/v1endpoints/statistics/router.go` (`timeline`, `timeline/items`, `totals`), `getTotals.go`, `getTimeline.go`, `getTimelineItems.go`, `recalculation.go` | partly — landed and wider than stated: the path segment is `{kind}:{id}`, not the literal `account` |
| E — frontend | Complete for the account scope | SPA reads all three views through the active planner's owner handle | `frontend/src/Functions/Endpoints/Private/statisticsOwner.js`, `statisticsTotals.js`, `statisticsTimeline.js`; `frontend/src/Components/Dialogues/Blueprint Archive/mapApiStatsToArchiveBreakdown.js` | confirmed |
| F — archived jobs read API | Complete | Paged list and single read; shared query parsing | `api/v1endpoints/archivedjobs/getList.go`, `getJob.go`, `router.go`; `api/helper/queryparams.go` | confirmed |
| G — restore | Complete | Three restore routes over one server-side sequence, with a live test | `api/v1endpoints/archivedjobs/restore.go`, `restoreHandlers.go`, `live_restore_test.go`, `restorelock_test.go` | confirmed |
| H — archived jobs page | Complete for the account scope; three tabs | `/archived-jobs` with Statistics, Item Statistics and Archived Jobs tabs; shared harness; integration suites | `frontend/src/routes/_protected/archived-jobs.jsx`; `frontend/src/Components/Archived Jobs/ArchivedJobsPage.jsx`; `frontend/src/Components/Archive Statistics/`; `frontend/src/tests/archiveHarness.jsx` | confirmed |
| I — one owner for group derivation | Complete | Backend derivation and a shared corpus | `shared/models/group_shape.go` (`RebuildFrom`, `AddJobs`); `testing/fixtures/group-derivation/cases.json` | confirmed |
| J — incremental statistics and the build history panel | Complete bar one placement decision | Delta, claim, per-owner dispatch, rota, marks, message vocabulary and the recalculation state are all in | `shared/models/archived_job_stats.go` (`ContributedAt`, `AwaitsContribution`, `AwaitsRemoval`); `shared/mongo/statistics_apply_delta.go`, `statistics_rebuild_queue.go` (`StatsWorkDelta`, `StatsWorkRebuild`, `RecalculationState`), `statistics_reconcile_rota.go`; `worker/tasks/archivedjobs/apply_delta_task.go`, `reconcile_statistics.go`, `notify.go`; `core/scheduler/jobs.go` (`*/15`); `shared/nats/envelope.go` (`Subtype`); `testing/fixtures/realtime-messages/kinds.json`; `frontend/src/Components/Archive Statistics/RecalculationNotice.jsx` | confirmed |
| K — filing a job's figures by hand | **No status row.** The plan body records it under "What landed" | Built on both sides, tested, and in the live API doc | `api/v1endpoints/archivedjobs/filing.go` (`FileArchivedJobMonthsHandler`), `live_filing_test.go`; `shared/models/job.go` (`FiledCostMonth`, `FiledSalesMonth`); `shared/statistics/archived_job_row.go` (`costMonthFor`, `filedSalesMonth`); `frontend/src/Components/Archived Jobs/FileMonthsDialogue.jsx`; `technical-documentation/backend/api/archive.md` | understated |
| Owner block — owed to shared planners | All four items done, ownership handed over | One owner vocabulary, one field path, the stamp as a release step | `shared/models/owner.go`; `shared/mongo/scope.go` (`FieldMetaOwner`, `FieldMetaOwnerKind`, `FieldMetaOwnerID`); `core/commands/release_meta_owner.go`; `core/commands/prepare_release.go` (`stampMetaOwner`, `verifyMetaOwner`) | confirmed |
| Promotion | Two new topic docs written, three folded | The named live docs exist and cover filing, stale rows and the recalculation state | `technical-documentation/backend/worker/statistics.md`, `backend/api/archive.md`, `testing/harness.md` | confirmed |

### Discrepancies

- **Stage K has no row in § Stage status.** It is the only stage whose landing a reader of the table
  cannot learn, and § Handoff status's closing line ("Stages A, B, D, E, F, G, H, I and J are done")
  omits it too.
- **§ Operational steps owed no longer matches the release.** The plan lists eight steps for 0.9.0 and
  the overlay's dry-run table lists the same eight. `releases` in `core/commands/prepare_release.go`
  holds one release, `0.9.0`, with 26 steps. Two differences matter to an operator reading this plan:
  - *"Copy the statistics documents before the rebuild"* is not a step. The copy is
    `backupReleaseCollections` ("copy every collection this release writes to"), which runs second and
    includes `derivedStatisticsCollections` from `release_statistics_reshape.go`.
  - *"A third command is owed … `tasks backfillMetaOwner`"* names a command that does not exist. The
    stamp is the `stampMetaOwner` step. The same section says so three paragraphs later, so the plan
    contradicts itself. `tasks revertRelease`, which does exist, is not mentioned.
- **Package and function names in the plan are not the code's.** `shared/archivestats` is
  `shared/statistics`; `archivestats.NewAccountRow` is `statistics.RowFromFigures`;
  `RebuildAccountStatistics` and `ReconcileAccountStatistics` are `RebuildStatistics` and
  `ReconcileStatistics`. The plan uses the old names in § Handoff status, § Open questions and
  § Decisions already made; the overlay uses `statistics.NewAccountRow`, which is also gone.
- **The route is described as account-only in two places.** The Stage D status row and § Done when
  ("currently authorises only the account kind, which shared-planners opens into a grant lookup") both
  predate the lookup landing. `requireOwnedBySession` now asks `AccountMayReach`, which reads the
  membership row, and [shared-planners](../shared-planners/plan.md) § Stage status records its
  Stage C as landed.
- **Two SPA doc comments still give the route as `/api/v1/statistics/account/totals`**:
  `frontend/src/Functions/Endpoints/Private/statisticsTotals.js` and
  `frontend/src/Components/Dialogues/Blueprint Archive/mapApiStatsToArchiveBreakdown.js`.
- **The overlay's Stage H opening says the page "carries two tabs".** It carries three.
- **§ Goal still promises "Per-corporation aggregation, derived from the jobs its members archived"**
  and § Stage A still plans corporation documents, while the Stage C row says none of it was needed.
  The stage sections describe a design the status table has retired.
- **Open question 2 (an unarchive producer) is answered by the code and left open in the text.**
  Restore marks rows revoked and queues a delta, which `live_restore_test.go` asserts.

## What each remaining step changes

Stages A, B, D, E, F, G, H, I, J and K and the owner block are landed; behaviour is in
[overlay.md](./overlay.md) under each stage's heading and, since promotion, in
`technical-documentation/backend/worker/statistics.md` and `backend/api/archive.md`. Stage C is retired.
What remains is four steps, none of them a feature.

### The release window against live

**Today.** Live holds archived jobs and no statistics collections; the plan says so and nothing in the
tree contradicts it, though it cannot be verified from a working tree. Dev has had the whole release.
The code that will populate live exists and is the path dev took. An archived job's row, as the pipeline
writes it today (`models.ArchivedJobStats`, trimmed):

```json
{
  "_id": "…",
  "_meta": { "owner": { "kind": "account", "id": "acct-123" } },
  "archivedBy": "acct-123",
  "jobID": "job-abc",
  "typeID": 587,
  "jobType": 1,
  "isProductionChain": false,
  "archivedAt": "2026-08-23T10:00:00Z",
  "costMonth": { "year": 2026, "month": 7 },
  "totalProduced": 10,
  "totalMaterialCost": 4200000,
  "totalInstallCost": 180000,
  "totalExtras": 0,
  "totalInventionCost": 0,
  "totalCostPerItem": 438000,
  "transactionLines": [],
  "feeLines": [],
  "contributedAt": "2026-08-23T10:00:04Z",
  "revoked": false
}
```

and the entry that asks for an owner's figures to be derived (`statistics_rebuild_queue`):

```json
{ "_id": "account:acct-123", "claim": 3, "work": "rebuild", "queuedAt": "2026-08-23T10:00:00Z", "failures": 0 }
```

**After.** Live has `statistics_rows`, `statistics_timeline` and `statistics_totals` populated for every
owner with archived jobs, every scoped document carries `_meta.owner`, and the SPA's statistics reads
return figures rather than empty lists. The operator path is two commands inside the maintenance window
[shared-planners](../shared-planners/plan.md) owns:

```text
tasks encodeJobIdentity -dry-run     then without the flag
tasks prepareRelease -dry-run        then without the flag
tasks dispatchStatisticsRebuilds     optional; the */2 schedule dispatches after the five-minute debounce
```

**Work.**
1. Rewrite [plan.md](./plan.md) § Operational steps owed and the overlay's dry-run table against the 26
   steps `prepareRelease` now lists, and remove `tasks backfillMetaOwner`.
2. Establish whether `tasks encodeJobIdentity` has run against live; the plan says it was not checked.
3. Run the window. Its order and backup are shared-planners'.
4. After the figures are checked, the operator clean-up in § Decisions needed.

**Wire.** Migrate-required, and already written: the `stampMetaOwner` step is marked required, the
rebuild is queued by `queueEveryAccountForRebuild`, and statistics documents are rebuilt rather than
migrated. No new `prepareRelease` step is owed by this project.

### A corporation's statistics

**Today.** No corporation pipeline exists and none is needed. A request names its owner in the path and
is authorised by membership:

```go
// api/v1endpoints/statistics/owner.go
mayReach, err := mongo.AccountMayReach(ctx, accountID, owner)

// shared/mongo/planner_get.go — true for the account's own owner, otherwise a membership row
bson.M{"_id": planner.MembershipID(owner.Key(), accountID)}
```

The SPA builds the same handle from whichever planner is active (`statisticsOwner.js`), so
`GET /api/v1/statistics/account:acct-123/totals` today and
`GET /api/v1/statistics/corporation:98000001/totals` use one code path.

**After.** A member working in a corporation planner sees that planner's archive and statistics. The
rows, buckets and totals are the same documents with a different `_meta.owner`:

```json
{ "_meta": { "owner": { "kind": "corporation", "id": "corp_…" } } }
```

**Work.** None in this project. It becomes true when
[shared-planners](../shared-planners/plan.md) creates corporation planners and jobs are archived in
one. What this plan owes is text: retire § Goal's corporation bullet, § Stage C's "still to land" list
of corporation collections, and § Stage A's "corp scope held for C".

**Wire.** Additive. A new owner kind on a route that already parses one.

### What the build history panel compares against

**Today.** The Build History panel shows what an item has cost before, from `totals.history`
(`models.BuildHistoryMarks`), and compares it with nothing:

```json
{ "history": { "buildCount": 14,
    "firstCostMonth": { "year": 2024, "month": 3 },
    "lastCostPerItem": 438000,  "lastCostMonth": { "year": 2026, "month": 7 },
    "cheapestCostPerItem": 401000, "cheapestCostMonth": { "year": 2025, "month": 1 },
    "dearestCostPerItem": 512000,  "dearestCostMonth": { "year": 2024, "month": 9 } } }
```

**After.** Unspecified. [plan.md](./plan.md) § Open — what the panel compares history against rules out
`Job.buildCostPerItem()` and names two candidate totals without choosing.

**Work.** Waits on the decision below. Whatever is chosen, two conditions from the plan stand: suppress
the comparison where the archived side recorded no cost, and compute the estimate once for the stage.

**Wire.** Client only.

### Closing the project

**Today.** Promotion has happened and the folder remains, correctly: the rule keeps a promoted folder
while another active project cites it, and [plan.md](./plan.md) § Promote map names three.

**After.** The folder is deleted and its row leaves the section `contents.md`.

**Work.**
1. Add the Stage K row and correct the stale names and route wording listed under Discrepancies.
2. Close open question 2 in the text; decide open question 3 (below).
3. Correct the two SPA doc comments that give the route as `/statistics/account/`.
4. Delete the folder when shared-planners, entity-id-encryption and collection-naming no longer cite it.

**Wire.** None.

## Decisions needed

### What the build history panel compares against

**Question.** Is an item's past build cost compared with the child-job total, the market total, both, or
nothing?

**Why it is James's call.** The plan calls it "a product decision about what a build-history comparison
means" and defers it to the Planning stage's design.
[planning-stage-panels](../planning-stage-panels/contents.md) has since reshaped the surface that
computes those totals, so the place the decision was parked has moved.

**Options.**
- **Market total.** Like for like with a recorded cost when the materials were bought; overstates a job
  whose inputs are built.
- **Child-job total.** Right for a job built from its own chain; undefined where there are no children.
- **Whichever the job's own sourcing uses.** One figure, matching what the reader has planned; needs the
  estimate lifted to the stage first.
- **No comparison.** What ships today. Honest, and leaves the reader to do the subtraction.

**Recommendation.** The third, taken up inside planning-stage-panels when it lifts the estimate to the
stage, and not before. Until then, leave the panel as it is and mark Stage J complete without the
caveat: the caveat is a feature request against another project, not unfinished work here.

**Blocked until decided.** Only the comparison strip. Nothing else in Stage J waits on it.

### Whether the keep-list needs a generation counter

**Question.** A rebuild revokes and prunes by passing every surviving row id in a `$nin`
([plan.md](./plan.md) § Open questions, item 3). Is that replaced now, or left?

**Why it is James's call.** It trades a known, unmeasured ceiling against work on a path that no longer
runs on a reader's action. Only he knows how large the biggest live archive is.

**Options.**
- **Leave it.** Since Stage J a wholesale rebuild runs from the rota, the tasks CLI and a filing, not on
  every archive, so the `$nin` is paid rarely. Dev's 9,270 archived jobs spread over 227 owners.
- **Add a generation counter to the rows.** Bounded at any size; a stored-shape change on
  `statistics_rows` and a second way of saying which rows are current.

**Recommendation.** Leave it, and record the largest owner's archived-job count from the live snapshot
beside the question so the next reader can see how far away the ceiling is.

**Blocked until decided.** Nothing.

### When the pre-release leftovers are removed

**Question.** After the window, when do `_meta.accountID` on every scoped document, the old-shaped
statistics documents that carry no owner, and the `_pre_0_9_0` copies get deleted, and by what?

**Why it is James's call.** The plan leaves all three "for an operator to remove once the figures are
checked" and defines neither the check nor the command. They are the fallback, so removing them is the
point of no return.

**Options.**
- **A later release's `prepareRelease` step.** Scripted, dry-runnable, and impossible to forget; fixes
  the retention at one release.
- **A standalone `tasks` command run by hand.** The operator chooses the moment; a self-hoster has to
  know to run it.
- **Leave them.** Inert, since every query filters on the owner; costs storage and one stale field on
  every document indefinitely.

**Recommendation.** A step in the release after this one. It matches how every other shape change here
ships, and gives a self-hosted deployment the same clean-up without instructions.

**Blocked until decided.** Nothing in this release; the content of the next one.

## Dependencies and order

**Waits on.**
- [shared-planners](../shared-planners/plan.md) for the maintenance window, its order and its backup,
  and for corporation planners, which are what make a corporation's statistics exist.
- [entity-id-encryption](../entity-id-encryption/plan.md) for `tasks encodeJobIdentity`, which should
  run before the rebuild so it reads refs.
- [planning-stage-panels](../planning-stage-panels/contents.md) for the estimate the build history
  comparison would read.

**Waited on by.**
- shared-planners, entity-id-encryption and collection-naming cite this folder, which is why it is not
  deleted. document-defaults, document-write-granularity and job-groups link to it as well.

**Recommended next slice.** Documentation only, and small:
1. Bring the plan into line with the code: the Stage K row, the 26-step release, the retired
   `backfillMetaOwner`, the renamed package and functions, the owner-handle route, and the corporation
   text the Stage C row has overtaken.
2. Then nothing until the window. No code is owed.
