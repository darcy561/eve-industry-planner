# Planning stage panels — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

**Brought up to date on 2026-10-05**, after James decided the questions this review raised. § Decided
records each answer; the plan, the overlay and the promote drafts now carry them, and § Bringing the
documents back to the code is done. Paths are as filed by fe8ec2218 ("file the job's code by
subject"), and the Skills pips are the shared components the uncommitted work introduced.

**Rows P–S re-verified on 2026-10-05** against HEAD f13f60864 plus uncommitted changes, after those
stages landed, with three further decisions recorded in § Decided.

## Summary

The project rebuilds the Edit Job Planning stage: three panels in place of the market panel, selling
charges counted at plan time, and — added late — the Output panel (Stage P), the page frame
(Stage Q), and by decision the Setups panel (Stage R) and the Blueprint Library (Stage S).

The stage table in [plan.md](./plan.md) § Stage status is honest. Stages A–O are in the code, on both
layouts, with tests beside them. When this review was first written, Stages P and Q were designed and
not started — Production Stats, the Linked Job Badge, the vertical `Stepper`, the floating arrows and
the unconfirmed Delete were all still what the plan describes as "today" — and Stages R and S, added by
decision, were designed and not started. All four landed later on 2026-10-05; § Verified status below
is brought up to date for them.

Two things needed attention, and neither is a stage:

1. **The project's own documents had fallen behind the code they describe** — now corrected. Other
   projects landed on top of Stages A, L and N after they were written up. The per-job selling override
   is stored on `JobBuild`, not on `JobSale.Plan`. The sale location accessor reads the saved-market
   registry, not placeholders, and its shape no longer carries a price hub. The custom-structure
   hand-off has a home and has promoted. The plan, the overlay and the promote drafts said otherwise;
   they now match the code.
2. **Live SoT already has a `frontend/editjob/` area**, with two topic docs that describe exactly what
   Stages P and Q remove. The promote README called that area "New" and named neither doc; it now
   treats the area as an update and records what happens to both.

## Verified status

`Planning/` below is `frontend/src/Components/Edit Job/Edit Job Components/Planning`; `SL/` is its
`Standard Layout/` folder. Other paths are under `frontend/src/` unless they start with `services/`.

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---|---|---|---|---|
| Phase 1 — folder and docs | Done | Folder, `contents.md`, plan, overlay, measurements, section row | `../contents.md:25` | confirmed |
| A — sale locations and rates | Done; accessor returns placeholders | Constants in; accessor reads the saved-market registry, no placeholder left | `Context/defaultValues.jsx:243-277` (`brokerFeeRates`, `salesTaxRates`, `marketSkillIDs`); `Functions/MarketOrders/saleLocations.js` (`getSaleCitadels`, `getDefaultSaleStructure`, `resolveSaleLocation`) | understated |
| B — fee and tax estimation | Done | Rate and amount functions per charge, shared with Selling | `Functions/MarketOrders/sellingRates.js` (`brokerFeeWorking`, `salesTaxWorking`, `salesTaxRateAt`, `brokerFeeAmount`, `salesTaxAmount`); `calcSellingCharges.js`; `Hooks/React Query/Character/useSellingRateInputs.js`, `useSellingRates.js`; `Selling/.../salesStatsPanel.jsx:92` | confirmed |
| C — Accounting in the catalogue | Done | Entry present | `RawData/bpSkills.json:17` | confirmed |
| D — pricing order type picker | Done; E and F mount it | Built and mounted | `Styled Components/Select/pricingOrderType.jsx`; `Functions/MarketData/defaults/materialPricing.js`; imported by `SL/Materials And Sourcing/materialsAndSourcingPanel.jsx` | confirmed |
| E — Materials & Sourcing | Done | One material list; old panels and bulk-create hook gone | `SL/Materials And Sourcing/` (`materialsTable`, `materialCards`, `materialDrawer`, `planChip`, `rowPricingOverride`, `sourcingSummary`, `useMaterialsSourcing`); no `Resources Panel/` or `Material Prices/`; no `buildAllChildJobs` anywhere | confirmed |
| F — Cost Breakdown and Returns | Done | Both panels, one figures hook, shared bars | `SL/Cost Breakdown/` (`costBreakdownPanel`, `costTable`, `costParts`, `pricingModel`, `costComparison`, `inventionEditor`, `planningEconomics`, `useJobEconomics`); `SL/Returns/` (`returnsPanel`, `exitRoutes`, `saleLocationRates`, `outputHeader`); `Styled Components/Charts/bars/{RangeBar,ProportionBar}.jsx` | confirmed |
| G — speculative child jobs | Done; priced as the panel opens | Own slice; priced from an effect, once per panel | `Zustand/editSession/stateDefault.js:23-24`; `materialsAndSourcingPanel.jsx:59,106`; `SL/Materials And Sourcing/Hooks/useChildJobBuildActions.js` | confirmed |
| O — a missing price is not zero | Done | One predicate, read by Returns | `Functions/MarketData/prices/isPriced.js`; `Functions/Job/figures/returns.js` (`hasNoOrders`) | confirmed |
| H — jobs with parent jobs | Done | Contribution panel; one commitment hook | `SL/Returns/contributionPanel.jsx`; `Hooks/Planner/useJobCommitment.js`, read by `useJobEconomics.js:69` and `SkillsPanel.jsx:56` | confirmed |
| I — Skills as a model | Done | Three groups, pips, what-if in component state | `SL/Skills Panel/` (`SkillsPanel`, `skillsWhatIf`, `skillsTimeEffect`, `superseded`); the pips and row are the shared `Styled Components/Skills/SkillLevelPips.jsx` and `SkillLevelRow.jsx`; `Functions/MarketOrders/sellingWhatIf.js` | confirmed |
| J — mobile layouts | Done | Mobile mounts the standard panels | `Planning/Mobile Layout/mobileLayout.jsx`; `materialCards.jsx` | confirmed |
| K — default market character | Done | Field, store, picker, accessor | `services/shared/models/accountDocuments.go:293`; `Zustand/applicationSettings/{core,preferences}.js`; `Components/Settings/Standard Layout/jobSettingsFrame.jsx:86`; `Functions/MarketOrders/sellerCharacter.js` | confirmed |
| L — per-job selling override | Done; held on `JobSale.Plan` | Behaviour is in; the fields are on `JobBuild`, and there is no `JobSale` | `services/shared/models/job.go:96-97`; `Functions/Job/jobDocument.js:98-101,212-213`; `saleLocationRates.jsx:129,137,257`; `setSellingPlan` in `planningEconomics.jsx` | partly |
| M — what a child job covers | Done | Allocation, walk, resize on commit, shortfall tag | `Functions/Groups/childJobCoverage.js`, `childJobCostWalk.js`; `SL/Materials And Sourcing/Helpers/finaliseCreatedChildJobs.js`; `shortfallChip.jsx` | confirmed |
| N — sale location list and standings | Done | Race-to-faction lookup; failed reads throw; a named station is honoured | `Hooks/React Query/World/raceFactions.js`; `Hooks/React Query/Character/skills.js:58`, `standings.js:59`; `saleLocations.js` (`resolveSaleLocation`) | confirmed |
| P — Output and parent jobs | Done | Output on the app-shell surface reading `useJobCommitment`; parent rows folding past seven; the header line naming up to three parents as links; Production Stats and the Linked Job Badge gone | `SL/Output/outputPanel.jsx`, `parentJobRows.jsx`, `outputPanel.test.jsx`; `Components/Edit Job/jobPurposeLine.jsx`, `jobPurposeLine.test.jsx`; `Functions/Groups/parentRequirements.js` (`coverParents`); `Styled Components/Typography/figures.jsx` (`FoldedList`); no `Production Stats Panel/` or `Linked Job Badge.jsx` | confirmed |
| Q — page frame and controls | Done | Tabs over the navigation rules, the shut final tab's reason, one labelled pair, labelled header controls, Delete confirming, Close asking; `useIsScrolledOutOfView` deleted | `Components/Edit Job/editJob.jsx`, `jobStageNavigation.jsx`, `jobHeader.jsx`, `deleteJobButton.jsx`, `DeleteJobConfirmDialogue.jsx`, `closeJobButton.jsx`, `saveJobButton.jsx`; tested by `editJob.test.jsx`, `jobHeader.test.jsx`, `deleteJobButton.test.jsx`, `closeJobButton.test.jsx`, `saveJobButton.test.jsx`; no `Hooks/GeneralHooks/useIsScrolledOutOfView.js` | confirmed |
| R — Setups | Done | One `Setups` panel of `ExpandableRow` rows, the facility line, the editor under the row or in a sheet; both old panels deleted | `SL/Setups/setupsPanel.jsx`, `setupRow.jsx`, `setupEditor.jsx`, `useFacilityWords.js`, `setupsPanel.test.jsx`; `Styled Components/Paper/ExpandableRow.jsx`; `Functions/Installation Costs/installCosts.js` (`setupInstallCost`); no `Setup Panel/` or `Edit Setup Panel/` | confirmed |
| S — Blueprint Library | Done | Rows with status in words, Use and Undo, the setup's blueprint marked, a counting fold, Formula Library for reactions; tiles and legend gone | `SL/Blueprint Library/blueprintLibraryPanel.jsx`, `blueprintRows.jsx`, `formulaRows.jsx`, `useBlueprintLibrary.js`, `blueprintLibraryPanel.test.jsx`; `Functions/Blueprints/blueprintJobState.js` and its test; no `Blueprint Options/` | confirmed |
| Handed to the custom-structure work | Handed on; no project, no home | Built and promoted elsewhere | `services/shared/models/marketLocations.go` (`MarketLocation`); `Components/Settings/Standard Layout/Market Locations/`; `../contents.md:35-36` | understated |
| Owed to the shared-planners release | Numeric invention ids still to rewrite | Either shape decodes; no rewrite found | `job.go:578-602` (`InventionEntry.UnmarshalBSON`); `services/core/commands/release_extras_invention_rows.go` | confirmed |
| Inherited: second rig slot | One rig picker; second slot unreachable | Two pickers | Found in `SL/Edit Setup Panel/editJobSetup.jsx`; now `SL/Setups/setupEditor.jsx` (`useRigSlots`, "Rig 1", "Rig 2") | overstated |
| Known limit: sourcing memo re-runs | Caused by the Edit Job `actions` object | The named cause no longer exists | `SL/Materials And Sourcing/useMaterialsSourcing.js:95-101` reads through `useJobDraft` selectors | unverifiable |
| Promote drafts | Accurate for A–O | Stale in five places | See § Bringing the documents back to the code | overstated |

### Discrepancies

As found on 2026-10-05, before the corrections. Every one below is now corrected in the documents
it names; § Bringing the documents back to the code lists the work.

- **A is further on than the plan said.** [plan.md](./plan.md) § Building against a placeholder ended
  "Done when the lane lands: `getSaleStructures` reads the stored lane, the placeholder constant is
  deleted". That has happened. `saleLocations.js` now calls `savedCitadels(allMarketSources())` from
  `Functions/MarketData/registry/marketSources.js`, there is no `getSaleStructures`, and the kinds are
  `NPC_STATION` and `CITADEL`. The overlay's § Settings still says "It returns two placeholder
  citadels: nothing is stored".
- **L is in, on a different field.** Plan, overlay, the wire table and
  `promote/frontend/editjob/selling-charges.md` all name `JobSale.Plan`. `job.go` has no `JobSale`
  type. `services/core/commands/reshape_job_document.go:106-112` lifts `build.sale.plan.*` onto
  `build` and deletes `build.sale`. Before/after is shown below.
- **The custom-structure hand-off landed.** market-locations and market-price-delivery both built it
  and both are marked promoted in the section task map. The plan's § Start here and the promote
  README's § Not promoted still say the content "has no home once this folder is deleted".
- **The second rig slot is closed.** [plan.md](./plan.md) § Inherited describes a single
  `RigTypeSelect` bound to `rigSlot1`. The file imports no `RigTypeSelect` and renders two
  `VirtualisedRigSearch` fields.
- **The sourcing memo limit cannot be confirmed as written.** The Edit Job reducer and its `actions`
  object were replaced by `Edit Job Hooks/jobDraftStore.js` and `useJobDraft`. Whether rows still
  rebuild on unrelated interactions needs a profile, not a read.
- **Uncommitted work in this area is tidy-up, not new behaviour.** `sellingRates.js` gains
  `salesTaxRateAt`, which `sellingWhatIf.js` now calls instead of its own copy of the formula;
  `returns.js` reads `isPriced`; the panel's own `skillLevelPips.jsx` is replaced by the shared
  `Styled Components/Skills/SkillLevelPips.jsx` and `SkillLevelRow.jsx`, which read `maxSkillLevel`
  and which the Reprocessing setup panel draws too. The edit to
  `promote/frontend/editjob/selling-charges.md` adds one true sentence: with the constants in
  `defaultValues.jsx`, `3 − 0.3×5 − 0.03×10 − 0.02×10` is exactly 1.

## What each remaining step changes

Stages A–O: see [overlay.md](./overlay.md), read with the corrections in the last subsection here.

### Stage P — Output, and the parent jobs inside it

Rationale: [plan.md](./plan.md) § Stage P.

**Today.** `productionStats.jsx` is an untitled `ContentPanel` that works the commitment out itself,
and only draws it for a job in a group:

```jsx
const parentRequirements = resolveParentRequirements({
  parentJobIDs, findJobInJobArray, itemID, jobID,
});
...
{parentJobIDs.length > 0 && includedInGroup ? (
  <>Parent Job(s) Require … Parents Other Children Produce …</>
) : null}
```

The parents themselves are in the page header. `Linked Job Badge.jsx` draws a centred "Parent Jobs"
heading, an absolutely positioned add button and a scroll box of up to 300px on every job, and each
parent is a `Chip` with a name and a remove icon. `parentJobOptions.jsx` describes a candidate by
facts about the candidate:

```jsx
{setupCount(job)} setup{setupCount(job) === 1 ? "" : "s"} · {totalQuantityProduced(job)} items produced
```

**After.** One panel titled Output on the app-shell surface, reading the hook three panels already
share. The plan fixes what it states and not its markup:

```jsx
const commitment = useJobCommitment();
```

```text
Output
  produced · owed to parents · free to sell     one derivation line, not three rows
  time: the longest setup, slots assumed to run side by side
  Parent jobs                                   one row each, at most six, then "and N more"
    <name>   needs <n>   covered | short by <n>   unlink
Page header
  one summary line for the parents
Link Parent Job
  each candidate states how many of this job's item it needs
```

`useJobCommitment` passes `hasParents: parentJobIDs.length > 0`, so the 6,457 ungrouped jobs with
parents ([measurements/parent-jobs-and-stage-locks.md](./measurements/parent-jobs-and-stage-locks.md))
start seeing their requirement. The plan does not say whether the per-parent figures come from the
hook's result or from a second call to `resolveParentRequirements`; the done-when ("nothing on the
stage derives the commitment twice") only allows the first.

**Work.**

1. Build the Output panel in `SL/`, on `AppShellPanel` with `paperSx={{ height: "auto" }}`, reading
   `useJobCommitment`. Delete `Production Stats Panel/` and repoint both layouts.
2. Have the hook's result carry what each parent needs and whether it is covered, if it does not
   already, so the rows do not re-derive it.
3. State time for the longest setup rather than the selected one, and say what it assumes.
4. Draw the parent rows with the fold at six, the unlink on each, and navigation to the parent that
   the chip's `onClick` does today.
5. Reduce `Linked Job Badge.jsx` to the header summary line; move the Link Parent Job trigger to
   Output.
6. Change `parentJobOptions.jsx` to state the candidate's requirement for this item, which it already
   holds from `job.build.materials[String(itemID)]`.
7. Tests in the existing structure: replace `productionStats.test.jsx` and `Linked Job Badge.test.jsx`,
   extend `parentJobOptions.test.jsx` and `planningLayouts.test.jsx`.
8. At promote: rewrite live `frontend/editjob/parent-job-link.md`, which this changes.

**Wire.** Additive in the weakest sense: nothing stored or sent changes. `parentJobs` and the link
intents keep their meaning. No prepareRelease step.

### Stage Q — The page frame, and the controls that manage the job

Rationale: [plan.md](./plan.md) § Stage Q.

**Today.** `editJob.jsx` renders the whole stage inside the active step of a vertical stepper, and
moves between stages four ways:

```jsx
<Stepper activeStep={jobStatus} orientation="vertical">
  <Step><StepButton onClick={() => jumpToJobStep(status.id)} disabled={…} />
    <StepContent>
      <IconButton ref={prevStepButtonRef} …><ArrowUpwardIcon /></IconButton>
      <EditJobStepContentSelector />
      <IconButton ref={nextStepButtonRef} …><ArrowDownwardIcon /></IconButton>
    </StepContent>
  </Step>
</Stepper>
{showFloatingPrevStep && …}   {showFloatingNextStep && …}
```

The locked final step is a disabled `StepButton` with no reason shown. The header is four icon
buttons. `deleteIcon.jsx` deletes from `onClick`:

```jsx
onClick={async () => {
  if (!persist.canPersist) return;
  await deleteJobsFromPlanner(openJobID);
  …navigate away
}}
```

`closeIcon.jsx` calls `leaveEditedJobWhereItStands()` without asking. `saveIcon.jsx` is an icon whose
tooltip reads "Saves all changes and returns to the job planner page." `useJobModified`
(`Edit Job Hooks/useJobDraft.js:117`) is read by `useEditJobLeaveConfirm.js` and
`openChildJobButton.jsx`, and by nothing in the header.

**After.** The same helpers and the same command, behind tabs. The plan specifies behaviour and not
component shape:

```text
Tabs            one per jobStatuses entry, labelled status.name, sticky
                allowed by canJumpToJobStep; selecting runs setJobStatus(id)
Locked final    states why for this job: in a group and not ready to sell; with parents, that the
                output is committed
One pair        "← Back to <previous name>"   "Continue to <next name> →"
Header          modified state from useJobModified
                Save & close   Close (asks when modified)   Delete (outlined, set apart, confirms,
                names the job and what its parents lose)
```

**Work.**

1. Delete confirmation, first and alone, as the plan asks: a dialogue on the shared shell naming the
   job and its parents.
2. Close asks when `useJobModified()` is true; reuse `EditJobLeaveConfirmDialogue`.
3. Label and weight the header controls; relabel Save as "Save & close"; render the modified state.
4. Replace `Stepper` with tabs reading `canJumpToJobStep`, `isFinalStepLockedForJob` and
   `getLastStepIndex` from `Functions/Job/editing/jobStepNavigation.js`.
5. State the lock reason. `Complete/.../sellGroupJob.jsx` returning `null` for a job with parents is
   what makes the wording differ.
6. Replace the in-content arrows with the labelled pair; delete both floating arrows, both
   `useIsScrolledOutOfView` calls, and the hook and its test (`Hooks/GeneralHooks/useIsScrolledOutOfView.js`,
   `useIsScrolledOutOfView.test.jsx`), since `editJob.jsx` is its only caller.
7. Tests: `editJob.test.jsx`, `editJob.session.test.jsx`, `closeIcon.test.jsx`, `saveIcon.test.jsx`,
   and a new one for Delete.
8. At promote: delete live `frontend/editjob/floating-step-buttons.md` and
   `frontend/technical-rules.md` § Watching whether an element is on screen — recorded as promote
   actions in [promote/README.md](./promote/README.md) § Live docs this project deletes.

**Wire.** None. `jobStatus` is still the stage. No prepareRelease step.

### Stages R and S — Setups, and the Blueprint Library

Added by decision; the rationale, the SPA description, the wire statement and the done-when are
[plan.md](./plan.md) § Stage R and § Stage S. **Wire.** None for either: setups keep every field, and
`layout.setupToEdit` keeps its meaning. No prepareRelease step.

### Bringing the documents back to the code

**Done on 2026-10-05.** Not a stage, but promotion could not happen without it. Each item was a place
where plan, overlay or a promote draft described something the code no longer does; what follows is
what was found, kept as the record of what was corrected.

**The per-job selling override.** The documents say:

```json
{ "build": { "sale": { "plan": { "sellerCharacter": null, "saleLocationID": null } } } }
```

The model and the SPA hold:

```go
type JobBuild struct {
	...
	SellerCharacter *string `json:"sellerCharacter,omitempty" bson:"sellerCharacter,omitempty"`
	SaleLocationID  *string `json:"saleLocationID,omitempty" bson:"saleLocationID,omitempty"`
	...
}
```

```json
{ "build": { "setup": {}, "materials": {}, "sellerCharacter": "<CharacterHash>", "saleLocationID": "amarr" } }
```

Both fields are omitted when nil, so the wire table's note that "the subdocument appears on every job
saved after this lands" is no longer true either. The SPA has no `Job` class to add fields to;
`jobDocument.js` builds plain data, and still reads the old place as a
fallback (`build?.sellerCharacter ?? build?.sale?.plan?.sellerCharacter`) — now in
`Functions/Job/jobDocument.js`.

**The sale location.** `promote/frontend/editjob/selling-charges.md` documents:

```js
{ kind: "HUB" | "STRUCTURE", feeStationID, priceHubID, priceHubName, brokerFee }
```

`saleLocations.js` returns:

```js
{ kind: "npcStation" | "citadel", id, name, feeStationID, brokerFee }
```

A citadel is priced at itself, so there is no price hub to name; the draft's sentence that a structure
"still prices against a named hub", and `returns.md`'s that the rate block "names the hub its prices
came from", are both out of date. So is [plan.md](./plan.md) § Where a structure's prices will come
from, which describes that change as future work.

**The route Returns leads with.** `useJobSellingContext` returns `exitRoute`, read from
`applicationSettings.defaultPricing.selling.exit`. `returns.md` says the panel leads with the listing
route.

**Work.**

1. Correct Stage L in the plan, the overlay, the wire table and `selling-charges.md` to `JobBuild`.
2. Rewrite `selling-charges.md` § Sale locations and the placeholder paragraphs in the plan and
   overlay to the registry-backed accessor; drop `priceHubID`.
3. Correct `returns.md` on the exit route and the price hub. Correct `cost-breakdown.md`, which cites
   `job.buildCost`; `Edit Job Hooks/jobSelectors.js` has no such selector.
4. Mark § Handed to the custom-structure work as landed and point it at live
   `frontend/settings/market-locations.md`. Remove § Inherited: the second rig slot. Restate or drop
   the sourcing memo limit.
5. Redo the promote README index: `frontend/editjob/contents.md` is an update to an existing area,
   not a new one, and the draft must merge with the Owns paragraph and two task-map rows already
   there. `promote/frontend/contents.md` was drafted against an older Owns paragraph and must be
   re-cut from the live file. The citation list has grown from five lines to thirteen citing files.
6. The "Stacked panels" section the README owes `frontend/technical-rules.md` is still owed and still
   true: `AppShellPanel.jsx:64` defaults to `height: "100%"` and ten Planning panels override it. The
   anchor headings it names (§ A poke is not a value, § Lint and format) now have
   § Watching whether an element is on screen between them.

**Wire.** None; documentation only.

## Decided

James decided each question this review raised on 2026-10-05. The plan, the overlay, the promote
drafts and the documents named below now carry the answers.

### Promotion waits, and happens once

**Decided: hold.** The project promotes once, when Stages P, Q, R and S are finished as well as A–O.
A–O are not promoted on their own. The drafts are re-cut for A–O now and the P–S drafts are written as
those stages land ([promote/README.md](./promote/README.md)). purchasing-stage-panels reads live docs
for the order type picker only after that single fold.

### Stage L is corrected here

**Decided: this project's documents describe the moved fields.** The per-job override is
`build.sellerCharacter` and `build.saleLocationID` on `JobBuild`, both omitted when nil; plan § Stage L,
the Stage status row, the wire table, the overlay and `promote/frontend/editjob/selling-charges.md` say
so. Removing the SPA's fallback read of `build.sale.plan` in `Functions/Job/jobDocument.js` is an item
on job-document-drafts' release list ([review.md](../job-document-drafts/review.md) § Stage 2 — running
it, item 4), since that project owns the reshape and the release that runs it.

### `useIsScrolledOutOfView` goes with the floating arrows

**Decided: delete all of it.** When Stage Q removes the arrows, the hook and its test are deleted in the
same change, and at promote the live `frontend/technical-rules.md` § Watching whether an element is on
screen and `frontend/editjob/floating-step-buttons.md` are deleted. Plan § Stage Q's done-when says so;
the live deletions are recorded as promote actions in
[promote/README.md](./promote/README.md) § Live docs this project deletes.

### Save stays "Save & close"

**Decided: relabel only.** Stage Q does not split `closeActiveJob`; the header has one save control and
it says it closes.

### The Setups panel and Blueprint Library are this project's

**Decided: folded in as Stages R and S.** [plan.md](./plan.md) § Stage R and § Stage S describe them
from the design reference, with Stage R carrying the two rig pickers and the militia fields the design
predates. The separate row in [`../contents.md`](../contents.md) is removed and this project's row
covers them.

### The Edit Job reducer citations point at job-document-drafts

**Decided: repoint.** `react-19-idioms/contents.md`, `react-19-idioms/plan.md` and
`effect-state-sync/contents.md` now send a reader to
[job-document-drafts/plan.md](../job-document-drafts/plan.md) § How a job is held while it is open
(and § What a component actually reads, for what re-renders). They no longer count against deleting
this folder.

### The open setup row stays apart from the selected setup

**Decided: keep them separate.** Which row's editor is open is the Setups panel's own state; the
selected setup is `layout.setupToEdit`, which the stage's other panels read, and it keeps that meaning.
Plan § Stage R's wire paragraph said `setupToEdit` would now record the row expanded, and is corrected.
The selected row carries the shared open-row tint (`ExpandableRow`'s `openRowBackground`), which the
design and the plan said would be unnecessary: a setup can be selected while its editor is shut.

### The design's help text and Output extras are built

**Decided: build them, all but the ⋮ menu.** The Setups editor carries the run-limit note, the
system-index explanation, the slot time under Who, the labels *Runs*, *Job slots*, *Use my own system
index* and *Your system index (%)*, the system among a saved structure's facts, the Where fields in the
plan's order, and the facility line's counts in words. Output names the slots its longest setup
assumes, and says "Taking runs off any setup leaves the parents short." or "X owed, Y spare." where they
apply. The design's ⋮ menu on Output was not built, since the design never says what it holds. Item
tree and Close are outlined and Continue is filled, as the design draws them.

### Parents are counted and named

**Decided: count them and name up to three.** The header line reads "N for K parents (Name, Name, Name,
+M more) — coverage · S setups", the names largest need first, each opening that job through
`useOpenJob`. The locked final tab's reason counts them: "Its output is committed to its K parent jobs,
so it is not sold on its own."

### The plan's four open questions

[plan.md](./plan.md) § Open questions. None blocks P or Q.

- **Does the pricing-model toggle reach the rest of the app?** Code: `useState` in
  `planningEconomics.jsx`, written nowhere. Recommend closing it as display-only; a stored model
  would change `job.buildCost`'s successors on every stage.
- **How deep do speculative child jobs recurse?** Code: one level. Recommend closing at one level
  until someone asks; the drawer already says sub-materials are valued at market.
- **Does a Price Entry price override the order type automatically?** Code: yes in effect — a row
  with a purchase reads Paid and is left out of the estimate. Recommend recording that as the answer.
- **Where is a saved citadel edited from?** Half answered by other work: Settings has a Market
  Locations tab with an editor. The Returns rate block has no route to it; its only link is "Back to
  the account default". Recommend one link from the citadel line to that tab, in Stage P or Q's pass.

## Dependencies and order

**This project waits on** nothing to build P, Q, R or S. Promotion waits on all four; the drafts for
A–O are re-cut.

**Waiting on this project.**
- purchasing-stage-panels reuses the order type picker and the Materials & Sourcing table shape, and
  expects to read them from live docs.
- purchasing-stage-panels and building-stage-panels both cite Stage Q as the owner of the page frame
  and rely on it being independent of the stage panels. `EditJobStepContentSelector.jsx` switching on
  `jobStatus` alone bears that out.
- reprocessing-rebuild's minerals-as-ore work lands on these panels and inside Q's frame.
- shared-planners' release carries the numeric invention id rewrite; `shared-planners/plan.md:2712`
  and this plan agree it is still owed.

**Recommended next slice.** None is left to build. Stages P, Q, R and S landed on 2026-10-05 in the
order recommended here — the delete confirmation first, then Output, the rest of the frame, Setups and
the Blueprint Library — each reviewed after it landed. What remains is the promotion itself, on
James's go-ahead.
