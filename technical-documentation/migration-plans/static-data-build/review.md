# Static data build — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

## Summary

The project makes the daily SDE task decide whether a build is worth running before it downloads
anything, and makes the run cheaper and observable when it does. The plan says Phase 1 is done and
Stages A–D are open and not started, and the code bears that out exactly: every defect the plan names
is still in `services/worker/tasks/sde/update/` as described, and nothing of this project's has landed.

The working tree does carry uncommitted edits in this package — `conversionStage.go`,
`recipeListDiffStage.go` and `conversion/` — but they are the reprocessing-rebuild project's Stage B
(the reprocessing file becomes `{ items, materialVolumes }` and reads `typeDogma`), not this
project's. The two things most worth attention: the task's run budget has three values in the code, not
the two the plan names, and Stage D is blocked on static-data-delivery Stage B in two places, so the
project cannot close on its own.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---|---|---|---|---|
| Phase 1 | done | Folder, plan, overlay scaffold, measurements and the section row all exist | this folder; `../contents.md` row 41 | confirmed |
| A — version check as JSON Lines | open | `fetchLatestBuild` reads the whole body with `io.ReadAll` and unmarshals it into one `latestBuildInfo`; nothing selects `_key == "sde"` | `update/versionStage.go` | confirmed |
| A — shorthand URL fallback removed | open | `buildJSONDataURL` returns `JSONDataURL` (the `-latest-` zip) when `buildNumber <= 0`; `runSDEDownloadStage` also defaults to `JSONDataURL` when `LatestBuildInfo` is nil | `update/versionStage.go`, `update/downloadStage.go` | confirmed |
| A — scheduled budget equals manual | open | `CheckSDEUpdates` wraps its context in `60*time.Second`; `ApplySDEVersion` and `RebuildCurrentSDEVersion` use `5*time.Minute`; the task registry declares `DefaultTimeout: 15 * time.Minute` for all four SDE tasks | `update/checkUpdates.go`, `update/applyVersion.go`, `update/rebuildCurrentVersion.go`, `services/shared/nats/tasks.go`, `services/worker/asynq/routing.go` (`clampTaskTimeout`) | confirmed, and understated: three budgets, not two |
| A — context through persist and prune | open | `runSDEPersistStageWithMode` opens with `ctx := context.Background()`; `runSDEPrunePreviousVersions()` takes no context; the `stagePersist` seam has no context parameter; map build and conversion log on `context.Background()` | `update/persistStage.go`, `update/checkUpdates.go`, `update/mapBuildStage.go`, `update/conversionStage.go` | confirmed |
| A — deterministic file order | open | `requiredFiles` is a `map[string]string` and `runSDEMapBuildStage` ranges over it | `update/downloadStage.go`, `update/mapBuildStage.go` | confirmed |
| A — run counter by outcome, duration, bytes | open | The only worker metric is `worker.asynq.tasks_total{task_type, outcome=success\|failure}` recorded by the asynq wrapper; a run skipped by the version lock or by `NeedsUpdate=false` returns nil and counts as `success`; no bytes-fetched series exists | `services/shared/telemetry/workermetrics/workermetrics.go`, `services/worker/asynq/handlers.go` | confirmed |
| B — relevance gate on `changes/<build>.jsonl` | open | No reference to `changes/`, `lastBuildNumber` or `schemaChanged` anywhere under `services/` | grep over `services/**/*.go` | confirmed |
| B — dataset-key-to-filename table | open | `requiredFiles` maps filename to the `StructuredData` field name (`"types.jsonl": "Types"`); there is no dataset-key side. Eleven entries, as the working-tree plan now says | `update/downloadStage.go` | confirmed |
| C — ranged archive fetch | open | `downloadJSONArchiveInMemory` reads the body with `io.ReadAll`, guards it with `os.Getenv("SDE_IN_MEMORY_MAX_BYTES")`, and hands `zip.NewReader` a `bytes.Reader` over the whole body | `update/downloadStage.go` | confirmed |
| C — the two tests it rewrites | open | `TestSDEDownloadResult_carriesArchiveNotExtractedBytes` and `TestRunSDEMapBuildStage_releasesExtractedBytes` exist as described | `update/pipeline_memory_test.go` | confirmed |
| D — recipe diff reads the in-memory list | open | `runSDENewRecipeItemsStage` unmarshals `persistResult.CurrentRecipeBytes` into `[]*conversion.EVEType` although `sdeConversionResult.RecipeList` already holds that slice; the persist result does not carry it | `update/recipeListDiffStage.go`, `update/persistStage.go`, `update/conversionStage.go` | confirmed |
| D — Mongo sync after publish, only on change | open | `runSDEUpdatePipelineWithPersist` calls `stageBlueprintsSync` before `persistStage`; `TestRunSDEUpdatePipeline_blueprintsSyncCompletesBeforePersist` asserts that order | `update/checkUpdates.go`, `update/pipeline_memory_test.go` | confirmed |
| D — `replaceCurrentOnly` | deferred to delivery Stage B | `promoteStaging` opens with `_ = replaceCurrentOnly`; the flag is threaded through `runSDEPersistStageWithMode` and `PublishLive` | `publish/publish.go`, `update/persistStage.go` | confirmed |
| `go fix -diff` empty on the five packages | done 2026-09-24 | Not re-run here (brief: no builds unless a claim needs one). The packages have since been edited by other projects | — | unverifiable |

### Discrepancies

- **Three run budgets, not two.** The plan contrasts the scheduled handler's 60 seconds with the manual
  handlers' five minutes. There is a third figure: `services/shared/nats/tasks.go` declares
  `DefaultTimeout: 15 * time.Minute` on `CheckSDEUpdates`, `RollbackSDEVersion`, `ApplySDEVersion` and
  `RebuildCurrentSDEVersion`, and `services/worker/asynq/routing.go` applies it as the asynq task
  timeout. The handler-level `context.WithTimeout` is the one that binds. Stage A's "give the scheduled
  entrypoint the same budget as the manual ones" should decide which of the three is the source of
  truth rather than raising one constant to match another (see Decisions).
- **Stage C's byte figure predates the eleven-file set.** `measurements/archive.md` counts the eight
  files read on 2026-09-24 at 26.9 MB. `requiredFiles` now also lists `dogmaEffects.jsonl`,
  `industryTargetFilters.jsonl` and `industryModifierSources.jsonl`. They are small, but the "27%"
  that justifies the ranged fetch should be re-measured against the current list before the stage
  states it as its outcome.
- **A skipped run is already indistinguishable from a healthy one.** The plan frames the counter as a
  prerequisite for Stage B. It is also a present-day gap: a run that returns early on the version lock
  or on `NeedsUpdate=false` is recorded as `outcome=success` by the asynq wrapper, the same as a run
  that published.
- **Working-tree edits in scope belong to another project.** `git status` shows
  `conversionStage.go`, `recipeListDiffStage.go`, `conversion/output_reprocessing_data.go`,
  `conversion/types.go` modified and `recipeListDiffStage_test.go`,
  `conversion/output_reprocessing_data_test.go` untracked. They pass `typeDogma` into
  `GenerateReprocessingDataOutput`, read `conversion.ReprocessingData.Items` and walk
  `RandomizedMaterials` — reprocessing-rebuild § Stage B. None of this project's stages has started.

## What each remaining step changes

### Stage A — The version check, the budget, and being able to see the run

**Today.** The version check decodes `latest.jsonl` as one object and derives the download URL from
whatever build number that produced:

```go
// services/worker/tasks/sde/update/versionStage.go
var latest latestBuildInfo
if err := jsoncodec.Unmarshal(body, &latest); err != nil {
    return nil, err
}
latest.DownloadURL = buildJSONDataURL(latest.BuildNumber)

func buildJSONDataURL(buildNumber int) string {
    if buildNumber <= 0 {
        return JSONDataURL   // .../eve-online-static-data-latest-jsonl.zip
    }
    return fmt.Sprintf(buildZipURLTemplate, buildNumber)
}
```

CCP's file is JSON Lines with a `_key` discriminator (`measurements/changes-feed.md`); it currently has
one line, which is the only reason this works. The scheduled entry point is
`ctx, cancel := context.WithTimeout(ctx, 60*time.Second)` in `CheckSDEUpdates`; persist and prune run
on `context.Background()`; `requiredFiles` is iterated as a map; the only metric is the generic asynq
`success|failure` counter.

**After.** `fetchLatestBuild` scans the body line by line, decodes each into a record carrying `_key`,
and returns the one whose key is `"sde"`, failing when none is. `buildJSONDataURL` either takes a
positive build number or returns an error; `JSONDataURL` and the `downloadURL := JSONDataURL` default
in `runSDEDownloadStage` go. The persist seam gains a context:

```go
// after — the stage seam carries the task context
stagePersist func(context.Context, *sdeVersionCheckResult, *sdeConversionResult) (*sdePersistResult, error)
stagePrunePrevious func(context.Context) error
```

`requiredFiles` becomes an ordered slice (or the map is walked through `slices.Sorted(maps.Keys(...))`).
A run records one outcome:

```text
worker.sde.runs_total{outcome="published"|"failed"|"skipped_locked"|"skipped_current"|<Stage B reasons>}
worker.sde.run.duration_milliseconds
worker.sde.run.bytes_fetched
```

The plan does not fix the series names; the ones above follow `workermetrics`' existing
`worker.asynq.*` naming.

**Work.**
1. Rewrite `fetchLatestBuild` as a JSON Lines scan selecting `_key == "sde"`; test with a two-line
   fixture where the `sde` record is not first.
2. Make `buildJSONDataURL` refuse `buildNumber <= 0`; delete `JSONDataURL` and the fallback in
   `runSDEDownloadStage`; `buildNextVersion` and `PublishLive`'s `defaultDownloadURL` parameter lose
   their fallback too (the archive `version.json` writer in `publish.go` takes the same default).
3. Settle the run budget (Decision 1) and remove whichever `WithTimeout` is not the source of truth.
4. Add `context.Context` to `runSDEPersistStageWithMode`, `runSDEPrunePreviousVersions` and the
   `stagePersist` / `stagePersistReplace` / `stagePrunePrevious` seams; update `withStageMocks` in
   `checkUpdates_test.go` and every mock signature in `pipeline_memory_test.go`.
5. Give `runSDEMapBuildStage` a deterministic order over `requiredFiles`.
6. Add the run instruments to `services/shared/telemetry/workermetrics` and record them from
   `CheckSDEUpdates`, `ApplySDEVersion` and `RebuildCurrentSDEVersion`, including the two early
   returns in `CheckSDEUpdates` (lock, no update) as skip outcomes.
7. `go fix -diff ./worker/tasks/sde/update/ ./shared/telemetry/workermetrics/` before and after.

**Wire.** Additive. New metric series only. A build number the check did not establish now fails the
run instead of downloading an unknown build. Cancellation reaching `PublishLive` can interrupt a
publish between `CopyPrefix` calls, which the current layout does not recover from — the plan already
notes this depends on delivery Stage B's atomic publish for safety; until then item 4 makes a
mid-publish shutdown possible where it was not before (see Decision 5).

### Stage B — The relevance gate and schema drift

**Today.** Nothing reads the changes feed. The run proceeds whenever
`current.BuildNumber < latest.BuildNumber`. The only dataset list is:

```go
// services/worker/tasks/sde/update/downloadStage.go
var requiredFiles = map[string]string{
    "blueprints.jsonl": "Blueprints",
    "types.jsonl":      "Types",
    // … eleven entries, filename → StructuredData field
}
```

**After.** One table carries three columns, so the gate, the download and the map build read the same
set:

```go
// after — one row per dataset the conversion reads
type sdeDataset struct {
    Key      string // CCP's dataset key in changes/<build>.jsonl, e.g. "typeDogma"
    FileName string // entry in the archive, e.g. "typeDogma.jsonl"
    Field    string // StructuredData field, e.g. "TypeDogma"
}
var requiredDatasets = []sdeDataset{ … }
```

Between the version check and the download, the task fetches `changes/<b>.jsonl` for each build from
`current+1` to `latest`, following `_meta.lastBuildNumber`, and unions the dataset keys that carry
`added`, `changed` or `removed` (not `changedLocalization` alone). If the union meets none of
`requiredDatasets`, the run ends with `outcome="skipped_irrelevant"` and `version.json` is **not**
advanced (the plan is silent on this; it must not be, or the next day's run would skip the same work
again — see Decision 2). Any record with `schemaChanged: true` on a required dataset triggers the
response chosen in Decision 3.

```json
// changes/<build>.jsonl, as measured (one record per line)
{"_key":"_meta","buildNumber":3539543,"lastBuildNumber":3537996,"releaseDate":"2026-09-23"}
{"_key":"types","added":[…],"changed":[…],"changedLocalization":[…],"schemaChanged":false}
```

**Work.**
1. Replace `requiredFiles` with the three-column table and derive the download check, the map build
   and the gate from it (`map_build_fields.go` keys by filename and is unaffected).
2. Add `fetchBuildChanges(ctx, build)` beside `fetchLatestBuild`, through `httpGetOKWithRetry`.
3. Add the gate stage to `runSDEUpdatePipelineWithPersist` behind a seam like the others, so
   `withStageMocks` can replace it; it must be bypassed by `RebuildCurrentSDEVersion` and
   `ApplySDEVersion`, which already build their own `NeedsUpdate: true` result.
4. Chain fallback: a missing or malformed changes file anywhere in the chain means "run the build",
   recorded as its own outcome.
5. A recorded feed fixture for the parity test (Decision 4).
6. Overlay § The relevance gate.

**Wire.** No wire surface. The task does less; what it publishes when it runs is unchanged.

### Stage C — Fetch only the part of the archive that is read

**Today.**

```go
// services/worker/tasks/sde/update/downloadStage.go
body, err := io.ReadAll(reader)                       // 99 MB live
archive, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
```

with `SDE_IN_MEMORY_MAX_BYTES` read by `os.Getenv` and present in no env SoT.

**After.** A `ReaderAt` over HTTP range requests, sized from the `Content-Length` of a `HEAD` (or the
first ranged response), handed to `zip.NewReader`. `sdeDownloadResult.Archive` stays a `*zip.Reader`,
so `openArchiveEntry` and `readFileForMapBuild` are unchanged; only how the reader is backed moves.
The endpoint answers `accept-ranges: bytes` (`measurements/archive.md`).

```go
// after — the shape the plan implies; names are not fixed by it
type httpRangeReaderAt struct { ctx context.Context; url string; size int64 }
func (r *httpRangeReaderAt) ReadAt(p []byte, off int64) (int, error) // one GET with Range: bytes=off-…
```

**Work.**
1. Implement the ranged reader in the `update` package (or `services/shared/httpclient` if a second
   caller is foreseeable — the rules prefer extending the shared package), with the retry policy
   `httpGetOKWithRetry` already applies.
2. Read the central directory from a tail fetch (9,250 bytes at the end of a 99 MB file) and each
   required entry by its own range; a conditional request on the archive's `ETag` is optional here.
3. Delete `SDE_IN_MEMORY_MAX_BYTES`, `downloadJSONArchiveInMemory`'s `LimitReader` path and its
   error string.
4. Rewrite `TestSDEDownloadResult_carriesArchiveNotExtractedBytes` and
   `TestRunSDEMapBuildStage_releasesExtractedBytes` against a fake range server
   (`httptest.Server` honouring `Range`).
5. Record `bytes_fetched` from the ranged reader into the Stage A metric.
6. Re-measure the read set against the eleven-file `requiredFiles` and update
   `measurements/archive.md`.

**Wire.** No wire surface. `SDE_IN_MEMORY_MAX_BYTES` is removed; nothing could set it.

### Stage D — The leftovers the earlier stages make cheap

**Today.**

```go
// services/worker/tasks/sde/update/checkUpdates.go — order of the pipeline
conversionResult, err := stageConversion(mapBuildResult)
if err := stageBlueprintsSync(ctx, conversionResult, deps); err != nil { return err }   // Mongo first
persistResult, err := persistStage(versionResult, conversionResult)                      // then publish
if err := stageRecipeDiff(ctx, persistResult, deps); err != nil { return err }           // re-parses CurrentRecipeBytes
```

```go
// services/worker/tasks/sde/publish/publish.go
func promoteStaging(…, replaceCurrentOnly bool) error {
    _ = replaceCurrentOnly
```

**After.** `stageBlueprintsSync` runs after a successful persist, and only when the recipe file's hash
in the new manifest differs from the previous one — the manifest is delivery Stage B's. The diff stage
takes `conversionResult.RecipeList` for the current side and parses only
`persistResult.PreviousRecipeBytes`. `replaceCurrentOnly` is deleted with `promoteStaging`.

**Work.**
1. Reorder the pipeline; rewrite `TestRunSDEUpdatePipeline_blueprintsSyncCompletesBeforePersist`
   into "sync runs after persist and not when persist fails".
2. Pass `conversionResult.RecipeList` (or carry it on `sdePersistResult`) into
   `runSDENewRecipeItemsStage`; drop `CurrentRecipeBytes`.
3. Gate the sync on the manifest's recipe hash — **blocked on delivery Stage B**.
4. Delete `replaceCurrentOnly` from `runSDEPersistStageWithMode`, `PublishLive` and
   `promoteStaging` — **blocked on delivery Stage B**, which deletes `promoteStaging` itself.
5. Overlay § The recipe diff and the Mongo sync.

**Wire.** Additive in shape, ordering only. No `prepareRelease` step: the Mongo `blueprints`
collection's own shape does not change.

## Decisions needed

### 1. Which of the three run budgets is the source of truth

**Question.** Should the SDE handlers keep their own `context.WithTimeout`, or should the task
registry's `DefaultTimeout` be the only budget?

**Why it is James's call.** The plan says "give the scheduled entrypoint the same budget as the manual
ones" and names two values; the code has three (60 s, 5 min, 15 min), with the 15 min declared in
`services/shared/nats/tasks.go` — the file whose header says it is the single source of truth for a
task's timeout. Raising the handler's 60 s to 5 min leaves two budgets and keeps the registry's value
dead. Removing the handler-level timeouts changes a shared convention other tasks may also follow.

**Options.**
- *Raise the handler to five minutes* — smallest change, matches the plan's words, leaves the registry
  figure meaningless for these tasks.
- *Delete the handler-level `WithTimeout` from all four SDE handlers and let `clampTaskTimeout(task.DefaultTimeout)` govern* — one SoT, consistent with the rules' one-source-of-truth bar; 15 minutes is
  generous for a 99 MB download and may be right once Stage C makes it 27 MB.
- *Lower the registry to five minutes and delete the handler timeouts* — one SoT and the plan's number.

**Recommendation.** The second or third option; pick the number, then make the registry the only
place it lives. Check whether other `handleTrigger` handlers also wrap their own timeout before
treating this as SDE-only.

**Blocked until decided.** Stage A item 3.

### 2. Does a skipped build advance `version.json`?

**Question.** When the gate skips a build, does the store record that build as current, or does the
held build number stay where it was?

**Why it is James's call.** The plan does not say. If the held number does not move, the next day's
check sees `current < latest` again and refetches the same changes chain (cheap, but every day, and
the chain grows until a relevant build arrives). If it does move, `version.json`'s `build_number` no
longer names the build the published files were converted from, and `/api/static-data/meta` tells
clients a build changed when no file did — which `staticDataSync` treats as a reason to re-download
everything. The announcement path (`pushCoreSDEBuildUpdate`) would also fire.

**Options.**
- *Hold the build number; record the last build examined separately* (a small `sde_gate.json` or a
  field on the manifest) so the chain restarts from there. Clients see nothing.
- *Advance the build number without republishing files.* Clients re-download unchanged files until
  delivery Stage B's per-file hashes make `changed` a set rather than a boolean.

**Recommendation.** Hold it, and record the examined build in the manifest once delivery Stage B
lands (a `last_checked_build` field); until then a separate small object.

**Blocked until decided.** Stage B item 3.

### 3. How loud `schemaChanged` is

**Question.** Does a `schemaChanged` record on a required dataset fail the run, or log and continue?

**Why it is James's call.** The plan's open question. Failing is safer against a silently dropped
field (the eleven-key `types` allowlist in `map_build_fields.go` returns an empty column rather than an
error) but turns a CCP schema note into a failed daily task until someone looks; it fired four times in
seven months on `types`. Logging requires someone to read the log.

**Options.**
- *Fail the run* with its own outcome label; the next manual `forceSdeRebuild` or `applySdeVersion`
  is the operator's acknowledgement.
- *Warn and continue*, plus a `schema_changed_total{dataset}` counter so a dashboard can alert.
- *Fail only when the allowlist is involved* — `types`, `typeMaterials`, `mapSolarSystems`,
  `marketGroups`, `groups`, `dogmaAttributes` are filtered by `keepFieldsFor`; `blueprints` is not.

**Recommendation.** Fail the run for datasets the allowlist filters, warn for the rest; both as
outcomes on the Stage A counter.

**Blocked until decided.** Stage B item 3's error path.

### 4. A fixture for CCP's changes feed

**Question.** Does Stage B carry a recorded sample of `changes/<build>.jsonl` as a test fixture?

**Why it is James's call.** The gate's correctness rests on CCP's dataset vocabulary matching the
table's `Key` column. A fixture proves the parser and the match against a real shape; it also goes
stale on CCP's schedule rather than ours, and the repository's rules on recorded counts
(`measurements/*` are dev figures) apply to it.

**Options.** Record one small file (the 850-byte latest) as testdata and assert the parse plus the
match against the table; or test against hand-written records only.

**Recommendation.** One recorded file plus hand-written edge cases (empty union, broken chain,
`schemaChanged`). Name the build in the filename so staleness is visible.

**Blocked until decided.** Stage B item 5.

### 5. Whether Stage A's cancellation lands before delivery Stage B's atomic publish

**Question.** Should the task context reach `PublishLive` while the publish is still a sequence of
`CopyPrefix` / `DeletePrefix` calls over a mutated `live_data/`?

**Why it is James's call.** It is the plan's own caveat, left unresolved: today a shutdown cannot
interrupt the publish because it runs on `context.Background()`; after Stage A item 4 it can, and a
cancellation between archiving `live_data/` and overwriting it from staging leaves the tree the
delivery plan describes as "mixed with no recovery path". That is a worse failure than the one being
fixed, until the publish is a write-objects-then-one-manifest.

**Options.**
- Land item 4 with the rest of Stage A and accept the window.
- Thread the context but have `PublishLive` run its promote step on a detached context with its own
  short deadline until delivery Stage B lands.
- Hold item 4 until delivery Stage B.

**Recommendation.** Hold item 4 (persist and prune only; the download, gate and map build take the
context now). It is a one-line change once the publish is atomic.

**Blocked until decided.** Stage A item 4.

## Dependencies and order

**Waits on.** Stage D items 3 and 4 wait on
[static-data-delivery](../static-data-delivery/plan.md) § Stage B (the manifest and the removal of
`promoteStaging`). Decision 5 may hold Stage A item 4 on the same stage. Stage B's localisation-only
case is also left to that project's content hash, by design.

**Waited on by.** [reprocessing-rebuild](../reprocessing-rebuild/plan.md) § B2 and § Stage M assume
the gate exists and that the release's forced rebuild bypasses it; `RebuildCurrentSDEVersion` already
builds its own `NeedsUpdate: true`, so that holds whatever Stage B does. Nothing else waits on this
project.

**Recommended next slice.** Stage A without item 4 (JSON Lines check, fallback removal, budget per
Decision 1, deterministic order, the run counter), then Stage B behind Decisions 2–4. Stage C is
independent and can follow either. Stage D's first two items can land any time; the rest when the
delivery manifest exists.
