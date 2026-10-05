# Document defaults — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

## Summary

The project moves the defaults a job and a group are born with from the SPA to the server, puts the
schema upgrader on their read path, and converts extras category ids from `"0"`…`"5"` to slugs. Its
status line is honest: Phase 1 is complete and **no track has any code**. Every "not started" was
checked against the code and holds.

Three things need attention before a slice is picked up:

1. **The reason given for "no version bump" is not true of live.** `Public` does carry a
   `document_schema.go`, at `services/shared/shared/models/`, and its worker stamped
   `schemaVersion: 1` onto jobs and groups hourly. The no-bump conclusion can still stand, but on
   different grounds, and the conversion steps cannot use the version to find what they missed.
2. **A read-path upgrader does not reach every reader.** The change stream forwards the stored
   document untouched, so Phase A1 alone does not give "every reader sees one shape".
3. **The slot chosen for the slug conversion breaks an earlier release step** once
   `ExtrasCategoryUnassigned` is the slug: the label stamp would stop naming the 865 unfiled rows.

One smaller correction: the `go fix` item is already applied.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---|---|---|---|---|
| Phase 1 — docs | Complete | Folder, plan, overlay scaffold and section row exist | `contents.md`, `plan.md`, `overlay.md`; [`../contents.md`](../contents.md) row "Document defaults" | confirmed |
| Prerequisite — `categoryLabel` read on both decode paths | Landed | Field modelled and assigned in both decoders | `services/shared/models/job.go` `ExtraCost.CategoryLabel`, and the two assignments beside `ExtrasCategoryOrUnassigned` in its JSON and BSON decoders | confirmed |
| Prerequisite — `materialPriceOverrides` modelled | Landed, on `JobLayout` | Modelled, but on `JobBuild` | `services/shared/models/job.go` `JobBuild.MaterialPriceOverrides`; the SPA reads `build.materialPriceOverrides` and falls back to `layout.materialPriceOverrides` in `frontend/src/Functions/JobDocuments/jobDocument.js` | partly |
| Prerequisite — one place decides `""` versus `"0"` | Landed | One Go function, called by its own two decoders and two other packages, and a second copy in the SPA | `models.ExtrasCategoryOrUnassigned` in `job.go`; callers `core/commands/release_extras_labels.go`, `shared/statistics/archived_job_row.go`; SPA `ExtraCost.categoryOf` in `frontend/src/Classes/extraCost.js` | confirmed |
| Phase 1 `go fix` item | One suggestion outstanding in `core/commands/live_rewrite_owner_scoped_ids_test.go` | Already applied; scan is clean | The file calls `slices.Contains` twice; `go fix -diff ./core/commands/` reports nothing | overstated |
| A1 — upgrader on the job and group read paths | Not started | Not started | `services/shared/mongo/jobs_get.go` and `groups_get.go` call `findOne` / `findAll` and nothing else; `Upgrader.Job` and `.Group` are called only from `services/shared/schemamaint/schemamaint.go` | confirmed |
| A2 — defaults and aliases into the upgrader | Not started; `marketLocation` alias conditional on job-document-drafts Stage 2 | Not started; the condition has resolved | `Upgrader.Job` in `services/shared/documentschema/documentschema.go` clamps the version and fills nothing; `jobFromDocument` still decides every default; no `marketLocation` or `localMarketDisplay` read remains in `jobDocument.js` | understated |
| A3 — what an unset field means | Not started | Not started | `Group.ArchivedJobIDs` has no `omitempty` in `services/shared/models/group.go` | confirmed |
| B1 — slug ids | Not started | Not started | `ExtrasCategoryUnassigned = "0"` in `job.go`; `ExtrasCategoryOther = "5"` and `DefaultExtrasCategories` in `accountDocuments.go`; `extrasCategoriesDefault` and `permanentExtrasCategories` in `frontend/src/Context/defaultValues.jsx` | confirmed |
| B2 — converge the stored rows | Not started; no version bump because live has never held a v1 job | Not started; the stated reason is false | No step in `services/core/commands/prepare_release.go`; `Public:services/worker/tasks/maintenance/schema_version_batch.go` stamps v1 | partly |

### Discrepancies

- **`materialPriceOverrides` is on `JobBuild`, not `JobLayout`.** The prerequisite table describes the
  model before [job-document-drafts](../job-document-drafts/plan.md) Stage 2 moved the field under
  `build`. The defect it records is fixed; the location it names is one release old.
- **The `go fix` item is done.** `live_rewrite_owner_scoped_ids_test.go` already uses
  `slices.Contains`, and a scan of `./core/commands/` is empty. The paragraph in
  [plan.md](./plan.md) under the rules block can go.
- **A2's conditional has resolved.** [plan.md](./plan.md) § Phase A2 says the `marketLocation` alias
  leaves the phase "if that stage lands". It has: job-document-drafts records Stage 2 as "Landed,
  awaiting the window", and `jobFromDocument` no longer reads either name. The plan's opening
  paragraph still lists `marketLocation → localMarketDisplay` among the constructor's aliases.
- **The constructor is not in `frontend/src/Classes/`.** The plan's code-in-scope line names that
  folder. A job's defaults are decided by `jobFromDocument` in
  `frontend/src/Functions/JobDocuments/jobDocument.js`; only the group's are in
  `frontend/src/Classes/group.js`.
- **"Live has never held a v1 job" is wrong.** See § Decisions needed, first entry.
- **"Four server-side paths … each decodes into `models.Job` and writes it back" is three.**
  `core/commands/backfill_archived_at.go` decodes a `models.Job` but writes
  `$set: {"_meta.archivedAt": …}` only, so it materialises no zero. The archive restore
  (`api/v1endpoints/archivedjobs/restore.go`, `BulkUpsertJobs`) and the `schemamaint` drain do write
  the whole struct. `core/commands/job_identity_encode.go` only queues a worker task per account.
  The largest whole-struct writer is not in the list at all: `decodeJobWrite` in
  `api/v1endpoints/jobdocuments/jobWrite.go`, which every SPA save passes through.

## What each remaining step changes

### Phase A1 — the upgrader on the job and group read paths

**Today.** A job reaches its caller exactly as stored.

```go
func (d *Docs) LoadJobByID(ctx context.Context, owner models.Owner, jobID string) (models.Job, error) {
	return findOne[models.Job](ctx, d, "LoadJobByID", bson.M{"_id": OwnerScopedDocumentID(owner, jobID)})
}
```

The account path it is meant to match upgrades and then **writes the document back** when the
version moved (`services/shared/mongo/account_get.go`, `LoadUserAccount`).

**After.** `LoadJobByID`, `LoadJobsByFilter`, `LoadGroupByID` and `LoadGroupsForOwner` run the
upgrader before returning. The plan does not say whether a job read also persists, which is
§ Decisions needed, third entry.

**Work.**

1. Call `Upgrader.Job` in both loaders of `jobs_get.go` and `Upgrader.Group` in both of
   `groups_get.go`. The four API callers (`jobdocuments/getHandlers.go`, `groups/getHandler.go`,
   `groups/getByIDHandler.go`, `archivedjobs/grouprebuild.go`) need no change.
2. A test that a legacy document reaches its caller upgraded, beside
   `services/shared/mongo/live_parity_schema_upgrade_test.go`, which covers users and settings only.
3. Say in the overlay what the read path does **not** cover: the watcher copies `fullDocument`
   into the delivery as a map (`services/core/changestream/watcher.go`, `processChangeEvent`), so a
   job delivered over the websocket is the stored document, never an upgraded one.
4. `documentschema.go` carries in-body comments and doc comments well past two lines; the slice
   that edits it brings them down to the rule.

**Wire.** Additive. `Upgrader.Job` only clamps a version today, so no caller sees a different value
until A2 gives it something to fill.

### Phase A2 — the SPA's defaults and aliases move server-side

**Today.** `jobFromDocument` decides these, on the API path and on the websocket path alike
(`inboundJobDocuments.js` calls it for every delivered document):

```js
metaLevel: itemJson?.metaLevel ?? itemJson?.metaGroupID ?? itemJson?.metaGroup ?? null,
jobStatus: itemJson?.jobStatus || 0,
parentJobs: itemJson?.parentJobs || itemJson?.parentJob || buildRequest?.parentJobs || [],
blueprintTypeID: itemJson?.blueprintTypeID || null,
displayOnPlanner:
  displayFromDoc !== undefined && displayFromDoc !== null
    ? Boolean(displayFromDoc)          // displayOnPlanner ?? isIncludedOnPlanner
    : !includedInGroup || isReadyToSell,
itemsProducedPerRun: itemJson?.itemsProducedPerRun || 0,
```

`Group`'s constructor decides `groupName || "Untitled Group"`, `groupStatus || 0` and
`groupType || 1`. On the server, `Upgrader.Job` and `.Group` fill nothing.

**After.** A release step writes the defaults and resolves the aliases on every stored job; the
upgrader fills the same defaults in memory; the constructor keeps only UI defaults. The plan does
not list which fields are which (its open decision 2).

Four of the constructor's fallbacks read a key `models.Job` does not model: `metaGroupID`,
`metaGroup`, `parentJob` and `isIncludedOnPlanner`. A decoded job has dropped them, so **no
upgrader method can resolve these aliases**; only a step reading raw BSON can. That is the same
wall the owner block met in [shared-planners](../shared-planners/plan.md) § Schema versioning.

```json
{ "jobID": "job-1", "metaGroup": 2, "parentJob": ["job-0"], "isIncludedOnPlanner": true }
```

```json
{ "jobID": "job-1", "metaLevel": 2, "parentJobs": ["job-0"], "displayOnPlanner": true }
```

**Work.**

1. Measure, against a live snapshot, how many documents in `jobs` and `archived_jobs` hold each of
   the four alias keys. The plan's corpus table does not say, and the answer decides whether item 2
   exists.
2. If any exist: a `prepareRelease` step that renames them over raw BSON, after
   `reshapeJobDocumentsStep`, with a dry run and a live-parity test as the other steps have.
3. `Upgrader.Job` fills what a decoded job can state: a nil `ParentJobs` becomes `[]string{}`, and
   likewise the keyed maps, per the rule that an empty collection is stored as its empty form.
4. Remove the matching fallbacks from `jobFromDocument` and `Group`'s constructor, and extend
   `frontend/src/Classes/job.parity.test.js` so the two sides are held to one corpus.
5. Decide `displayOnPlanner` — § Decisions needed, fourth entry.

**Wire.** Migrate-required if the alias keys exist in live (the step renames them); additive
otherwise. Removing the SPA fallbacks is safe only in the same deploy as the step, because a
websocket delivery carries the stored shape.

### Phase A3 — what an unset field means

**Today.** Most late-added fields are already protected: `Protected`, `FiledCostMonth`,
`FiledSalesMonth`, `character_ref`, `LocalPricing`, `MaterialPriceOverrides`, `SellerCharacter` and
`SaleLocationID` all carry `omitempty`. The plan's named exception is real:

```go
ArchivedJobIDs  []string `json:"archivedJobIDs" bson:"archivedJobIDs"`
```

A group decoded without the key and written back by the server stores `archivedJobIDs: null`. The
SPA never causes this; `Group.toDocument` always sends an array.

**After.** Each unprotected field carries a deliberate default or a tag that keeps it absent.

**Work.** A per-field pass over `models.Job` and `models.Group`. For `archivedJobIDs` there may be
nothing to do: [job-groups](../job-groups/plan.md) § What the group document becomes removes the
field, along with `includedJobIDs`, `includedTypeIDs`, `materialIDs`, `outputJobCount`,
`areComplete` and the three linked-id lists.

**Wire.** Additive.

### Phase B1 — slug ids

**Today.** The id space is stated in five places.

```go
const ExtrasCategoryUnassigned = "0"   // services/shared/models/job.go
const ExtrasCategoryOther = "5"        // services/shared/models/accountDocuments.go
// DefaultExtrasCategories(): {ID: "0", Label: "Unassigned"} … {ID: "5", Label: "Other"}
```

```js
export const extrasCategoriesDefault = [{ id: "0", label: "Unassigned", … }, … { id: "5", label: "Other", … }];
export const permanentExtrasCategories = new Set(["0", "5"]);
static categoryOf(category) { if (category == null || category === "") return "0"; return String(category); }
```

`PermanentExtrasCategoryIDs()` is enforced on every planner settings write
(`services/shared/models/planner/settings.go`, `validateExtrasCategories`). No test holds the Go
list and the SPA list to each other.

**After.**

```json
[
  { "id": "unassigned", "label": "Unassigned" },
  { "id": "hauling-service", "label": "Hauling Service" },
  { "id": "jump-freight-service", "label": "Jump Freight Service" },
  { "id": "blueprint-copies", "label": "Blueprint Copies" },
  { "id": "loyal-point-costs", "label": "Loyal Point Costs" },
  { "id": "other", "label": "Other" }
]
```

**Work.**

1. The two Go constants and `DefaultExtrasCategories`.
2. `extrasCategoriesDefault`, `permanentExtrasCategories`, `ExtraCost.categoryOf` and
   `ExtraCost.isCategorised`.
3. `extrasEditor.jsx` hard-codes `"0"` in four places and resolves a label through
   `Number(categoryOf(id))`, which is `NaN` for a slug and only works by its string fallback. It
   reads the constant instead.
4. A parity test between the Go defaults and the SPA defaults, since the lists are static
   configuration held on both sides.
5. Fixtures naming `"0"`: `planner/settings_update_test.go`, `statistics/archived_job_row_test.go`,
   `Zustand/plannerSettings/actions.test.js`.
6. Nothing for `chartAdapters.js`: its `Category ${id}` fallback improves by itself.

**Wire.** Breaking between an old SPA and a new server: a settings `PUT` listing `"0"` and `"5"` is
refused by `validateExtrasCategories`. Ships as one cutover with B2.

### Phase B2 — converge the stored rows

**Today.** After `reshapeJobDocumentsStep`, extras are a map under `build`, not an array under
`build.costs`:

```json
{ "build": { "extrasCosts": {
  "8f1c…": { "id": "8f1c…", "category": "",  "categoryLabel": "", "extraText": "courier", "extraValue": 5000000 },
  "a2d0…": { "id": "a2d0…", "category": "3", "categoryLabel": "Blueprint Copies", "extraText": "", "extraValue": 120000 }
} } }
```

**After.**

```json
{ "build": { "extrasCosts": {
  "8f1c…": { "id": "8f1c…", "category": "unassigned",       "categoryLabel": "Unassigned", "extraText": "courier", "extraValue": 5000000 },
  "a2d0…": { "id": "a2d0…", "category": "blueprint-copies", "categoryLabel": "Blueprint Copies", "extraText": "", "extraValue": 120000 }
} } }
```

and `extrasCategories[].id` likewise in `account_settings` and `planner_settings`.

**Work.**

1. One step in `prepare_release.go`, between `normaliseExtrasAndInventionRows` and
   `dropRetiredStatisticsFields`, which is where
   [shared-planners](../shared-planners/plan.md) § Every open project ships in this window puts it.
   `queueEveryAccountForRebuild` follows, so statistics rows are rebuilt from the slugs.
2. Write it against `build.extrasCosts.<id>.category`. The plan's done-when names
   `build.costs.extrasCosts[].category`, which no longer exists at that point in the list.
3. Cover `planner_settings` in the same step. This is not optional: `backfillPlannerExtrasCategories`
   runs later and merges by id, so a planner still holding `"0"`…`"5"` would gain six slug rows
   beside them.
4. Resolve the label stamp, § Decisions needed, second entry.
5. Walk `reshapeJobCollections`, which is three collections (`job_documents`, `jobs`,
   `archived_jobs`). The plan says "both job collections" and `application_settings`; the settings
   collection is `account_settings` in `services/shared/mongo/names.go`.
6. A dry run and a `live_release_*_test.go`. No backup change is owed: `releaseTouchedCollections`
   in `release_backup.go` already copies the three job collections and both settings collections.
7. Re-measure the 865 unfiled rows against live before the window.

**Wire.** Migrate-required. Idempotent as the plan says: a slug matches neither a digit nor `""`.
No version moves.

## Decisions needed

### The reason no schema version moves

**Question.** Live jobs and groups already hold `schemaVersion: 1`, so does this release still
convert them without a bump?

**Why it is James's call.** The no-bump rule is written into shared-planners, job-groups and this
plan, all on the premise that "`Public` has no `document_schema.go`, so live has never held a v1
document". `Public` has the file at `services/shared/shared/models/document_schema.go` with
`JobSchemaCurrent = 1`, and `services/worker/tasks/maintenance/schema_version_batch.go` stamps it
onto `user_job_documents`, `user_job_groups` and `jobs` on an hourly cron. Correcting a premise
three plans share is not an implementer's edit.

**Options.**

- *Keep no bump, restate why.* Every step selects by the data, as `Upgrader.ApplicationSettings`
  already does. Cost: the version cannot tell a converted document from a missed one, so each step
  needs its own gate or a re-runnable selector.
- *Bump `JobSchemaCurrent` and `GroupSchemaCurrent` to 2.* The maintenance selector then finds what
  a step missed. Cost: `schemamaint` rewrites every job whole, and `decodeJobWrite` stamps the
  current version on every save, so an unconverted document saved once would claim v2 anyway.

**Recommendation.** Keep no bump. The slug conversion is self-detecting and the write stamp makes
the version an unreliable detector regardless. Correct the sentence in all three plans.

**Blocked until decided.** B2's step design, and job-groups Stage B, which rests on the same
sentence.

### Where the slug conversion sits relative to the label stamp

**Question.** `stampExtrasCategoryLabels` runs before the slot B2 was given and resolves an unfiled
row through `ExtrasCategoryOrUnassigned`; once that returns `unassigned`, how does it find a label
in a settings list still keyed `"0"`?

**Why it is James's call.** The slot is fixed in another project's plan, and both fixes change a
step that plan already counts as landed and rehearsed.

**Options.**

- *Convert the two settings collections first, job rows later.* Split B2: settings ids before the
  label stamp, job rows in the planned slot. Two steps, each simple.
- *Leave the order, teach the stamp.* It looks a row up under the id the settings list holds at
  that moment. Keeps one B2 step, at the price of a digit-aware lookup living in a landed step.
- *Stamp `"Unassigned"` in B2 itself.* B2 writes `categoryLabel` for the rows it files. Small, but
  two steps then write labels.

**Recommendation.** Split B2. Each step reads one shape, and the stamp needs no knowledge of the
old ids.

**Blocked until decided.** B2, and the rehearsal that follows it.

### Whether a job read writes the upgrade back

**Question.** Does the job read path persist what the upgrader changed, as `LoadUserAccount` does,
or upgrade in memory only?

**Why it is James's call.** The plan says "match `account_get.go`", which persists. Its open
decision 1 asks about read cost, but the cost is not the upgrade; it is a server write on the
planner's hottest read. `UpsertStructPreservingMeta` leaves `_meta` alone, so such a write changes
a document without moving `_meta.revision`, the counter
[document-write-granularity](../document-write-granularity/plan.md) § Stage A checks.

**Options.**

- *In memory only.* Nothing is written on read; the release step is what changes stored documents.
- *Persist on change.* Stored documents converge without a drain, but every delivery of that write
  reaches every member, and the revision check does not see it.

**Recommendation.** In memory only. It is what the plan's own A2 text says ("the stored documents
are changed by the release step, not by the upgrader"), and it closes open decision 1: there is
nothing to gate.

**Blocked until decided.** A1.

### Which constructor derivations the server owns

**Question.** Of `jobFromDocument`'s fallbacks, which become server defaults and which stay in the
browser? This is the plan's open decision 2.

**Why it is James's call.** `displayOnPlanner` is derived from group membership and readiness, and
[job-groups](../job-groups/plan.md) is changing what membership is. Whether the planner list is a
stored fact or a derived one is a product decision.

**Options.**

- *Server owns absence only.* `jobStatus`, `parentJobs`, `metaLevel`, `blueprintTypeID` and
  `itemsProducedPerRun` move. `displayOnPlanner` stays a stored fact, changed by `jobCommands.js`
  as today. Its derivation is how a new job gets its first value, since `buildJob.js` creates a job
  through `jobFromDocument`, so it stays in the SPA as a creation rule and stops being a read
  default once a measurement shows no stored job lacks the field.
- *Server derives `displayOnPlanner` too.* One rule in Go, but the Go model then needs group
  readiness, which the server does not hold for a job read.

**Recommendation.** Server owns absence only, after work item 1 of A2 has been measured.

**Blocked until decided.** A2.

### Whether `other` stays permanent

**Question.** Does `other` remain in the permanent set? This is the plan's open decision 3.

**Why it is James's call.** It changes what a user may delete in Settings.

**Options.**

- *Only `unassigned` is permanent.* Rows carry their own `categoryLabel`, and deletion is a flag,
  so a deleted `other` still names its history. `ExtrasCategoryOther` then has no reader and goes.
- *Keep both.* No behaviour change; one constant kept for a rule nothing depends on.

**Recommendation.** Only `unassigned`. `ExtrasCategoryOther` is read by
`PermanentExtrasCategoryIDs` and nothing else.

**Blocked until decided.** B1, by one line on each side.

### Who writes the group upgrade

**Question.** Does job-groups Stage B's field removal ride this project's read-path `.Group`
upgrader, or its own release step?

**Why it is James's call.** [job-groups](../job-groups/plan.md) § What this project waits on leaves
it "decided when both are scheduled", and neither plan chooses.

**Options.**

- *A1 lands first.* The group read path is normalised before Stage B changes the shape, and A3 for
  groups reduces to whatever fields survive.
- *Stage B lands first.* Its release step does all of it, and A1 for groups arrives to a document
  with little left to normalise.

**Recommendation.** A1 first. It is four call sites, and it gives Stage B a read path that already
tolerates the old shape during the window.

**Blocked until decided.** The order of A1 against job-groups Stage B; A3's group half.

## Dependencies and order

**Waits on.** The release window in
[shared-planners](../shared-planners/plan.md) § Every open project ships in this window, for B2 and
for A2's rename step. Nothing else: job-document-drafts Stage 2, which A2 was conditional on, is in.

**Waits on this.** job-document-drafts lists "the schema version bump and the read-path upgrader"
as inherited from here; the bump half of that sentence is now void and wants the same correction as
the first decision. job-groups Stage B coordinates with A1. The statistics rows follow B2 through
the rebuild queue, with no change of their own.

**Recommended next slice.** B1 and B2 together, after the first two decisions. They are the only
work here with a deadline: the window is the one moment the ids can change without a drain, and
every other open project's rehearsal runs the same list. A1 is the cheapest slice and can land
beside them. A2 follows its measurement; A3 follows job-groups Stage B.
