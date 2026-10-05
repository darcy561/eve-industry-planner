# Reprocessing rebuild — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

## Summary

The project rebuilds the Reprocessing page and the engine under it: a static file read from the SDE, an
engine of pure functions, an exact ore solver, settings on the planner, and then the page on the
app-shell design. Stages B, C and E and tasks D1 and D3 are in the working tree as the plan says, with
tests. **None of it is committed**: at HEAD every stage reads "Not started" and the old selector, the
flat static file and the account-held settings are all still there, so the whole of B to E exists only as
uncommitted changes beside other projects' edits.

Two things need attention. First, **Stage F is mid-slice and the plan does not say so**: the planner
model, the write path, the SPA slice and the page's read of the planner are in the tree, while
`plan.md` § Stage status and `overlay.md` § Reprocessing settings both still read "Not started" and the
release step (F3) does not exist. Second, **every remaining stage from G onward is untouched** — the
page is still the old `ContentPanel` layout — and three in-game checks (A2, A3, A4) that the plan's
figures rest on have not been prepared, with `measurements/formula-checks.md` not yet created.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---|---|---|---|---|
| Phase 1 | Complete | Folder, `contents.md`, plan, overlay, two measurements, section row | this folder; `../contents.md` rows 28–29 | confirmed |
| A1 rounding | Settled against live | One rounding rule, held by a corpus | `reprocessedQuantity` in `frontend/src/Functions/Reprocessing/engine/reprocess.js`; `engine/liveParity.corpus.test.js` § what a run gives (not run for this review) | confirmed |
| A2, A3, A4 | Not started | Nothing prepared | `measurements/formula-checks.md` does not exist | confirmed |
| B static file | Complete | `{ items, materialVolumes }`, skills from attribute 790, kinds from the whole market ancestry, random outputs as ranges, SPA reader | `GenerateReprocessingDataOutput`, `reprocessingRootOf`, `randomizedMaterialsOf` in `services/worker/tasks/sde/update/conversion/output_reprocessing_data.go`; `ReprocessingData`, `QuantityRange` in `conversion/types.go`; `addReprocessingTypeIDs` in `update/recipeListDiffStage.go`; 12 tests in `output_reprocessing_data_test.go` incl. `TestSPAAndServerAgreeOnTheReprocessingKinds`; `volumeOf` in `frontend/src/Functions/Static/reprocessing.js`; `go fix -diff` clean on both packages | confirmed |
| B2 release rebuild | Confirmed, nothing added | Step present, not `required` | `rebuildCurrentSDEVersion` in `services/core/commands/release_sde_rebuild.go`; its row in `prepare_release.go` | confirmed |
| C engine core | Complete | Setup, yield, `reprocess`, ranges, parsers returning `unread`, producible view | `engine/reprocessingSetup.js` (`reprocessingSetupFrom`, `yieldFor`); `engine/reprocess.js`; `engine/randomOutputValue.js`; `producibleByReprocessing` in `Static/reprocessing.js`; `reprocessingInput.js`; `reprocessingRuns.js` | confirmed |
| D1 valuation | Landed | Both functions, worked example to the unit | `valueReprocessing`, `valueOrePlan` in `valuation/valuation.js`; `valuation.test.js` | confirmed |
| D3 selling fees | Landed | Hook and default exist; **nothing calls the hook** | `Components/Reprocessing/Hooks/useReprocessingSellingFees.js`; `valuation/sellingFees.js`; no importer outside its own test | partly |
| D2 tax | Waits on A3 | The setup already carries the rate; no field edits it and nothing on the page charges it | `taxPercent: structure?.tax ?? 0` in `reprocessingSetup.js`; no tax control in `reprocessingStructurePanel.jsx` | understated |
| E solver | Complete | `yalps`, `oreToBuy`, page plans through it, old selector and sliders gone | `"yalps": "^0.6.4"` in `frontend/package.json`; `selection/oreToBuy.js`; `reprocessFromMinerals` in `reprocessingRuns.js`; `oreSelector.js` deleted | confirmed |
| F1 shape | Not started | Go model and SPA defaults in the tree | `services/shared/models/planner/reprocessing.go` (untracked); account `ReprocessingSettings` reduced to `DefaultReprocessingCharacter` in `services/shared/models/accountDocuments.go`; `defaultPlannerReprocessingSettings` in `frontend/src/Context/defaultValues.jsx` | understated |
| F2 write path | Not started | Request field, validation, SPA writer and reader in the tree; no endpoint-level test | `SettingsUpdate.ReprocessingSettings`, `Fields()` in `planner/settings.go`; `writePlannerReprocessingSettings` in `Zustand/plannerSettings/actions.js`; `usePlannerReprocessingSettings` in `Hooks/React Query/plannerSettings.js`; `pageSettingsFrom` seed in `Hooks/useReprocessingReducer.js` | understated |
| F3 release step | Not started | No step | nothing reprocessing-related in `services/core/commands/prepare_release.go` | confirmed |
| G page | Not started | Old page intact | `reprocessingPage.jsx` on `ContentPanel`; `optionsPanel.jsx`, `basicMineralOutput.jsx`, `advancedMineralOutput.jsx`, `MineralCard.jsx`, `placeholderPanel.jsx`, `Hooks/useAutoRecalculation.js` all present | confirmed |
| H, I, J, K | Not started | Nothing | clipboard probe still writes `"test"` at `advancedMineralOutput.jsx:44` | confirmed |
| L close | Not started | Live docs still name old paths | `frontend/reprocessing/structure-panel.md` and `testing/frontend/reprocessing.md` cite `Functions/Reprocessing/reprocessingBonuses.js` | confirmed |
| M modules | Not started | Nothing | no `reprocessingEntryFor` in `frontend/src`; no `measurements/module-outputs.md` | confirmed |

**Discrepancies**

- **Nothing from B to F is committed.** `git status` shows every file above as modified, deleted or
  untracked. The plan's "landed" is true of the working tree only.
- **Stage F is in progress, not "Not started".** F1 and most of F2 are written and tested at the model
  and slice level (`planner/reprocessing_test.go`, `Zustand/plannerSettings/actions.test.js`,
  `Hooks/useReprocessingReducer.test.jsx`). Files in this area changed while this review was being
  made, so another slice is being written now. `plan.md` § Stage status, § Handoff ("Next is F1") and
  `overlay.md` § Reprocessing settings are all one stage behind.
- **F as it stands is a breaking change with no migration yet.** The account model no longer has
  `preferCompressed`, `sellExcessMineralTypes` or the three multipliers, and `SettingsFromAccount` no
  longer copies reprocessing settings to a new planner. Until F3 exists, a deploy of this tree would
  silently drop every account's stored choices.
- **D3 is a tested module with no caller.** The plan says G1 wires it; until then "selling fees for a
  chosen seller" is not something the page does.
- **D2 is further along than "waits on A3".** The setup reads the structure's `tax` and
  `valueReprocessing` takes `taxPercent`; what is missing is the panel field and the page charging it.
- **The in-flight settings panel still has Save as Default and Revert**
  (`reprocessingSettingsPanel.jsx`), now writing to the planner. [plan.md](./plan.md) § Decisions taken
  says both go; see the decision below.
- **`getAllReprocessingSkills.js` moved but still types 14 skill ids by hand.** G2 replaces it; noted so
  it is not read as done.
- **A stale sentence in C4**: it credits "a first `oreSelector.test.js`", which E3 deleted.

## What each remaining step changes

Landed stages (B, C, D1, D3, E): see [overlay.md](./overlay.md) § The reprocessing static file,
§ The engine, § What the page values, § Ore selection.

### Stage A — the in-game checks (A2, A3, A4)

**Today.** Three rules are stand-ins: gas yields `80 + structure gas bonus + skill level`
(`gasDecompressionFormula` in `engine/reprocessingFormulas.js`); tax is the structure's rate on the
outputs' **market** value; erratic ore reprocesses as ore, each batch giving one of its minerals at
equal odds:

```js
const share = 1 / outcomes.length;
expected[materialID] = Math.round(batches * share * ((quantityMin + quantityMax) / 2) * (yieldPercent / 100));
```

**After.** `measurements/formula-checks.md` records each case and its result. If the odds are not equal
the static file gains weights, which the SDE does not carry; the plan leaves that shape unspecified.

**Work.**
1. Create `measurements/formula-checks.md` with the prepared cases and each method's prediction.
2. James runs them in game: one compressed gas case at a refinery and one at an NPC station; one NPC
   and one structure tax case; at least 100 Prismaticite batches recording the mineral each gave.
3. Correct `reprocessingFormulas.js`, `structureBonusFor` and the rig families to what is recorded.

**Wire.** None, unless A4 finds unequal odds; then additive on the static file.

### D2 — reprocessing tax

**Today.** The rate reaches the setup and stops there:

```js
reprocessingSetupFrom(structure, skills) // → { kinds, implant, skills, taxPercent: structure?.tax ?? 0 }
```

**After.** The structure panel edits `tax` on the page's copy with the shared
`TaxPercentageTextField` (`frontend/src/Styled Components/Textfield/tax.jsx`), and the page passes
`setup.taxPercent` into `valueReprocessing`. The basis the game charges on comes from A3.

**Work.** 1. Add the field through `updateStructure`. 2. Pass the rate at the call site (arrives with
G3). 3. Tests: a saved structure's tax reaches the figures; editing it leaves the saved row alone.

**Wire.** None. The structure already stores `tax`.

### Stage F — settings on the planner

**Today (HEAD, and the same fields on `Public`).** One object on the account document, copied once to the planner
and never written there:

```json
"reprocessingSettings": {
  "defaultReprocessingCharacter": "<character hash>",
  "preferCompressed": true,
  "compressionBonusMultiplier": 0.25,
  "valueMultiplier": 2.0,
  "wastePenaltyMultiplier": 0.1,
  "sellExcessMineralTypes": false
}
```

**After (already in the working tree).** The account keeps one field; the planner settings document
holds the rest, as `planner.ReprocessingSettings` writes it:

```json
"reprocessingSettings": { "defaultReprocessingCharacter": "<character hash>" }
```

```json
"reprocessingSettings": {
  "compressedOre": "prefer",
  "countLeftoversAsSold": true,
  "buyOutright": true,
  "shipping": { "mode": "perVolume", "amount": 1000 },
  "neverChoose": [62568]
}
```

`countLeftoversAsSold`, `buyOutright` and `shipping.amount` are omitted when false or zero;
`neverChoose` is always written, `[]` when empty. The request is the same object under one key on the
existing planner settings `PUT`, replacing the stored object whole:

```json
{ "reprocessingSettings": { "compressedOre": "allow", "shipping": { "mode": "fixed", "amount": 2500000 }, "neverChoose": [] } }
```

**Work.**
1. Finish F2: an endpoint test for the new field beside `services/api/v1endpoints/planners/putSettings.go`,
   and a full-loop test of one save reaching a second client of the same planner.
2. Hand `shipping` and `buyOutright` to `oreToBuy` from `reprocessFromMinerals`
   (`reprocessingRuns.js` passes only `compressedOre` and `neverChoose` today), or record that this
   waits for G4, which draws the figures.
3. Write F3 against the shape `Public` holds: convert the account's `preferCompressed`, drop the
   multipliers, merge onto each planner what it is missing, with dry-run, revert and a live-parity test.
4. Run `go fix -diff` on the packages F edits; update `overlay.md` § Reprocessing settings and
   `plan.md` § Stage status.

**Wire.** Migrate-required, hard cutover. The request field is additive. The stored change is breaking
without F3, which the plan places beside the planner extras categories backfill.

### Stage G — the page on the app-shell

**Today.** `reprocessingPage.jsx` renders `OptionsPanel`, `TextInputFrame`,
`ReprocessingStructurePanel` and one of two output views inside a `ContentPanel`; results are stored in
the reducer by `calculateReprocessing` and re-run by `useAutoRecalculation`; each chosen ore is turned
back into a `ReprocessingItem` holding per-batch outputs so the old markup can multiply them out.

**After.** Results are derived during render and never stored
([plan.md](./plan.md) § Target shape):

```jsx
const result = useMemo(() => reprocess(items, setup), [items, setup]);
const figures = valueReprocessing(result, priceOf, { feePercent: fees.feePercent, taxPercent: setup.taxPercent });
```

The reducer holds only what the reader chose: each direction's paste, the setup, a pinned setup,
prices, seller, expanded rows. `ReprocessingItem`, `calculateReprocessing.js`, `reprocessingRuns.js`
and the six old components are deleted.

**Work.** G1 frame, direction and reducer, with the end-to-end reducer test; G2 inputs, the skill list
built from the static file, unread lines shown; G3 and G4 the answer panels; G5 chart tokens in the
theme; G6 the empty form; G7 the phone layout; G8 the signed-out path. Details per task in
[plan.md](./plan.md) § Stage G.

**Wire.** None on the server. G8 adds a `localStorage` copy of the ore settings and a
`sessionStorage` copy of the paste, both client-only.

### Stages H, I, J, K

**Today.** None of the four exists. Copying is `advancedMineralOutput.jsx`, which probes the clipboard
by writing `"test"` to it on mount.
**After.** A pinned second setup compared item by item (H); the same items valued per market (I);
opt-in asset reads at one chosen location through the shopping list's hooks (J); three copy actions
through `writeTextToClipboard`, with the probe deleted (K).
**Work.** As listed in [plan.md](./plan.md); each needs G landed and nothing from the others.
**Wire.** None.

### Stage M — modules and scrap metal

**Today.** A pasted module is an `unread` line. The static file holds 464 ore, ice and gas items only.
**After.** `reprocessingEntryFor(typeID)` answers from the ore file, then from a loader whose shape —
per id from the API, or buckets — is [static-data-delivery](../static-data-delivery/plan.md) Stage E's
to choose; `reprocess` is unchanged.
**Work.** M1 measure into `measurements/module-outputs.md` and M2 the in-game scrap check, both
runnable now; M3 to M5 after the delivery decision.
**Wire.** Additive: a new static output or a new public lookup.

### Stage L — close

**Work.** The whole-project sweep; rewrite the live docs that cite pre-move paths
(`frontend/reprocessing/structure-panel.md`, `frontend/reprocessing/settings.md`,
`frontend/static-data/reprocessing.md`, `testing/frontend/reprocessing.md`); promote.

## Decisions needed

### Ship the stand-in figures, or hold them for the in-game checks

**Question.** Do D2's tax, G3's erratic ore ranges and gas yields ship on today's assumptions, labelled,
or wait until A2, A3 and A4 are measured?
**Why it is James's call.** Only a player can run the checks, and only the owner can accept showing a
figure that may later move.
**Options.** (a) Ship on the stand-ins, with the line under the headline that states the odds assumed
and the tax basis: nothing blocks, figures may shift after the checks. (b) Hold D2 and the erratic rows
until measured: correct on arrival, but G3 cannot finish and the release window may pass.
**Recommendation.** (a), with `formula-checks.md` prepared now so the checks can be run at any point
before the release.
**Blocked until decided.** D2; the erratic and unrefined rows of G3.

### What F3 does with the two fields the plan does not mention

**Question.** Does the release step carry an account's `sellExcessMineralTypes` into the planner's
`countLeftoversAsSold`, and does `preferCompressed: false` become `allow`?
**Why it is James's call.** [plan.md](./plan.md) § F1 says `countLeftoversAsSold` *replaces*
`sellExcessMineralTypes`, but § F3 lists only the `preferCompressed` conversion and the multipliers.
The Go default is `prefer` and leftovers off, so an unconverted account silently changes behaviour.
**Options.** (a) Convert both, account onto its own planner, leaving any value the planner already
holds: preserves every reader's choice. (b) Convert `preferCompressed` only: one field fewer, and
every reader who had excess sold loses it. (c) Convert nothing and start every planner on defaults:
simplest, discards stored preferences.
**Recommendation.** (a), written as the one step that merges every planner setting, as
[shared-planners](../shared-planners/plan.md) § Every open project ships in this window asks.
**Blocked until decided.** F3, and with it any deploy of the F work already in the tree.

### Save as Default and Revert on the current panel

**Question.** Do the two buttons come off the old settings panel now, in F, or with the panel in G2?
**Why it is James's call.** § Decisions taken says they go because "the settings are the planner's",
yet the in-flight panel keeps them and saves to the planner only when Save is pressed.
**Options.** (a) Leave them until G2 deletes the panel: no work on markup that is about to go, but for
that interval a planner setting changes only on an explicit save. (b) Remove them now and save on
change: matches the decision, costs edits to an old-UI panel.
**Recommendation.** (a); it follows the rule that old-UI screens get logic consolidation only.
**Blocked until decided.** Nothing; it settles what F's "done" means.

### Stage M in the release window or out of it

**Question.** Does module reprocessing ride the shared-planners release?
**Why it is James's call.** It waits on static-data-delivery's per-id-or-buckets choice, listed under
that plan's § Open questions and still unanswered.
**Options.** (a) Defer M explicitly now and close the rest: the window is not held. (b) Take the
delivery decision first: M can ship with the page, at the cost of sequencing two projects.
**Recommendation.** (a), running M1 and M2 meanwhile since neither depends on the answer.
**Blocked until decided.** M3, M4, M5; whether Stage L closes with or without M.

### Minerals bought as ore on the Edit Job stages and the Shopping List

**Question.** Does the designed feature in [plan.md](./plan.md) § Not in the sequence get a project of
its own, and when?
**Why it is James's call.** It is designed and drawn but owned by nobody: Purchasing's part is held
open in [purchasing-stage-panels](../purchasing-stage-panels/plan.md) § Handed from the reprocessing
rebuild; Planning's is recorded in [planning-stage-panels](../planning-stage-panels/plan.md) § Handed
on, which scopes nothing because that project is closing; the Shopping List has no project at all.
**Options.** (a) A new project owning Planning, the Shopping List and the hauling estimate, with
Purchasing's panel left where it is held: one owner for one solver run per list. (b) Split it three
ways among the screen projects: no new folder, but Planning's project must stay open and the Shopping
List still has no home. (c) Leave it unscoped: no cost now, and the design ages on the canvas.
**Recommendation.** (a), opened after Stage G lands so it builds on a page-proven engine; the engine
side it needs (`oreToBuy`, `valueOrePlan`, `producibleByReprocessing`) is already written.
**Blocked until decided.** Nothing in this project. The row in `../contents.md` stays as the only
record until a project is opened.

## Dependencies and order

**Waits on.** [shared-planners](../shared-planners/plan.md) for the release window and the place of
F3's step; [static-data-delivery](../static-data-delivery/plan.md) Stage E for Stage M; a player for
A2, A3 and A4.

**Waited on by.** [purchasing-stage-panels](../purchasing-stage-panels/plan.md) for the ore panel's
figures; the unscoped minerals-as-ore work; [react-19-idioms](../react-19-idioms/plan.md) defect D2,
which Stage K removes outright.

**One cross-project wording to align.** [static-data-delivery](../static-data-delivery/plan.md)
§ Stage E calls the reprocessing file's changes "all additive"; this plan's § Wire compatibility calls
the `{ items, materialVolumes }` reshape breaking for its reader pair, and the code agrees with this
plan: an older SPA reads the new file as an item map of two entries.

**Recommended next slice.** Finish Stage F before anything else: the tree already holds a breaking
stored-shape change with no migration. That means the endpoint and full-loop tests for F2, then F3
once the conversion decision above is taken, then bringing `plan.md` and `overlay.md` up to the code.
G1 follows; `formula-checks.md` can be prepared alongside.
