# Static data build — plan

**Status:** Phase 1 done (this folder). Stages A–D open, none started.
**Code in scope:** [`services/worker/tasks/sde/update/`](../../../services/worker/tasks/sde/update/)
(version check, download, map build, conversion stage wiring, persist wiring, recipe diff, Mongo sync),
[`services/worker/tasks/sde/publish/`](../../../services/worker/tasks/sde/publish/) where the build
side calls it, [`services/shared/core/sde/`](../../../services/shared/core/sde/) for the file
definitions, and the SDE task's metrics.
**Live SoT (until promote):** [backend/](../../backend/contents.md),
[backend/worker/worker.md](../../backend/worker/worker.md),
[frontend/static-data/](../../frontend/static-data/contents.md)

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
Go surfaces in scope: `go fix -diff` run 2026-09-24 over `worker/tasks/sde/update`,
`worker/tasks/sde/update/conversion`, `worker/tasks/sde/publish`, `worker/tasks/sde/rollback` and
`shared/core/sde` — **empty diff on all five**, no modernisations owed before this work. Re-run on the
packages each slice edits, before and after.
Live SoT will not be edited until this project is complete and promotion is approved.

## Why this project exists

The daily task treats a new build number as a reason to do all of the work. It downloads a 99 MB
archive of which it reads 27 MB, parses eight JSONL files, converts seven outputs, and republishes
every one of them — and CCP publishes a feed, 850 bytes for the latest build, that says which
datasets changed.

Measured over 80 consecutive builds (2026-02-27 to 2026-09-23), **12 touched none of the eight
datasets the conversion reads, and 13 more touched them only by localisation** in locales that are
discarded during the map build. Roughly one build in three did work that could not change a byte of
published output. Raw data: [measurements/changes-feed.md](./measurements/changes-feed.md).

Two correctness problems sit alongside that. `latest.jsonl` is JSON Lines with a `_key`
discriminator and is parsed as a single JSON object, which works only because the file currently has
one line; when it does not, `buildNumber` lands as 0 and the download falls back to a shorthand URL
that CCP redirects to whatever build is current — so the pipeline would download an unknown build and
label it from the check that had just failed. And the scheduled entrypoint gives the whole pipeline
**60 seconds** while the two manual entrypoints give the same work **five minutes**.

The feed also carries `schemaChanged`, which fired on `types` in four of those 80 builds. The map
build reads `types` through an eleven-key allowlist that drops anything not named, so a renamed field
produces an empty output column rather than an error.

## Stages

### Stage A — The version check, the budget, and being able to see the run

Small, independent, no change to what is published.

- Parse `latest.jsonl` line by line and select `_key == "sde"`; remove the shorthand-URL fallback so a
  build number the check did not establish cannot become a download.
- Give the scheduled entrypoint the same budget as the manual ones, and thread the task context
  through persist and prune instead of `context.Background()`, so a shutdown can interrupt the phase
  that writes to the object store.
- Walk the required files in a deterministic order.
- Emit a run counter labelled by outcome — `published`, `failed`, and the skip reasons Stage B adds —
  plus the duration and the bytes fetched.

The metric is in this stage rather than beside the gate on purpose: Stage B makes "did nothing" a
normal outcome for a third of builds, and a gate that wrongly skips looks exactly like a healthy quiet
week. The counter has to exist before the thing that needs it.

### Stage B — The relevance gate and schema drift

- Fetch `changes/<build>.jsonl` for each build from the one held up to latest, chained through
  `_meta.lastBuildNumber`, and union the dataset keys.
- Stop the run when no key is one of the eight the conversion reads, recording the skip reason.
- Alert when any record carries `schemaChanged` for a dataset in that set.
- The dataset-key-to-filename map lives beside `requiredFiles` as one table, not derived by trimming
  an extension.

**A change to the conversion is not a change in the feed.** The gate sees CCP's datasets, not this
repository's code, so a release that changes what the conversion writes — volumes added to the
reprocessing file by [reprocessing-rebuild](../reprocessing-rebuild/plan.md) § Stage B, for one — is
skipped like any other build with nothing new. The release's forced rebuild of the current version is
what publishes it, and must stay outside the gate.

**Build the table from `requiredFiles`, not from the count above.** `downloadStage.go` lists eleven
datasets today — the industry bonuses added `dogmaEffects`, `industryTargetFilters` and
`industryModifierSources` after the eight measured here — so the gate reads its set from that list.
[reprocessing-rebuild](../reprocessing-rebuild/plan.md) § B1a reads the reprocessing skill from
`typeDogma`, which is already among them, and adds nothing.

Localisation-only builds are **not** decidable here — the feed gives ids, not locales — and are left
to the content hash in the delivery project's Stage B.

### Stage C — Fetch only the part of the archive that is read

The archive is 99.2 MB across 102 entries; the eight files the conversion reads are 26.9 MB of it, and
the single largest entry, `mapMoons.jsonl` (37.6 MB compressed, 224 MB decompressed), is never opened.
The endpoint answers `accept-ranges: bytes` and the central directory is 9,250 bytes at the tail.

Put an HTTP `ReaderAt` behind `archive/zip.NewReader`, so the whole body is never read into memory.
This deletes the reason `SDE_IN_MEMORY_MAX_BYTES` exists — an undocumented `os.Getenv` knob on no
env SoT, which nothing can currently set — and it changes the premise that
`TestSDEDownloadResult_carriesArchiveNotExtractedBytes` and
`TestRunSDEMapBuildStage_releasesExtractedBytes` were written against. Those tests are rewritten in
this stage, not before it.

### Stage D — The leftovers the earlier stages make cheap

- The recipe diff reads the current recipe list from the conversion's in-memory slice instead of
  re-parsing the 10 MB it was just handed; the previous build's list still has to be parsed.
- The Mongo blueprint sync moves to after the publish has succeeded, and runs only when the recipe
  output actually changed — which the delivery project's content hash answers. Today it writes the new
  build's recipes before the publish, so a failed publish leaves Mongo ahead of what is served.
- `replaceCurrentOnly` is a parameter on `runSDEPersistStageWithMode`, `PublishLive` and
  `promoteStaging`, discarded with `_ =` in the last of them, so a rebuild-in-place archives the
  current build anyway and consumes one of the five retained slots.
  **Do not fix it here** — the delivery project's manifest removes the labelled-snapshot machinery
  that the flag exists to steer. This stage deletes the parameter once that has landed.

## What this project does not do

**It does not change what is published or how it is served.** The published file layout, the version
manifest, the atomicity of the publish, retention, the API's serve path, the cache headers and the
SPA's reading of the files all belong to
[static-data-delivery](../static-data-delivery/contents.md). This project decides whether a build runs
and what it costs; that one decides what the run leaves behind.

It also does not change the conversion's output shapes, the scheduler's cadence, or the Mongo
collection's own shape.

## Wire compatibility

| Change | Shape |
|--------|-------|
| `latest.jsonl` parsed as JSON Lines | Additive. Reads CCP's documented format correctly; no EIP surface moves. |
| Shorthand download URL fallback removed | Additive. A build number the check did not establish now fails the run instead of downloading an unknown build. |
| Scheduled task timeout raised to five minutes | No wire surface. Worker-internal. |
| Context threaded through persist and prune | No wire surface, but a shutdown can now interrupt a publish — see the delivery project's atomicity work, which this depends on for safety. |
| Relevance gate | No wire surface. The task does less; what it publishes when it runs is unchanged. |
| New run metric and skip reasons | Additive. New series names only. |
| Ranged archive fetch | No wire surface. `SDE_IN_MEMORY_MAX_BYTES` is removed, which is operator-visible only in that nothing could set it. |
| Mongo sync moved after publish | Additive in shape; ordering only. |

## Done when

- A build that touches none of the eight datasets is skipped for the cost of the changes feed, and the
  run says why.
- `latest.jsonl` is read as JSON Lines, and no path can download a build the version check did not name.
- The scheduled run has the same budget as the manual ones, and cancellation reaches the publish.
- A `schemaChanged` record on a dataset the conversion reads raises an alert.
- The archive is fetched by range, and `SDE_IN_MEMORY_MAX_BYTES` is gone.
- The recipe diff parses the previous build only, and Mongo is written after a successful publish.
- Live SoT promoted and this folder deleted.

## Open questions

- **Does the gate act on a union of missed builds, or only the latest?** Chaining `lastBuildNumber`
  is strictly more correct, but the chain is only as good as CCP's retention of old changes files,
  which is unmeasured. A worker that has been down for a month may find the chain broken; the
  fallback is to run the build.
- **Should a localisation-only build be skipped without converting?** The feed cannot say which locale
  moved, so skipping on that basis would be a guess. Converting and comparing hashes is safe but costs
  the download. Leaving it to the delivery project's hash is the assumption in Stage B; revisit if the
  ranged fetch makes the download cheap enough that it stops mattering.
- **How loud should `schemaChanged` be?** It fired four times in seven months and each time the risk
  was a silently dropped field, not a failed run. An alert that nobody reads is worse than a run that
  fails; failing the run on a schema change to a dataset we allowlist is the stronger option and the
  more disruptive one.
- **Is the changes feed load-bearing enough to test against a fixture?** Stage B's correctness depends
  on CCP's vocabulary matching our dataset map. A parity test needs a recorded feed sample, which goes
  stale differently from the code.
