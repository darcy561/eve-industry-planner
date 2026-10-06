# Job document drafts — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

## Summary

The project set out to make a change to a job *the field the player changed* — stored as such, held as
such in the editor, undoable as such, and handed to the write path as such. Against the code, the
hard part is done: the job document is reshaped and the conversion is a required `prepareRelease`
step proved on a restored copy of live; the editor runs on a base, a log and a scratch layer over
Immer patches; the `Job` class is gone and `jobArray` holds plain documents; and the log is what the
save sends, field-scoped, through an envelope document-write-granularity built on it. What the plan
says about the save is therefore stale in the other direction — it still describes whole-document
writes as "unchanged by this project".

Two things most need attention. **`layout` has not stopped existing.** Stage 1 deferred its three
view-state fields to Stage 3, Stage 3 is marked landed, and `models.JobLayout`, the `setJobLayout`
command and `toDocument`'s `layout` block are all still there — while the reshape already deletes
`layout` from every stored document, so after the window the first save writes it back. **Stage 2b
has no status at all.** The owner-stated-once and archive-block changes are designed, move stored
paths, want the same window, and appear neither in this plan's status table nor in the
shared-planners list of steps the release carries; by default they will miss it.

Smaller: the what-if layer has a store API and no producer, undo has actions and no control, and a
fourth layer (`held`) now exists that the plan's description of the editor does not name.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---|---|---|---|---|
| Phase 1 | Done | Folder, `contents.md`, plan, overlay, three measurement files, row in section `contents.md` | this folder | confirmed |
| Stage 1 — the removals | Landed | `models.Purchase` has no `TypeID`; `ArchivedJobFeeLine` inlines `ArchivedJobLine` and nothing else; `models.BrokerFee`, `JobCosts`, `JobSale` do not exist | `services/shared/models/job.go` §§ `Purchase`, `JobBuild`; `services/shared/models/archived_job_stats.go` § `ArchivedJobFeeLine` | confirmed |
| Stage 1b — derived setup figures | Closed, nothing to do | `JobSetup` carries `MaterialCount` and `RawTime`, no `EstimatedTime` / `EstimatedInstallCost`; `derivedSetupFields` is the two-field list | `job.go` § `JobSetup`; `services/core/commands/reshape_job_document.go` (`derivedSetupFields`) | confirmed |
| Stage 2 — the reshape | Landed, awaiting the window | `models.Job.Skills`, `JobBuild.{Setup,Materials,ExtrasCosts,InventionEntries}`, `JobMaterial.Purchasing` and `JobESI.{LinkedJobs,MarketOrders,Transactions}` are maps; `MarketOrder.{Fee,SalesTax,FeeDate}`; `InventionEntry.Version` with `InventionEntrySchemaCurrent` and a parity test against `Classes/inventionEntry.js`; `reshape every job document` is the eighth step of `releases`, `required: true`, between the label stamp and the rebuild queue; `tasks reshapeJobDocuments [-write]` is registered; `alreadyReshaped`, `collapse` refusal, `emptyLayout`, `foldBrokerFees`, `mintNegativeTransactionID` all present; SPA `jobFromDocument` reads both shapes | `job.go`; `services/core/commands/prepare_release.go`; `services/core/commands/tasks.go`; `reshape_job_document.go`; `prepare_release_test.go` (position, backup, required guards); `frontend/src/Functions/JobDocuments/jobDocument.js` | confirmed |
| Stage 2b — owner once, archive block | No row in § Stage status; § Stages says "neither is urgent" and wants a window | Not started. `LinkedESIJob`, `MarketOrder`, `Transaction` each carry `CorporationID`, `CorporationRef`, `CharacterID`, `CharacterRef`; `LinkedESIJob.CorporationID` is still `bson:"corporation_id,omitempty"`; `JobMetaData` carries `ArchivedAt`, `ArchivedBy`, `ArchiveProcessed`, `DeletedAt`, `DeletedBy` flat | `job.go` §§ `LinkedESIJob`, `MarketOrder`, `Transaction`, `JobMetaData` | understated — open, and unlisted |
| Stage 2c — extras id a string | Built, a `prepareRelease` step after the reshape, not required | `store every extras and invention row in the shape its model writes` is the ninth step, directly after the reshape, no `required`; `normaliseExtrasAndInventionRows*` and both test files exist; read-side coercion (`extraCostScalarString`, `stringFromDocumentValue`, `UnmarshalBSON` on `InventionEntry`) still present as the plan says it should be until live is clean | `prepare_release.go`; `release_extras_invention_rows.go`; `job.go` | confirmed |
| Stage 3 — base, log, scratch, draft | Landed, every slice | `jobDraftStore.js` holds `base`, `log`, `scratch`, `undone` and derives `draft`; `editSession` is a `usersStore` slice; `jobCommands.js` with `applyCommands`; `useJobDraft`, `useJobActions`, `saveOpenJob`; `documentArrived` is called from `inboundJobDocuments.js` and `restoreSavedJobs`; no `editJobReducer`, no `new Job(` anywhere in production. **But** `layout` is still a stored and edited field (`JobLayout` in Go; `job.layout.setupToEdit` read in `useSelectedSetup.js`, `jobSetupCard.jsx`, `useMaterialsSourcing.js`, written by `setJobLayout` and by `jobCommands.js` lines 457–471; `tabPanel.jsx` reads `job.layout.esiJobTab`); the what-if layer has no producer (`ask` / `askAbout` have no caller outside the store); `speculativeChildJobs` is still its own map rather than scratch entries; `undoStep` / `redoStep` have no control | `frontend/src/Components/Edit Job/Edit Job Hooks/*`; `frontend/src/Zustand/editSession/*`; `job.go` § `JobLayout` | partly |
| Stage 4 — getters become functions | Landed | `jobSelectors.js` with `…Of` forms; no class getters remain to compare against | `frontend/src/Components/Edit Job/Edit Job Hooks/jobSelectors.js` | confirmed |
| Stage 5 — `jobArray` goes plain | Landed | `frontend/src/Classes/job.js` and `jobLens.js` do not exist; `jobDocument.js` exports `jobFromDocument`, `applyRecipeToJob`, `toDocument`, `copyOfJob`; row classes stay (`jobSetup.js`, `jobMaterial.js`, `marketOrder.js`, `brokerFee.js`, …) | `frontend/src/Classes/`; `jobDocument.js` | confirmed |
| § Wire compatibility — `PUT` of a job document | "Unchanged by this project; whole documents until Stage C" | Field-scoped writes have landed: `jobWriteEnvelope` sends `{jobID, revision, document: partial, removed}`, `writeBody` derives the partial from the log's patches, `persistJobChangeToApi` posts a `oneChange` batch; Go `JobWriteBody`, `JobWriteBatch`, `JobSetPaths`; uncommitted work adds `JobDeleteBody` and `deletes` | `frontend/src/Functions/JobDocuments/{jobWriteEnvelope,writeBody,saveJobsViaApi,persistJobDocumentsToApi}.js`; `services/shared/models/job_write.go`; `services/shared/mongo/jobs_put_change.go` | stale — the plan understates what the log already does |
| § Drafting without the lock, § The merge | Design, open | Not started as designed: `useActiveJobReadOnly` still feeds `disabled` in 15 files and `canPersistJobClose` gates the close. Part of the merge design has arrived by another route — see Discrepancies | `frontend/src/Components/Edit Job/Edit Job Hooks/useActiveJobDocumentLock.js` callers; `jobDraftStore.js` §§ `setBase`, `reviewOf` | confirmed as open; design partly realised elsewhere |

### Discrepancies

- **`layout` is still a document field and still edited.** Overlay § Stage 2 says the three fields are
  "the SPA view state Stage 3 retires"; Stage 3 is landed and they are not retired. Worse, the reshape's
  `emptyLayout` deletes `layout` wholesale from stored documents, so every converted job loses
  `setupToEdit` and `esiJobTab` in the window, `useEditJobInitialState` reseeds `setupToEdit` to the
  first setup, and the next save writes `layout` back — the field is removed and reintroduced in one
  release. A second cost: `setJobLayout` runs through `actions.run`, which records to the **log**, so
  selecting a setup card or switching the Building tab marks the job as having unsaved changes and goes
  into the field-scoped save. The plan's own analysis (§ `layout` stops existing) says this is editor
  session state; the code still treats it as a decision.
- **The what-if layer is unreachable.** `ask` and `askAbout` exist in `jobDraftStore.js` and
  `editSession/jobChanges.js`, `leaveScratch` and `keepAsked` beside them, and nothing in
  `frontend/src` calls any of them outside their tests. `speculativeChildJobs` is still a map on the
  session (`editSession/stateDefault.js`, `linking.js`), not a scratch entry, although § Stage 3's
  slices says slice 2 absorbs it. The marker and the "one obvious way out" § A what-if is not a change
  owes do not exist because nothing produces a what-if.
- **A fourth layer exists and the plan does not describe it.** `jobDraftStore.js` holds `held` and
  `settled` beside the three layers: when a document arrives, `setBase` reviews each log entry into
  clean / already done / conflict / gone, keeps the clean ones, drops the done ones, and holds the rest
  with a `restore` so the reader's value stays on screen. `reviewOf`, `keepHeld`, `dropHeld`,
  `settleReview` and the `ChangeReviewDialogue` / `IncomingSaveNotice` components are built on it. That
  is § The merge, when the lock frees — its four outcomes, per command — realised for an *arriving
  document* rather than for a lock hand-over, built under
  [document-write-granularity](../document-write-granularity/overlay.md) § Stage D. § Settled's
  sentence that "per-field inline accept-or-reject for competing edits is not built, and nothing
  prompts mid-edit" is no longer true: a notice appears mid-edit and the dialogue offers *Keep mine* /
  *Take the incoming save* per command. § How a job is held while it is open should name the layer.
- **The save is field-scoped, and the plan says it is not.** § Wire compatibility ("the client keeps
  sending whole documents until Stage C"), § What this project inherits (Stage C "neither is useful
  alone"), and overlay § Stage 3 ("the job is still written whole on save") all predate
  document-write-granularity Stage C landing. The log's `patches` are what `writeBody` turns into the
  partial document and the `removed` paths.
- **Stage 2b has no status row.** § Stages gives it a section and § Wire compatibility lists both of
  its changes as migrate-required, but § Stage status does not mention it, and shared-planners
  § Every open project ships in this window lists only the reshape and the extras normalisation for
  this project. Nothing says whether it ships.
- **Plan text that contradicts landed code.** § Stage 2 still says "the keying stops at the document
  boundary … the in-memory shape does not change here", where the overlay and `jobFromDocument` show
  the SPA holding keyed maps; the slice 5e row says the lens "lives in `jobLens.js`", which Stage 5
  deleted; the Stage 3 status row ends "Next: Stage 4". § What the end-of-project sweep found says
  `appliedRequirementID` is still written and carried — it is not: no occurrence remains in
  `services/` or `frontend/src`, so that finding has since been taken (stored residue is left in
  setups the reshape does not prune, and goes on the next whole write of `build.setup`).
- **Two measurements the inventory asked for were never taken**: document size before and after the
  removals, and renders per keystroke on a real job (measurements/inventory.md § Still to measure).
  Neither gates anything now, but the render figure is the one Stage 3 was "judged against".

## What each remaining step changes

Landed stages — 1, 1b, 2 (code), 2c (code), 4, 5 — are described in [overlay.md](./overlay.md) and
are not repeated here.

### Stage 2 — running it: the window, then the compatibility reads

**Today.** The conversion is built and rehearsed. `jobFromDocument` still reads the pre-reshape paths
so a document written before the window loads:

```js
// frontend/src/Functions/Job/jobDocument.js — today
extrasCosts: keyRowsBy(build?.extrasCosts ?? build?.costs?.extrasCosts, "id", …),
sellerCharacter: build?.sellerCharacter ?? build?.sale?.plan?.sellerCharacter ?? null,
localPricing: jobPricingOverride(build && "localPricing" in build ? build.localPricing : itemJson?.layout?.localPricing),
// esiRows(): esi?.marketOrders ?? sale?.marketOrders, then folds sale?.brokersFee rows onto orders
// through Classes/brokerFee.js; esi?.industryJobs ?? object?.build?.costs?.linkedJobs
```

**After.** The same function reads one shape: `build.*`, `esi.*`, no `layout.*` fallback, no
`brokersFee` fold. `Classes/brokerFee.js` keeps `fromJournalEntry` for new fees and loses the
row-constructor path.

**Work.**
1. Before the window: run `tasks reshapeJobDocuments -database=<restored copy>` without `-write` and
   read the refusal and collapse counts against the row-key figures in
   [measurements/row-key-uniqueness.md](./measurements/row-key-uniqueness.md); re-take the extras and
   invention counts the same way. Both are operator paths that exist.
2. In the window: `prepareRelease`, with the reshape and extras steps already in order.
3. After the release is confirmed: remove the fallbacks in `jobFromDocument` and `esiRows`, the
   `BrokerFee` row-constructor fold, and the tests that exercise the old shape.
4. In the same pass, remove the per-job selling override's fallback read of `build.sale.plan` in
   `frontend/src/Functions/Job/jobDocument.js` —
   `build?.sellerCharacter ?? build?.sale?.plan?.sellerCharacter ?? null` and the matching
   `saleLocationID` line — leaving `build.sellerCharacter` and `build.saleLocationID` read alone. The
   fields' meaning is planning-stage-panels' Stage L; only the read of their old place is this
   project's.

**Wire.** The conversion is migrate-required and already in the step; `revertRelease` restores from
the `_pre_0_9_0` copies. Removing the fallbacks afterwards is internal to the SPA.

### Stage 3, the unfinished half — `layout` stops existing

**Today.**

```go
// services/shared/models/job.go
Layout JobLayout `json:"layout" bson:"layout"`

type JobLayout struct {
	ESIJobTab           string `json:"esiJobTab,omitempty" bson:"esiJobTab,omitempty"`
	SetupToEdit         string `json:"setupToEdit,omitempty" bson:"setupToEdit,omitempty"`
	ResourceDisplayType string `json:"resourceDisplayType,omitempty" bson:"resourceDisplayType,omitempty"`
}
```

```json
{ "layout": { "setupToEdit": "a1f0…", "esiJobTab": "1" } }
```

In the SPA `toDocument` writes the block, `setJobLayout` patches it into the log, `attachNewSetupToJob`
and `deleteActiveSetup` write `job.layout.setupToEdit` (`jobCommands.js` lines 457–471),
`selectedSetup(job)` and `selectedSetupOf(setups, setupToEdit)` read it, `tabPanel.jsx` reads
`esiJobTab`, and `useEditJobInitialState` seeds `setupToEdit` to the first setup when absent. The reshape
deletes the stored block.

**After** (from [plan.md](./plan.md) § `layout` stops existing).

```go
// models.Job — no Layout field; JobLayout deleted
```

```json
{ "build": { "setup": { … } } }
```

`esiJobTab` is read from `applicationSettings.esiJobTab`, which already exists
(`frontend/src/Zustand/applicationSettings/core.js`). `setupToEdit` becomes a field on the
`editSession` slice — `selectedSetupID` or the like; the plan does not name it — set on open to the
first setup and by the setup card, never recorded to the log. `resourceDisplayType` goes.

**Work.**
1. Add the selection field and its action to `editSession`; `useSelectedSetup`, `selectedSetup`,
   `useMaterialsSourcing`, `useChildJobBuildActions` and `jobSetupCard` read it from the session.
2. `attachNewSetupToJob` and `deleteActiveSetup` take the setup id they act on as an argument (or the
   caller selects after the command), so the commands stop writing `layout`.
3. `tabPanel.jsx` reads and writes `applicationSettings.esiJobTab`; `setJobLayout` is deleted.
4. `toDocument` and `jobFromDocument` drop `layout`; `applyRecipeToJob` stops setting
   `job.layout.setupToEdit`; `useEditJobInitialState` stops seeding it.
5. Remove `Layout` from `models.Job` and delete `JobLayout`; adjust `job_model_parity_test.go`.
6. Tests: a selection change records nothing to the log and does not arm the unsaved-changes prompt;
   reopening a job selects the first setup.

**Wire.** Removal of a field. The stored block is already dropped by the reshape, so no further
migration; the SPA and API should drop it in the same deploy so the first post-window save does not
write `layout: {}` back. Behaviour change the plan already accepts: reopening a job selects the first
setup, and `setupToBuildFrom` falls back to it.

### Stage 3 — the what-if layer needs a producer, a marker and a way out

**Today.** `ask(state, jobID, command, recipe)` records to `scratch`; `leaveScratch` drops it;
`keepAsked(seq)` promotes an entry into the log at its place in the order. The slice exposes
`askAbout`. No control calls any of them. `speculativeChildJobs` is costed into its own map.

**After** (from § A what-if is not a change and § The worked case). The stepper's "step back to look"
and any control that sets a figure to see the outcome call `askAbout(command)`; a marker travels with
the reader while `scratch` is non-empty, with one control to leave it and one to keep what was asked;
speculative child job costing is either an `ask` of its own or is explicitly left as the map it is.

**Work.** The producer (the stepper and whichever Planning controls are chosen), the marker component
on the frame, `leaveScratch` and `keepAsked` controls, and a decision on `speculativeChildJobs` —
§ Decisions needed.

**Wire.** None; scratch never leaves the browser.

### Stage 3 — undo gets a control

**Today.** `undoStep`, `redoStep`, `nextUndo`, `nextRedo` on the session; `TYPING_COALESCE_MS = 800`;
undo reaches held changes. Nothing presses them.

**After.** A control on the editor frame naming the step (*Undo: link market order*) and a keyboard
binding; disabled when `nextUndo` is null.

**Work.** One component on `editJob.jsx`, its render-count test, and an end-to-end mutator case that
undoes through the control rather than the action.

**Wire.** None.

### Stage 2b — an owner once, and the archive block

**Today.**

```go
// services/shared/models/job.go — every one of LinkedESIJob, MarketOrder, Transaction
CorporationID  int    `json:"corporation_id,omitzero" bson:"-"`                      // LinkedESIJob: bson:"corporation_id,omitempty"
CorporationRef string `json:"-"                       bson:"corporation_ref,omitempty"`
CharacterID    int    `json:"character_id,omitzero"   bson:"-"`
CharacterRef   string `json:"-"                       bson:"character_ref,omitempty"`
IsCorporation  bool   `json:"is_corporation"          bson:"is_corporation"`         // Transaction: IsCorp / is_corp

// JobMetaData
ArchivedAt       time.Time `json:"archivedAt,omitzero"       bson:"archivedAt,omitempty"`
ArchivedBy       string    `json:"archivedBy,omitempty"      bson:"archivedBy,omitempty"`
ArchiveProcessed bool      `json:"archiveProcessed,omitzero" bson:"archiveProcessed,omitempty"`
DeletedAt        time.Time `json:"deletedAt,omitzero"        bson:"deletedAt,omitempty"`
DeletedBy        string    `json:"deletedBy,omitempty"       bson:"deletedBy,omitempty"`
```

**After.** The plan states the rule — one id and one ref read through the flag, and a `_meta` block
absent until a job is archived — and does not name the fields. A shape consistent with it:

```json
{ "esi": { "marketOrders": { "6001": { "is_corporation": true, "owner_id": 98000001, "…": "…" } } } }
```
stored as `owner_ref`, with `IsCorporation` saying which entity kind it is; and

```json
{ "_meta": { "owner": { "…": "…" }, "revision": 12,
             "archive": { "archivedAt": "…", "archivedBy": "acc…", "processed": true } } }
```

**Work.** For the owner: the three structs and `jobidentity`'s declaration; `MarketOrder.toDocument`
and every SPA reader of `corporation_id` / `character_id` (71 and 15 files by the plan's count); a
conversion step. For the archive block: `putHandler` (stamp), `restore` (clear), `archivelist.go`
(`sort=archivedAt` maps onto `_meta.archivedAt` today, so the mapping and the filter move), the
`backfill_archived_at` command, one index, the statistics rota's read, and a conversion step.

**Wire.** Owner: **breaking** for the client — the field names change — so SPA and API deploy
together, and the stored change is migrate-required. Archive block: **migrate-required**, server-only
except the `sort` parameter's target, which is unchanged on the wire. Neither step exists in
`prepareRelease` and neither is in shared-planners' owed-steps table.

### Stage 2c — retiring the coercion after live is clean

**Today.** `extraCostScalarString`, `extraCostScalarFloat64`, `stringFromDocumentValue`,
`inventionEntryVersion`, and the `UnmarshalBSON` / `UnmarshalJSON` methods on `ExtraCost` and
`InventionEntry` absorb numeric ids and mistyped scalars.

**After.** Plain struct decoding; `ExtraCost` and `InventionEntry` become ordinary value types; the
`case json.Number` branches go with them.

**Work.** After the release: confirm the step reported zero rewrites on a second dry run against live,
remove the BSON side; after the SPA deploy has been live long enough that no pre-release bundle is
writing, remove the JSON side.

**Wire.** BSON side: none. JSON side: **breaking** for a stale client only.

### Drafting without the lock, and the merge when it frees

**Today.** A non-holder's controls are `disabled` through `useActiveJobReadOnly` (15 files) and the
close is refused by `canPersistJobClose`. The mechanics the merge needs already run for arriving
documents: `setBase` reviews the log per command and holds conflicts; `reviewOf` groups them;
`ChangeReviewDialogue` lets the reader choose. shared-planners § Stage K (not started) decides that an
expired lease "keeps the editor's changes in the open editor as the held layer of the draft store" and
rebases them through the same panel.

**After** (from §§ Drafting without the lock, The merge, Drift is the cost). Fields editable for a
non-holder with the holder named; the save affordance reads *merge when free*; the first change joins
the waitlist (the plan's leaning); drift is shown as it happens; taking the lock runs the review that
`setBase` already performs and saves through the ordinary path.

**Work.** Narrow `useActiveJobReadOnly` to the commit path; a holder-aware save control; the waitlist
join; a drift indicator (the `IncomingSaveNotice` covers conflicts and gone changes, not clean
re-applies); tests across two sessions, which Stage K also lists as owed and which do not exist.

**Wire.** None on this side; it rides whatever Stage K does to the lock.

## Decisions needed

### Does Stage 2b ride the shared-planners window?

**Question.** Do the owner-once and archive-block changes ship in this release, or wait for the next
one that migrates documents?

**Why it is James's call.** The plan says the window is the only cheap time to move a stored path and
also says neither change is urgent; shared-planners' owed-steps table does not list them; the owner
change is a client-visible rename across dozens of SPA files that has to deploy with the API; and
document-write-granularity § Open questions names the `LinkedESIJob.CorporationID` tag asymmetry as
belonging "to whoever owns the cipher", while this plan claims it under Stage 2b and entity-id-encryption
§ How a converted document is recognised still describes it at the pre-reshape path
`build.costs.linkedJobs[].corporation_id`.

**Options.**
- *Both now.* One release carries every stored-shape change. Cost: the SPA rename lands on a branch
  that is already carrying every other project's work, and the window has one more required step.
- *Archive block now, owner later.* The archive block is server-side and small (one index, one sort
  mapping, two handlers, the rota). The owner change waits. Cost: the id/ref pair stays four fields
  for another release, and the `bson:"corporation_id,omitempty"` asymmetry stays unless fixed alone.
- *Neither now.* Both wait, as the plan allows. Cost: the next migration window is unscheduled.

**Recommendation.** Archive block now; owner change deferred; and fix the `LinkedESIJob.CorporationID`
tag on its own in this window — once entity-id-encryption's conversion has cleared the stored
`corporation_id` values, `bson:"-"` is the correct tag and needs no SPA change. Record in all three
plans which project owns that line.

**Blocked until decided.** Writing either step into `prepareRelease`; the shared-planners owed-steps
table; the rehearsal that has to run the whole sequence.

### Where does `setupToEdit` live, and does `layout` go before the window?

**Question.** Is the editor's selected setup session state (the plan's answer) or a stored job field
(what the code does), and is the `layout` retirement done before the window so the reshape's drop is
not undone by the first save?

**Why it is James's call.** It changes what a click does: today selecting a setup card marks the job
modified and is sent on save; under the plan it does neither. It also changes reopening behaviour. And
the two Planning commands that write `setupToEdit` have to take a selection from somewhere.

**Options.**
- *Retire `layout` before the window, selection on the session.* Matches the plan; `Layout` leaves
  `models.Job`; the reshape's drop is final. Cost: a slice across Go and SPA before the release.
- *Keep `layout` as it is, correct the plan.* Cheapest; the reshape should then stop deleting the
  block (or the plan accepts that every converted job forgets its tab and selection once). Cost: view
  state keeps riding the log and the field-scoped save, and the plan's own analysis is reversed.
- *Retire after the window.* The field is removed by the reshape, reintroduced by the first save, and
  removed again later. Two shape changes for one field.

**Recommendation.** The first. The `emptyLayout` step already commits the release to a document
without `layout`; the SPA and model should agree with it before it runs.

**Blocked until decided.** The slice above; whether `jobCommands.js` lines 457–471 change signature.

### Is the what-if layer a feature of this release, or provision?

**Question.** Does a producer, a marker and a way out get built now, or is `scratch` recorded as
provision like undo, with `speculativeChildJobs` kept as its own map?

**Why it is James's call.** § The worked case (stepping a built job back to look) is a product
behaviour nobody can see today; building it changes the stepper, and leaving it means the plan's
"slice 2 absorbs `speculativeChildJobs`" claim is withdrawn rather than finished.

**Options.**
- *Build the worked case.* Stepper back-to-look through `askAbout`, marker on the frame, leave/keep
  controls. Cost: UI work and the marker design on a page planning-stage-panels is redrawing.
- *Record as provision.* `ask` and friends stay, tested as a pure module; `speculativeChildJobs` stays
  a map, stated as deliberate. Cost: the layer has no user until someone returns to it.
- *Remove the scratch API.* Cost: the layer the design was built around goes, and the modified-flag
  rule it decides (log non-empty, never draft differing from base) would need restating.

**Recommendation.** Record as provision now, in the same wording the plan uses for undo, and fold the
`speculativeChildJobs` sentence back to "kept as its own map". Build the worked case when the Planning
redesign gives the marker a home.

**Blocked until decided.** Overlay § Stage 3 wording; whether `leaveScratch` / `keepAsked` get tests
through a control.

### Does undo ship a control in this release?

**Question.** Is an undo/redo control added to the editor frame before the window?

**Why it is James's call.** The plan allowed undo to land "whether or not the UI ships in it"; the
actions are proved as a module and nothing presses them, and the control's copy (*Undo: link market
order*) is user-facing text.

**Options.** Ship a toolbar control plus keyboard binding now; or defer and keep the actions as
provision.

**Recommendation.** Ship it; it is one component and is the feature the log was designed for, and the
held layer means undo now also answers an incoming conflict, which readers will want a way to reach.

**Blocked until decided.** Nothing else.

### Who owns editing without the lock?

**Question.** Does § Drafting without the lock stay a stage of this project, move into shared-planners
Stage K, or get dropped now the held layer and review exist?

**Why it is James's call.** Three plans touch it: this one designs it, shared-planners § Stage K
decides lease and hand-over behaviour and names the held layer as where an expired lease's changes
go, and document-write-granularity § Stage D settled that the lock is not advisory. The open question
*Is a drafter a waitlist entry?* is really a Stage K question — its hand-over protocol decides what
"joining the queue" means.

**Options.**
- *Move it to Stage K.* One plan describes the lock between two people, including what a non-holder
  may do. Cost: this plan's §§ Drafting / Merge / Drift become a pointer.
- *Keep it here as a Stage 6*, waiting on Stage K's protocol. Cost: two plans keep describing one
  mechanism from two sides.
- *Drop it.* The expired-lease case Stage K designs covers the lapsed-lease bug the plan said drafting
  also fixes; deliberate drafting against a held job is not built. Cost: a feature the plan argues for.

**Recommendation.** Move it to Stage K, and close *Is a drafter a waitlist entry?* and *What does a
collision do to a drafter at merge time?* here — the second is answered by `reviewOf` and the review
panel, and the first belongs to the hand-over design.

**Blocked until decided.** Any narrowing of `useActiveJobReadOnly`; Stage K's two-member tests.

### Which recorded defects are taken, and when?

**Question.** The plan records four defects it found and did not fix: `LinkedTransactionIDs` returning
hand-entered ids (`job.go`, unfiltered today), `estimatedMaterialCost` multiplying a total by the
requirement, `findFacilityTax`'s unreachable NPC-station branch, and `Setup.gatherRequirements` never
gathering the rig's requirement. Which are taken, and by whom?

**Why it is James's call.** Two change saved figures (the rig requirement through `materialCount`; the
fee-less transaction filter through the account's linked set), one is a pricing rule, and one is a
product rule about NPC station tax. None is this project's to decide alone.

**Options.** Take the two that change no stored figure now (`LinkedTransactionIDs` filter through
`IsMarketTransactionID`; the NPC branch either deleted or made to work); route the two that move
figures to the project that owns the formula.

**Recommendation.** Filter `LinkedTransactionIDs` and its SPA counterpart now — it is one line each
and `IsMarketTransactionID` already exists for it; leave the other three recorded, with an owner named
in the plan.

**Blocked until decided.** Nothing in this project; the figures that would move.

### Close the open question on which surfaces show the draft

**Question.** Is "base everywhere except the editor" settled?

**Why it is James's call.** It is the plan's leaning and it is what the code does — the planner reads
`jobArray`, the editor reads the draft — but the leaning also proposed marking the planner row as
having unsaved changes, which is not built.

**Recommendation.** Settle it as the code stands and drop the row marker unless a reader asks for it.

**Blocked until decided.** The § Open questions entry.

## Dependencies and order

**This project waits on** the shared-planners release window for Stage 2 and 2c to run, and on
shared-planners § Stage K for anything about editing without the lock. document-write-granularity
Stages A–E, which the plan lists as inherited assumptions, have all landed: the revision exists and is
checked, the write is field-scoped from this project's log, and deltas are applied onto the plain
`jobArray` Stage 5 produced. document-defaults Phase A2's `marketLocation` alias has left its scope as
the two plans agreed — `jobFromDocument` no longer reads it, and `emptyLayout` folds it once.

**What waits on this project.** document-write-granularity Stage C's cutover is tied to the reshape
("a path-scoped write into an un-reshaped document writes a key that means nothing"); job-groups
Stage A's membership step is ordered after the job reshape; document-defaults Track B's step is
ordered after the extras normalisation. None of those is held up by anything still open here.

**Recommended next slice.** Retire `layout` before the window — the model field, the command, the
`toDocument` block and the selection moving onto `editSession` — because the release already deletes
the stored block and the half-finished state is the only part of this project that the window will
make worse rather than better. Then settle Stage 2b's window question so the rehearsal runs the final
step list. After the release: the compatibility reads in `jobFromDocument`, the Stage 2c coercions, the
plan text that still describes whole-document saves, and the § Settled paragraph the review panel
overtook.
