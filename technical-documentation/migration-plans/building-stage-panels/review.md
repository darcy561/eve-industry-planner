# Building stage panels — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).
Nothing under `frontend/src/Components/Edit Job/Edit Job Components/Building/` is modified in the
working tree, so the committed code is what was read.

## Summary

The project replaces the Edit Job Building stage's two tabs of cards with one checklist led by the slots
each setup planned, a schedule of when runs are due, and a match between a linked run and a setup.
**Stage A is in, exactly as the plan says, and nothing after it has been started** — the stage a reader
sees today is still an information panel of three ISK figures, two tabs, and the setup strip borrowed
from Purchasing. The plan is honest about that.

Two things need attention before Stage B is picked up:

1. **Two of this plan's later stages lean on Purchasing work that has not been built.** The Job costs
   panel and the setup table are [purchasing-stage-panels](../purchasing-stage-panels/plan.md) § Stage I,
   which is *Not started*.
2. **The plan schedules the removal of `layout.esiJobTab`, but another project has already taken it.**
   The release reshape deletes the whole `layout` bag from stored job documents.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---------------|-----------|----------------|----------|---------|
| Phase 1 — folder and docs | Done | Folder, `contents.md`, `plan.md` with the rules block, `overlay.md` scaffold, a measurement, and a row in the section `contents.md` | this folder; `../contents.md` | confirmed |
| A — one row component | Landed | One card, one list, one row model; one status map; characters resolved in the row model; writes on press; duplicate getters gone; the switch gone; 26 test cases | `Building/StandardLayout/Tab Panel/runRows.js` (`availableRunRows`, `linkedRunRows`, `STATUS_COLOURS`), `industryRunCard.jsx`, `industryRunList.jsx` (`useLeavingRows`), `availableJobs.jsx`, `linkedJobs.jsx`; `Classes/linkedESIJob.js` holds fields, `fromESI`, `applyLatest`, `toDocument` and nothing else; `Building/layoutSelector.jsx` has no `switch`; commit `b92a23b40` (2026-09-22) | confirmed |
| B — one grouping rule | Not started | `industryRunList.jsx` maps one card per row inside a grid with `overflowY: "auto"` and a `maxHeight` of 240px at desktop width; no group construct anywhere | same file | confirmed |
| C — Progress | Not started | `Information Panel/informationPanel.jsx` still prints Total Material Cost, Total Install Costs and Estimated Cost Per Item from `useBuildCost`; `nextRunToFinish` / `lastRunToFinish` exist in `Edit Job Hooks/jobSelectors.js` and are read only by the Groups cards | `informationPanel.jsx`; `Components/Groups/Accordion/Classic View/JobCards/groupStep3.jsx` | confirmed |
| D — setups, slots and the match | Not started | A run is matched on `product_type_id === itemID` and nothing else; the only setup-to-reality figure is `linkedJobCount/totalJobCount` in a tab label | `Functions/IndustryJobs/findIndustryJobsForItem.js`; `Tab Panel/tabPanel.jsx` | confirmed |
| E — the offers block | Not started | `tabPanel.jsx` still renders two `Tab`s and still reads and writes `layout.esiJobTab` through `setJobLayout` | `tabPanel.jsx` | confirmed |
| F — the owner filter | Not started | No owner-filter field in `Zustand/applicationSettings/core.js` or on `models.ApplicationSettings`; `is_corporation` only draws the corporation avatar | `industryRunCard.jsx`; `services/shared/models/accountDocuments.go` | confirmed |
| G — which clock a time is in | Not started | The only zone lookup in the SPA is `Functions/Endpoints/Public/feedback.js`; `numberParser.js` has `formatTimeRemaining` and no absolute-time formatter; `layoutSettingsFrame.jsx` carries two switches | those three files | confirmed |
| H — mobile | Not started | `Building/Mobile Layout/mobileLayout.jsx` returns `null`; `layoutSelector.jsx` always renders the standard layout | those two files | confirmed |

### Discrepancies

Every status row is confirmed. What follows is where the plan's text, rather than its status, is out of
step with the code or with another project.

- **Wire compatibility row for `layout.esiJobTab`.** [plan.md](./plan.md) § Wire compatibility says the
  job-level field is "to be dropped with the tabs, at Stage E". The stored field is already another
  project's: [job-document-drafts](../job-document-drafts/plan.md) § `layout` stops existing removes the
  whole bag, and `emptyLayout` in `services/core/commands/reshape_job_document.go` deletes `layout` from
  every stored job at release — `TestEmptyLayout_movesThePricingDecisionAndDropsTheRest` names
  `esiJobTab` among the dropped fields. Meanwhile `models.JobLayout.ESIJobTab`
  (`services/shared/models/job.go`), `Functions/JobDocuments/jobDocument.js` and `tabPanel.jsx` still
  carry and write it. So the release strips a field the SPA writes straight back. See § Decisions needed.
- **Stage A left comments the repository rule forbids.** The code is correct; the prose around it is
  not to the two-line rule. In-body comments remain at `tabPanel.jsx` lines 15 and 25 and
  `industryRunList.jsx` lines 67–68, and the doc comments on `runRows.js` (file header, `STATUS_COLOURS`,
  `availableRunRows`, `linkedRunRows`), `industryRunCard.jsx`, `industryRunList.jsx`, `availableJobs.jsx`,
  `linkedJobs.jsx` and `linkedRunSelectors.js` run past two lines of prose.
- **Stage G says "checkbox"; the frame it joins uses switches.** `layoutSettingsFrame.jsx` draws
  `displayHelpCards` and `enableCompactLayoutView` as MUI `Switch` inside `FormControlLabel`. A third
  control beside them should match, whatever the plan calls it.
- **"The shared components this stage reuses" do not exist yet.** [contents.md](./contents.md) § Does
  not own lists the worklist row, the muted destructive control, the Job costs panel and its setup table
  as Purchasing's. Every stage of [purchasing-stage-panels](../purchasing-stage-panels/plan.md) is
  *Not started*, and the Building stage still imports
  `Purchasing/Standard Layout/JobSetupInfo/JobSetupInfoFrame.jsx`, the card strip that panel replaces.

## What each remaining step changes

Stage A is landed; behaviour is in [overlay.md](./overlay.md) § Drawing a run.

Every remaining stage reads the row Stage A produces, so that shape is the starting point for all of
them. It is a typedef in `runRows.js`, built per run and never stored. Field names are the code's;
values here and in the examples below are illustrative:

```js
/** RunRow, as availableRunRows and linkedRunRows return it today */
{
  key: "run-123456789",
  run,                    // the ESI row, or the stored LinkedESIJob
  owner,                  // account character, or null on a linked run nobody can name
  blueprintTypeID: 1234,
  blueprintType,          // what findBlueprintType returns for the run's blueprint
  facilityName: "Sotiyo — Example",
  statusLabel: "Ready for Delivery",   // or Active, Delivered, Cancelled
  statusColour: "info",                // warning, success, error
  progress: 100,
  readyToDeliver: true,
  timeRemaining: null,    // a formatted string only while active
  installCost: 1250000,   // null on an offered run
}
```

### Stage B — one grouping rule

**Today.** `IndustryRunList` receives `rows` and draws one `IndustryRunCard` per row in a scrolling
grid. Thirty linked runs are thirty cards in a 240px window.

**After.** Every list is a list of groups, and a group of one draws as a plain row. The plan fixes the
keys — run count, facility, character, ownership, status — and that due times show as a range; it does
**not** fix the shape of a group. A shape consistent with the plan and with `RunRow`:

```js
/** One group of runs that agree on every key. Shape proposed here; the plan leaves it open. */
{
  key: "runs-10|1039999999999|hash-abc|corp|active",
  rows: [/* RunRow, RunRow, … */],
  count: 12,                       // drawn as ×12; 1 draws as an ordinary row
  runs: 10,
  facilityName: "Sotiyo — Example",
  owner,
  isCorporation: true,
  statusLabel: "Active",
  statusColour: "warning",
  dueFrom: 1760000000000,          // earliest finishesAt in the group
  dueTo: 1760003600000,            // latest
}
```

The same function serves the schedule (bucketed by hour) and the setup table (keyed on structure,
system, ME/TE, run count and install cost).

**Work.**
1. A pure grouping function beside `runRows.js`, taking rows and a key list, with a corpus of cases: a
   group of one, a row differing on one key, runs landing either side of an hour.
2. A group row built on `IndustryRunCard`'s content — a count, a due range, and an open state.
3. Remove `overflowY` and `maxHeight` from the list, since a grouped list no longer needs its own scroll.
4. Bring the Stage A files' comments to the two-line rule as they are edited.
5. Fill [overlay.md](./overlay.md) § Grouping a list.

**Wire.** Client only. Nothing stored, nothing sent.

### Stage C — Progress

**Today.** `InformationPanel` shows three ISK figures from `useBuildCost`. No date appears on the stage.

**After.** A Progress panel headed by what is ready to collect, then when the next and last runs land,
with the absolute time and the relative beside it, runs within one hour on one line. It reads the
selectors that already exist:

```js
import { nextRunToFinish, lastRunToFinish } from "../../Edit Job Hooks/jobSelectors";
// const next = useJobDraft(nextRunToFinish); const last = useJobDraft(lastRunToFinish);
```

The three ISK figures move to the Job costs panel.

**Work.**
1. The Progress panel and its hour-bucketed schedule, using Stage B's grouping function.
2. A destination for the three cost figures — see § Decisions needed, *Who builds the Job costs panel*.
3. Delete `Information Panel/informationPanel.jsx` and its test once the figures have a home.
4. The absolute times need Stage G's formatter; land G first or with it.

**Wire.** Client only.

### Stage D — setups, slots and the match

**Today.** Nothing relates a run to a setup. `findIndustryJobsForItem` offers every ESI run whose
`product_type_id` is the job's item, and the fill is one number in a tab label. The two sides carry:

```js
// A setup (Classes/jobSetup.js toDocument), trimmed to what a match can read
{ id: "setup-1", jobCount: 5, runCount: 10, ME: 10, TE: 10,
  structureID: 0,            // the id of a size class: NPC Station, Medium, Large, X-Large, The Fulcrum
  systemID: 30000142,
  customStructureID: "" }    // "" unless the setup names a saved structure

// A linked run (Classes/linkedESIJob.js toDocument), trimmed the same way
{ job_id: 123456789, runs: 10, station_id: 1039999999999,
  is_corporation: true, corporation_id: 98000001, character_id: 90000001,
  status: "active", start_date: "…", end_date: "…" }
```

**After.** A section per setup with a slot strip of `jobCount` ticks, an empty slot drawn as a row, and
each linked run placed by the best comparison its setup allows — the three fidelities in
[plan.md](./plan.md) § Stage D. Setups a run cannot tell apart are pooled into one section naming both.
The plan does not give the match a shape; one that carries what the section needs:

```js
/** Result of matching, per section. Proposed; the plan specifies the rule, not the structure. */
{
  setupIDs: ["setup-1"],            // more than one when setups are pooled
  fidelity: "exact",                // "exact" | "system" | "runs"
  slots: 5,
  filled: [/* RunRow */],
  empty: 2,
}
```

**Work.**
1. A pure matcher: setups and linked runs in, sections out, with a corpus covering each fidelity, a
   pooled pair, and a run no setup planned.
2. Resolve a run's facility to a solar system for the System fidelity, through the existing
   location-names cache rather than a new lookup.
3. Read a custom structure's `stationID` / `structureID` and `name` from what
   [frontend/settings/custom-structures.md](../../frontend/settings/custom-structures.md) already resolves.
4. Section header, slot strip, and the empty-slot row.
5. Fill [overlay.md](./overlay.md) § Setups, slots and matching a run to one.

**Wire.** Client only. The exact-on-every-path alternative — a setup id written on the run at link
time — is additive and is § Handed on, not this stage.

### Stage E — the offers block

**Today.** Offers are the *Available* tab; `Link All Jobs` links every drawn row; the tab last left open
is written to `layout.esiJobTab` on every change.

**After.** One block outside every setup. Rows that fill an empty slot are open; the rest fold behind a
disclosure that names why they do not fit. The bulk action is named for its count ("Link the 3") and
reaches only the open band. `tabPanel.jsx`, the `TabContext`, and the read and write of `esiJobTab` go.

**Work.**
1. The offers block, reading Stage D's sections to say which setup a row would fill.
2. The fold and its reasons: beyond a full setup, a run count no setup planned, a structure no setup
   builds at, completed before this job existed.
3. Delete `tabPanel.jsx` and stop calling `setJobLayout({ esiJobTab })`; update
   `editJobMutators.building.test.jsx`, which asserts on that field.
4. Settle who removes the field from the model — § Decisions needed.

**Wire.** Client only for this project. A stored `layout.esiJobTab` is already removed by the release
reshape.

### Stage F — the owner filter

**Today.** `models.ApplicationSettings` has no such field; `hideCompleteMaterials` is the precedent the
plan names (`HideCompleteMaterialsFromEditJob bool` with tag `hideCompleteMaterials`, toggled in
`Zustand/applicationSettings/preferences.js`, debounced-saved).

**After.** One field with a default of *Both*. The plan does not name it; in the house style:

```go
// services/shared/models/accountDocuments.go — name proposed here
EsiJobOwnerFilter string `bson:"esiJobOwnerFilter,omitempty" json:"esiJobOwnerFilter,omitempty"` // "both" when absent, "personal", "corporation"
```

```js
// Zustand/applicationSettings/core.js defaults
esiJobOwnerFilter: "both",
```

**Work.**
1. The field on both sides, its default, merge and persist lines in `core.js`, and an action in
   `preferences.js`.
2. The three-way control on the offers block header, with a count of what it hid.
3. Ownership as a badge column on every row in both blocks.
4. A round-trip test for the setting, and a test that a linked run is never filtered.

**Wire.** Additive. No `prepareRelease` step: an absent field reads as *Both*.

### Stage G — which clock a time is in

**Today.** Every time on the job flow is relative, through `formatTimeRemaining(inputTime, { now })`.
Archive Statistics buckets months in UTC by hand (`ArchivedStatsOverview.jsx`, `ArchiveRangeControl.jsx`).

**After.** One absolute-time formatter beside `formatTimeRemaining` in `numberParser.js`, reading one
setting; a control on the Layout Settings frame; a tooltip carrying the other clock. Field name not
given by the plan:

```go
DisplayTimesInLocalTimezone bool `bson:"displayTimesInLocalTimezone" json:"displayTimesInLocalTimezone"`
```

**Work.**
1. The setting on both sides, default off (EVE time).
2. The formatter, guarded as `feedback.js` guards `Intl`, returning both the shown time and the other
   clock for the tooltip.
3. The control on `layoutSettingsFrame.jsx` with a helper naming the detected zone in both states.
4. Tests for the formatter in both states and with no zone available.

**Wire.** Additive. No `prepareRelease` step.

### Stage H — mobile

**Today.** `Building_MobileLayout_EditJob` returns `null` and is mounted by nothing, so a phone gets the
standard layout.

**After.** The same row model; a run row as a card, a group opening as a bottom sheet whose unlink names
how many it takes; no nested scroll region.

**Work.**
1. Have `layoutSelector.jsx` choose the layout, as the other stages' selectors are provisioned to.
2. The card and sheet variants over Stage B's groups and Stage D's sections.
3. Render both layouts at phone and desktop width before calling it done.

**Wire.** Client only.

## Decisions needed

### Who removes `layout.esiJobTab`

**Question.** Is the job-level `esiJobTab` removed by this project at Stage E, as the plan says, or by
[job-document-drafts](../job-document-drafts/plan.md), whose release reshape already strips it?

**Why it is James's call.** Two plans each schedule the same field, and the code is in between: stored
documents lose it at release (`emptyLayout`), while `models.JobLayout`, `jobDocument.js` and
`tabPanel.jsx` keep writing it. After the release window a job opened on the Building stage puts the
field back on the next save, and `layout` with it.

**Options.**
- **job-document-drafts owns the field and its struct; this project only stops reading it.** Stage E
  deletes the reader, and the model change lands with the rest of `Layout` where that plan already
  defers the three view-state fields together.
- **This project removes it at Stage E, model included.** Keeps the removal next to its last reader,
  but splits one struct's retirement across two projects and makes the release depend on a paused one.
- **Stop the SPA writing it now, ahead of Stage E.** `tabPanel.jsx` keeps the open tab in component
  state only. A few lines, and the reshape then stays reshaped.

**Recommendation.** The first, with the third done now: drop the `setJobLayout({ esiJobTab })` write in
`tabPanel.jsx` so the release is not undone by the first save, and correct this plan's § Wire
compatibility row to say the stored field belongs to job-document-drafts. The account-level
`applicationSettings.esiJobTab` stays out of scope, as the plan already says.

**Blocked until decided.** Stage E's work list, and whether the shared-planners release leaves
`job_documents` free of `layout`.

### Who builds the Job costs panel and the setup table

**Question.** Stage C sends the three cost figures to "the Job costs panel", and Stage B groups "the
setup table". Both are [purchasing-stage-panels](../purchasing-stage-panels/plan.md) § Stage I, which
has not started. Does Building wait, or build them?

**Why it is James's call.** It is an ordering decision across two paused projects, and it decides which
project's design the shared component is first proven against.

**Options.**
- **Purchasing Stage I first.** The owner builds its own component; Building's Stages B, D, E, F, G and
  H do not need it and can proceed, with only Stage C's cost move and the setup-table half of Stage B
  waiting.
- **Building builds it.** Unblocks Stage C, but the first version is shaped by the stage that uses it
  least, and Purchasing then adapts or rewrites it.
- **Stage C keeps the three figures until the panel exists.** Progress lands above them; the
  information panel is deleted later.

**Recommendation.** The third, then the first. Land Progress without removing the cost figures, mark
Stage C partial, and close it when Purchasing Stage I lands. Stage B applies the grouping function to
runs and the schedule now and to the setup table when there is one.

**Blocked until decided.** Whether Stage C can be marked landed in one slice, and Stage B's done-when
line "no list on the stage has a scrollbar of its own", which the borrowed `JobSetupInfoFrame` strip
breaks with more than five setups.

### Whether Stage B waits for a census of linked runs

**Question.** [measurements/stage-occupancy.md](./measurements/stage-occupancy.md) asks that the census
be re-run on a snapshot retaining `esi.industryJobs` "before Stage B fixes its grouping keys". No such
snapshot is recorded. Does Stage B wait for one?

**Why it is James's call.** Only he can produce a snapshot of live that keeps the `esi` subtree, and
the document makes the request without saying whether it gates the stage.

**Options.**
- **Do not wait.** The keys come from what both sides structurally carry, which the measurement itself
  calls sound. The census would tune one presentation detail: whether a due range usually spans minutes
  or hours.
- **Wait.** Costs a dump and restore, and delays the stage everything else rests on.

**Recommendation.** Do not wait. Build to the structural keys, and re-run the census whenever a
suitable snapshot next exists to check the range wording.

**Blocked until decided.** Nothing, if the recommendation is taken; Stage B otherwise.

### Whether the two new settings belong to the account or the planner

**Question.** Stages F and G each add a field to `applicationSettings`. Since the plan was written the
planner has gained a settings document of its own (`services/shared/models/planner/settings.go`).
Should either setting live there?

**Why it is James's call.** It fixes a stored shape, and the line between a reader's preference and a
planner's configuration is his to draw.

**Options.**
- **Account, as planned.** Both describe how one person reads a screen: which offers they want to look
  through, and which clock they think in. Two members of one planner can reasonably differ.
- **Planner.** Everyone working in a corporation planner sees the same clock and the same filter. It
  suits a shared screenshot, and overrides a member's own habit.

**Recommendation.** Account, as planned. Neither setting changes a figure, and the panel already states
its zone in a line for the screenshot case.

**Blocked until decided.** The field declarations in Stages F and G.

## Dependencies and order

**Waits on.**
- [purchasing-stage-panels](../purchasing-stage-panels/plan.md) § Stage I for the Job costs panel and
  the setup table (Stage C's cost move; half of Stage B).
- [job-document-drafts](../job-document-drafts/plan.md) for the retirement of `layout`.
- Nothing else. [planning-stage-panels](../planning-stage-panels/plan.md) § Stage Q has since replaced
  the vertical `Stepper` in `editJob.jsx` with tabs, and no Building file imports from it.

**Waited on by.** Nothing is blocked on this project. The system for managing linked ESI jobs across the
archive (§ Handed on) inherits its facts but is designed separately, and `archiveJobButton.jsx` still
sends `jobsToRemove` as the plan describes.

**Recommended next slice.**
1. Remove the `esiJobTab` write from `tabPanel.jsx` so the release reshape holds.
2. Stage B for runs and the schedule, bringing the Stage A files to the comment rule in the same change.
3. Stage G with Stage C, since Progress is the first surface to show an absolute time.
4. Stages D and E together: the match has no reader until the sections and the offers block exist.
5. Stage F, then Stage H last, over a finished row and section model.
