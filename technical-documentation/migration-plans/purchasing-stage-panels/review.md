# Purchasing stage panels — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes). Nothing
under `frontend/src/Components/Edit Job/Edit Job Components/Purchasing/`, `Edit Job Hooks/jobCommands.js`,
`Classes/jobMaterial.js`, `Functions/Shared/passBuildCosts.js` or `services/shared/models/job.go` is
modified or untracked in `git status --short`, so the committed tree is the truth for this area.

## Summary

The project retires the per-material card for a worklist and a drawer, puts the stage on the full price
ladder, folds the two purchase-recording implementations into one, and freezes a plan price into the
job document. The plan's status table says Phase 1 is done and every stage A–J is **Not started**, and
the code bears that out exactly: the Purchasing folder is the card grid the Starting position
describes, `recordPurchase` still lives in `jobCommands.js`, `models.JobMaterial` has no plan-price
field, and the mobile layout still returns `null`.

Two things most need attention. First, the Starting position misdescribes today's recording paths:
`Material.importPurchase` has **no production caller** — `passBuildCosts.js` dispatches
`importPurchaseToMaterial` like the other two paths — so Stage F1 is bringing a dead class method into
use, not consolidating onto a path one caller already takes. Second, the plan leaves four choices open
that gate real work: the undo granularity after F1, whether the multibuy paste keeps or drops overage,
whether Extras moves to or is mirrored on this stage, and what "ready" means for taking a child's cost.
The frozen record's field names are also unspecified and are a wire shape.

The reprocessing side of the ore hand-off has moved since the plan was written: that project's
Stages C and E are complete and `valueOrePlan` exists, so the ore panel now waits only on this
project's Stages B, C, F1 and I.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---|---|---|---|---|
| Phase 1 — folder and docs | Done | Folder, `contents.md`, `plan.md`, `overlay.md` scaffold, two measurements, section row | `technical-documentation/migration-plans/purchasing-stage-panels/*`; row in `../contents.md` | confirmed |
| A — price ladder | Not started | The entry form still runs the short ladder: `useEffectiveMarketHub` then `readMarketPriceForType`, no `useMaterialGroupPricing` or `getEffectiveMaterialPriceHub` anywhere under Purchasing | `Purchasing/Standard Layout/Material Cards/addMaterialCosts.jsx` lines 35–52 | confirmed |
| B — worklist | Not started | `Purchasing_StandardLayout_EditJob` maps `sortedMaterials` to `MaterialCardFrame_Purchasing` inside a MUI `Grid`; `getMaterialStatus` is called inside the sort comparator | `Purchasing/Standard Layout/standardLayout.jsx` lines 116–175 | confirmed |
| C — drawer | Not started | Each card mounts its own `ContentDialogue` with `ChildJobLinks`; `AddMaterialCost_Purchasing` returns `null` once `stillToBuy <= 0` | `materialCardFrame.jsx` lines 304–313; `addMaterialCosts.jsx` line 96 | confirmed |
| D — taking a child's cost | Not started | Only the push exists: `distributeItemCostsBetweenJobs` in `passBuildCosts.js`, refusing a second import through `isMaterialPurchased` (keyed on `childID`); no pull on the parent, no blocker text | `Functions/Shared/passBuildCosts.js` lines 131–187, 232–237; `AwaitingCostImportBox_Purchasing` | confirmed |
| E — Purchase Summary | Not started | "Total Complete Items: N / M" counts materials; both buttons hidden by `totalComplete < Object.keys(materials).length`; two market selects in the panel | `Purchasing Data Panel/purchsingDataPanel.jsx` lines 70–73, 130, 237–281 | confirmed |
| F1 — one recording path | Not started | `recordPurchase` at `jobCommands.js:407` is reached by `importPurchaseToMaterial`, `importPurchasesToMaterials` **and** `passBuildCosts.js:168`; `Material.importPurchase` is called only from `Classes/jobMaterial.test.js` | `Edit Job Hooks/jobCommands.js` lines 389–427; `Classes/jobMaterial.js` lines 75–103 | confirmed (plan's description of today is wrong — see Discrepancies) |
| F2 — frozen plan price | Not started | `JobMaterial` is `TypeID, Name, JobType, Volume, Purchasing`; `Material.toDocument()` writes the same five; no `planPrice`-like identifier anywhere in `services/` or `frontend/src` | `services/shared/models/job.go` lines 703–710; `Classes/jobMaterial.js` lines 214–221 | confirmed |
| G — multibuy reviewed | Not started | The button handler matches on exact `importedName`, caps at `stillRequired` with no `recordExcess`, and reports two snackbar strings | `purchsingDataPanel.jsx` lines 156–220; `Functions/Clipboard/importMultibuy.js` | confirmed |
| H — assets | Not started | No asset hook is imported under Purchasing; the shopping list's own hooks are `useShoppingListCharacterAssets.js` / `useShoppingListCorporationAssets.js` | `Components/Dialogues/Shopping List/Hooks/` | confirmed |
| I — Job costs and setups | Not started | `InventionCostsCard` is a grid card; `JobSetupInfoFrame` sets `overflowX: auto` above five setups and prints no install cost; Extras editor is on Complete | `Invention Costs/inventionCostsCard.jsx`; `JobSetupInfo/JobSetupInfoFrame.jsx` lines 53–56; `Complete/Standard Layout/Extras Panel/extrasEditor.jsx` | confirmed |
| J — mobile | Not started | `Purchasing_MobileLayout_EditJob` returns `null`; `LayoutSelector_EditJob_Purchasing` always renders the standard layout; the list is `overflowY: scroll`, `maxHeight: 600` at `xs` | `Mobile Layout/mobileLayout.jsx`; `layoutSelector.jsx`; `standardLayout.jsx` lines 155–167 | confirmed |
| Inherited — duplicated structure display | Open | The Planning copy is gone (planning-stage-panels Stage R); `JobSetupInfoFrame.jsx` keeps its own `UseCustomStructure` / `UseDefaultStructures` where `setupFacility.js` and `useFacilityWords` now own the derivation | `JobSetupInfoFrame.jsx`; `Functions/Industry Facilities/setupFacility.js` | updated 2026-10-05 |

### Discrepancies

Every status row is confirmed. The discrepancies are in the plan's account of **today**, which the
remaining stages are built on:

- **`Material.importPurchase` has no production caller.** § Starting position says "Only
  `passBuildCosts.js`, importing a child's cost, goes through `Material.importPurchase` on the class."
  It does not: `passBuildCosts.js:168` calls `applyCommands(job, importPurchaseToMaterial(...))`, which
  runs `recordPurchase`. The only call to `.importPurchase(` in the SPA is `Classes/jobMaterial.test.js`.
  So all three paths today share one implementation (`recordPurchase`), and the class method is the
  fuller but unused one. Stage F1's fold is still the right move and its reasoning still holds, but the
  description "two paths through one, one through the other" should be corrected before the stage is
  written, because the test that proves "all three paths reach `Material.importPurchase`" starts from
  zero, not one.
- **`getMarketPriceForType` is `readMarketPriceForType`.** § Starting position names the former;
  the function the form calls is `readMarketPriceForType` from
  `Functions/MarketData/prices/marketPriceForType.js`.
- **The full-ladder consumers are named loosely.** § Starting position says `shoppingList.js`,
  `useWatchlistPricing.js` and `OutputCard.jsx` "run the full ladder". They do, but through
  `resolveFor` in `Functions/MarketData/defaults/priceResolution.js` rather than calling
  `getEffectiveMaterialPriceHub` directly; the direct callers are `useMaterialsSourcing.js`,
  `useJobSellingContext.js` and `materialPricing.js` itself. Stage A should pick one of these two entry
  points deliberately (see Work under Stage A).
- **The reprocessing precondition has been met.** § Handed from the reprocessing rebuild says the ore
  panel "needs that project's engine and solver (its Stages C–E)". Reprocessing's status table now reads
  C **Complete**, D **D1 and D3 landed** (D2 waits on an in-game check), E **Complete**, and
  `valueOrePlan` is at `Functions/Reprocessing/valuation/valuation.js:128`. The panel waits on this
  project now, not on that one.

## What each remaining step changes

Every stage is remaining. Where the plan leaves a target shape unspecified it is said so, and the
proposed shape is marked as a proposal.

### Stage A — the price ladder on this stage

**Today.** `addMaterialCosts.jsx` resolves a price per card, two rungs short:

```js
const { marketLocation, orderType } = useEffectiveMarketHub(localPricing, PRICING_SIDE.BUYING);
useMarketPricesQuery([{ typeID: material.typeID, marketLocation }]);
const materialPrice = readMarketPriceForType(material.typeID, marketLocation, orderType);
```

`useMaterialsSourcing.js` (Planning) resolves the same material with
`useEffectiveMarketHub` → `useMaterialGroupPricing({...})` → `getEffectiveMaterialPriceHub(...)` →
`readMarketPriceForType(...)`, so the two stages can quote different figures for one row.

**After.** One row model per panel runs the three calls once and hands each row
`{ marketLocation, orderType, rung }`; the drawer's Price field pre-fills from the row. Proposed row
shape (the plan names the fields in prose, not as a type):

```js
/** @typedef {{ typeID:number, needed:number, covered:number, stillToGet:number, paid:number,
 *   average:number|null, price:{ unit:number|null, marketLocation:number, orderType:string,
 *   rung:"material"|"group"|"job"|"account"|"global" }, source:{ kind:"hub"|"child"|"ore", … },
 *   status:"to-buy"|"part-bought"|"awaiting-child"|"covered", excess:number }} PurchasingRow */
```

**Work.**
1. Add a `usePurchasingRows` hook beside the stage (one per panel) that calls `useEffectiveMarketHub`,
   `useMaterialGroupPricing` and `getEffectiveMaterialPriceHub`, taking the same inputs
   `useMaterialsSourcing.js` lines 73–111 take, and fans `pricesWanted` once.
2. Decide the entry point: call `getEffectiveMaterialPriceHub` directly (as Planning does) or
   `resolveFor` from `priceResolution.js` (as the shopping list and watchlist do). Either is the full
   ladder; the first keeps the two Edit Job stages textually identical, the second is the lower-level
   shared resolver.
3. Pre-fill the entry form from the row's resolution and state the rung in the row and the drawer.
4. A test that renders Planning's `useMaterialsSourcing` and the new hook over one job with a material
   override and a group default and asserts equal unit prices.
5. Correct `readMarketPriceForType` and the three consumer names in § Starting position.

**Wire.** Client only.

### Stage B — the materials worklist

**Today.** `standardLayout.jsx` filters `Object.values(materials)` by `hideCompleteMaterials`, then
sorts with `getMaterialStatus(a)` / `getMaterialStatus(b)` inside the comparator, each call re-walking
`jobArray` through `calculateChildJobData`, and renders `MaterialCardFrame_Purchasing` per row in a
`Grid` sized `xs:12 sm:6 md:4 lg:3`.

**After.** The row model from Stage A is built once (`rows.map(toRow)` then `sort`), and rendered in
the table shape Planning's `materialsTable.jsx` uses — `ColumnHeaderRow` from
`Styled Components/Table/tableParts.jsx`, a `COLUMNS` array, one `TableRow` per material, the drawer
row as a `TableCell colSpan` beneath it. Planning's columns are `Material, Qty, Source, Market, Build,
Δ, Plan`; this stage's are `needed, covered, still to get, paid, average, source, status` per the plan.
The three status boxes become one chip plus a left accent stripe; `excess > 0` adds an "N extra" chip
beside the status.

**Work.**
1. `usePurchasingRows` returns sorted rows; the comparator reads `row.status` and `row.name` only.
2. `materialsWorklist.jsx` on `tableParts.jsx`, with `PlanChip`-style chips (see
   `Planning/.../planChip.jsx`) for status and excess.
3. Delete `materialCardFrame.jsx`, `materialQuantityInfoSingleRow.jsx`, `materialQuantityInfoDoubleRow.jsx`,
   `awaitingCostImportBox.jsx`, `materialExcessBox.jsx`, `materialCompleteBox.jsx`, `childJobsAvatar.jsx`
   and their tests; keep `childJobSupplyForMaterial.js` as a row-model input.
4. A test counting `childJobIDsAfterEdits` calls per render (one per material, not O(n log n)).
5. Leave `source.kind` open to a third value for the ore panel (§ Handed from the reprocessing rebuild).

**Wire.** Client only.

### Stage C — the drawer

**Today.** The ledger (`MaterialCostsFrame_Purchasing`, chips with a hover for what was counted), the
form (`AddMaterialCost_Purchasing`, mounted for every card, removed when covered) and the child-job
dialogue (`ContentDialogue` + `ChildJobLinks`, one per card, body rendered only while open) are three
regions of one card.

**After.** One `Collapse` under the open row, the way Planning's `materialDrawer.jsx` already does it
("More than one can be open at once, and each stays with its row"), with two zones: *What was paid*
(ledger rows stating the counted quantity in text, plus the entry form starting at `0` when covered)
and *Where it comes from* (the two lists from `availableChildJobs.jsx` / `existingChildJobs.jsx`, the
unlink as a muted icon with an inline confirm). The dialogue and its three files go.

**Work.**
1. `purchasingDrawer.jsx` on `InsetSurface` + `Collapse`, body rendered only while `open`, driven by an
   `openRows` set held in the worklist (Planning's pattern).
2. Move the ledger to rows (`countedFromPurchase` from `materialSelectors.js` for the counted text).
3. The form: drop the `if (stillToBuy <= 0) return null`, default quantity `stillToBuy` (0 when covered),
   price from the row's resolution.
4. Sourcing zone from the two list components, `useSiblingLinkLock` kept, unlink confirmed inline.
5. Delete `Child Job Dialogue/` (3 files + test).
6. Tests: several rows open at once, drawer body absent while closed, unlink confirm.

**Wire.** Client only.

### Stage D — when a child's cost may be taken

**Today.** `passBuildCostsToParentJobs(jobs)` (Complete stage button, group side menu, Price Entry
dialogue) pushes a child's per-item cost to its parents through `distributeItemCostsBetweenJobs`, writing
one purchase with `childID: costEntry.id` and refusing a repeat via `isMaterialPurchased`. The parent's
card shows `AwaitingCostImportBox_Purchasing` when `remainingTotalToBeImported > 0` and nothing else about
the child.

**After.** The drawer's sourcing zone offers **Take cost** for one child, calling the same distribution
for `[child]` → `[thisJob]`, enabled only when the child is "ready" (see Decisions), and otherwise names
the child, its stage (`jobStatus`) and what is blocking it, with `OpenChildJobButton` (Planning's
`Child Job Drawer/openChildJobButton.jsx`) to open it.

**Work.**
1. Extract a `takeChildCost(parentJob, childJob)` from `passBuildCosts.js` that runs the existing
   collect → distribute for one pair, so the push and the pull are one code path.
2. A readiness predicate on `jobSelectors.js` (today `isReadyToBuild` at line 389 means "every material
   bought"; `isReadyToStart` adds "no linked ESI run"; neither means "finished") — which one gates the
   pull is the decision below.
3. Blocker text from what the parent already holds: the child's `jobStatus` and its unbought material
   count.
4. Tests: ready child offered, unready child named with its blocker, second import refused.

**Wire.** Client only.

### Stage E — Purchase Summary

**Today.** `PurchasingDataPanel_EditJob`: three `Typography` lines (complete-items count, material cost,
cost per item), a `Switch` for `hideCompleteMaterials` saved through
`scheduleDebouncedApplicationSettingsSave`, two buttons hidden while anything is complete, and the two
`…ApplicationSettings` selects writing `localPricing.buying.{market,orderType}` through `setJobPricing`.

**After.** Headline **ISK still to get** (sum over rows of `stillToGet × price.unit`), a coverage bar
with four value-weighted segments (paid · built · awaiting child · to buy) that sum to the planned cost,
the material count as the hide switch's caption, both buttons always present, and the order type picker
`Styled Components/Select/pricingOrderType.jsx` in the header where Planning mounts it.

**Work.**
1. Totals derived from the Stage A rows, not re-computed from `materials`.
2. The bar on `Styled Components/Charts` conventions, colours from `costParts.js` (`bought`, `built`,
   `paid`) so Planning's proportion bar and this bar agree.
3. Replace the two selects with `pricingOrderType.jsx` and the market select already on it.
4. Tests: segments sum to planned cost; buttons present when every material is covered.
5. Leave the bar's *paid* segment to absorb recorded ore (no new segment — § Handed from the
   reprocessing rebuild).

**Wire.** Client only.

### Stage F1 — one place that records a purchase

**Today.** Two implementations of one row, only one of them live:

```js
// jobCommands.js:407 — reached by all three paths
function recordPurchase(job, materialID, purchase, options) {
  const { availableToBuy = 0, recordExcess = false } = options ?? {};
  const offered = Number(purchase?.itemCount) || 0;            // no isValidPurchase guard
  const taken = Math.max(0, Math.min(offered, availableToBuy));
  const id = String(purchase.id);                               // not keyPurchasesByID
  material.purchasing[id] = { id, childID, childJobImport: Boolean(childID), itemCount: recorded, itemCost: purchase.itemCost };
}
// Classes/jobMaterial.js:75 — reached by nothing in production
importPurchase(purchase, { availableToBuy = this.quantityRemaining, recordExcess = false } = {}) { … isValidPurchase … keyPurchasesByID … }
```

A multibuy cost cell that fails `parseNumberWithSeparators` arrives as `NaN` in `itemCost`; nothing
refuses it, `countedPurchases` filters it out of the total, and the chip renders at `opacity: 0.55`.

**After.** The command rebuilds the row through the class and stores `toDocument()`, as `addExtrasCost`
and `addInventionCost` do:

```js
function recordPurchase(job, materialID, purchase, options) {
  const row = job.build.materials[String(materialID)];
  if (!row) return;
  const material = new Material(row, (typeID) => materialRequirementOf(job.build.setup, typeID));
  const outcome = material.importPurchase(purchase, options);
  job.build.materials[String(materialID)] = material.toDocument();
  return outcome;
}
```

A `NaN` cost is refused at the write, which is a behaviour change the plan intends.

**Work.**
1. The fold above; `importedQuantities` stays as the pre-flight the form and the paste already use.
2. `Material.importPurchase` becomes the only writer; test coverage moves from `jobMaterial.test.js`
   alone to `editJobMutators.purchasing.test.jsx` for all three paths (it already covers two).
3. Settle undo granularity (Decisions) and fix it with a test on `jobDraftStore.js`'s `coalesces()`.
4. Tests: malformed row refused; `passBuildCosts.js` round trip unchanged; multibuy writes identical rows.
5. Correct § Starting position's account of which paths reach the class.

**Wire.** Client only. Stored rows are the same shape; the difference is that invalid rows are no
longer written.

### Stage F2 — the frozen plan price

**Today.** A material in the document:

```json
{ "typeID": 34, "name": "Tritanium", "jobType": 0, "volume": 0.01,
  "purchasing": { "3b77…": { "id": "3b77…", "childID": null, "childJobImport": false, "itemCount": 1000, "itemCost": 4.2 } } }
```

```go
type JobMaterial struct {
	TypeID     int                 `json:"typeID" bson:"typeID"`
	Name       string              `json:"name" bson:"name"`
	JobType    int                 `json:"jobType" bson:"jobType"`
	Volume     float64             `json:"volume" bson:"volume"`
	Purchasing map[string]Purchase `json:"purchasing" bson:"purchasing"`
}
```

**After.** One optional record, written on the first purchase that carries a price and never again.
The plan names its contents (unit price, hub, order type, rung, when) but not its field names; the
shape below is a **proposal**:

```json
{ "typeID": 34, "…": "…",
  "planPrice": { "unit": 4.2, "marketLocation": 60003760, "orderType": "sell", "rung": "group", "at": "2026-10-05T10:21:00Z" } }
```

```go
// PlanPrice is the market price a material was planned at, written at its first purchase.
type PlanPrice struct {
	Unit           float64   `json:"unit" bson:"unit"`
	MarketLocation int       `json:"marketLocation" bson:"marketLocation"`
	OrderType      string    `json:"orderType" bson:"orderType"`
	Rung           string    `json:"rung" bson:"rung"`
	At             time.Time `json:"at" bson:"at"`
}
// on JobMaterial:
PlanPrice *PlanPrice `json:"planPrice,omitempty" bson:"planPrice,omitempty"`
```

**Work.**
1. `Material` gains `planPrice` (default `undefined`), `toDocument()` omits it when absent, and
   `importPurchase(purchase, { …, planPrice })` sets it only when `this.planPrice` is unset and the option
   is given. `passBuildCosts.js` passes none, which excludes child imports as the plan requires.
2. The row model (Stage A) is where the price is resolved — a command is a pure recipe with no access to
   hooks — so the form and the paste pass `planPrice` built from the row into `importPurchaseToMaterial`
   / `importPurchasesToMaterials`. The plan's sentence "resolved once in `jobCommands`" should read
   "written once in `jobCommands`, from the row model's resolution".
3. Go: `PlanPrice` type and pointer field with `omitempty` on both tags in `services/shared/models/job.go`;
   `go fix -diff` on `services/shared/models` before and after; bring that file's in-body comments
   (`// coerced on historic import`, `// Purchasing is keyed …`, the doubled doc comment at lines
   699–700) to the two-line rule in the same change.
4. The drawer and summary show "against plan" only when the record exists.
5. Tests: first-purchase-wins; omit shape in `jobWrite.corpus.test.js`; both SPA paths through
   `tests/editJobHarness.jsx`; a Go round trip in `job_model_parity_test.go`.

**Wire.** **Additive.** Older documents read as unset; an older client ignores the field. No
`prepareRelease` step — the plan's "No migration" holds, and nothing could reconstruct a past price.

### Stage G — the multibuy paste, reviewed

**Today.** The button handler in `purchsingDataPanel.jsx` builds `imports` in one pass — exact-name
match, skip when `stillRequired <= 0`, cap through `importedQuantities(purchase, stillRequired)`, then
`actions.run(importPurchasesToMaterials(imports))` — and reports `No Matching Items Found` or
`Nothing Left To Buy`.

**After.** The same matching produces a list of outcomes shown in a `ContentDialogue` mounted only while
open, each line one of five fates with a tick, applied as one `importPurchasesToMaterials` command when
confirmed. Proposed line shape:

```js
/** @typedef {{ line:string, materialID?:number, fate:"fills"|"over"|"covered"|"child-covered"|"unmatched",
 *   quantity:number, cost:number, taken:number, leftOver:number, include:boolean }} PasteLine */
```

**Work.**
1. Move the matching into a pure `reviewMultibuyPaste(matches, rows)` beside the stage, unit-tested.
2. The dialogue on `Styled Components/Dialogue/ContentDialogue`.
3. Overage: pass `recordExcess` to match the manual form, or cap both — the decision below.
4. Tests: five fates; a paste that changes nothing says so; the applied command equals today's rows for
   a plain paste.

**Wire.** Client only.

### Stage H — what a player already holds

**Today.** Nothing on Purchasing reads assets. The shopping list reads them through
`useShoppingListCharacterAssets.js` / `useShoppingListCorporationAssets.js` behind its own switch and
one location (`assetLocationsSelection.jsx`).

**After.** The row carries `held: number|null` from the shopping list's cached index for the same
job's scope, shown as a muted figure, pre-filling the form's quantity with the price blank; absent when
the choice is off (default) or signed out.

**Work.**
1. A read-only accessor over the shopping list's reducer/state for `(scope, typeID) → held`, with no
   new ESI call (verify by asserting `useAssetsOfType` is not invoked from the stage).
2. Row model consumes it; drawer pre-fills quantity.
3. Tests: no read with the choice off; scope equals the shopping list's for the same job.

**Wire.** Client only.

### Stage I — Job costs, and the setups

**Today.** `InventionCostsCard` is a grid cell beside the material cards; `JobSetupInfoFrame` lays
setups out as `Paper` cards in a flex row with `overflowX: auto` above five and prints ME/TE, runs,
jobs, structure and quantity planned — no install cost; Extras is `Complete/Standard Layout/Extras Panel/`.
`buildCostOf` in `useBuildCost.js` sums materials, install, extras and invention, and `costParts.js`
draws six parts in `BUILD_ORDER = [bought, built, paid, install, invention, extras]`.

**After.** One panel: Invention and Extras side by side as line lists with totals, Installing full
width beneath as a per-setup list — cards up to two, a table from three, grouped unconditionally on
structure/system/ME-TE/runs/install with `×N`, scrolling past six — with dots from
`costPartColour(theme, id)`.

**Work.**
1. `jobCostsPanel.jsx` with three zones; totals from `useBuildCost`.
2. Setup list component with the two-shape rule and unconditional grouping; install cost per setup from
   the same figure `getJobInstallCostForPlanning` produces.
3. Extract the shared structure display (`UseCustomStructure` / `UseDefaultStructures`) once, used by
   this panel and `jobSetupCard.jsx` (the inherited duplication).
4. Extras: move or mirror `extrasEditor.jsx` (Decisions). Keep the Extras zone able to show an
   *estimate* row for a category with nothing recorded (the ore hauling hand-off).
5. Delete `JobSetupInfoFrame.jsx` and `inventionCostsCard.jsx` with their tests.
6. Tests: shape switch at three; scroll past six; grouping on every field; dots equal `costParts.js`.

**Wire.** Client only.

### Stage J — mobile

**Today.** `layoutSelector.jsx` always returns the standard layout; `mobileLayout.jsx` returns `null`;
the list is a 600px nested scroll region at `xs`.

**After.** The selector picks the mobile layout below `sm`; the worklist renders the card variant of the
row (Planning's `materialCards.jsx` is the precedent), the drawer is a bottom sheet with the form first,
and the list scrolls with the page.

**Work.**
1. `layoutSelector.jsx` chooses by breakpoint as Planning's does.
2. Card variant on the shared row model; sheet drawer; remove `maxHeight`/`overflowY` on the list.
3. Tests: no nested scroll region; summary keeps bar and headline at phone width.

**Wire.** Client only.

## Decisions needed

### What one undo step takes back after F1

**Question.** When the command replaces the whole material row, two purchases on one material within
`TYPING_COALESCE_MS` (800 ms) can merge into one undo step — is that acceptable?

**Why it is James's call.** `jobDraftStore.js:353 coalesces()` merges consecutive entries with the same
command name and patch paths when every patch is a `replace`. Today a purchase is an `add` at
`build/materials/<id>/purchasing/<purchaseID>` and never merges; after the fold it is a `replace` at
`build/materials/<id>`. The plan says a test must fix the intended behaviour and does not say which.

**Options.**
- *Accept coalescing.* Simplest; the inverse patch still restores the exact prior row. Two human
  purchases inside 800 ms are unlikely, and the paste is already one command.
- *Write only the new key.* The command still builds through the class but assigns
  `row.purchasing[id] = material.purchasing[id]` rather than the whole row, keeping the `add` op. It
  keeps per-purchase undo but reintroduces a second statement of what the command writes.
- *Exempt by command name.* `coalesces()` skips `"add purchase"`. One line, but a special case in the
  undo store for one command.

**Recommendation.** Accept coalescing and fix it with a test; it is unreachable by hand and the paste
is already a single step.

**Blocked until decided.** F1's done-when ("a test fixes how far one undo step reaches").

### Overage on the multibuy paste

**Question.** Does a pasted line that exceeds what is still needed keep the surplus as excess (as the
manual form does with `recordExcess: true`) or drop it (as the paste does today)?

**Why it is James's call.** It changes what is stored: today a paste of 1,200 against a need of 1,000
stores `itemCount: 1000`; the form stores `1200` and the excess chip shows 200. Stage G's done-when
requires the two to agree but the plan does not say which way.

**Options.**
- *Keep as excess.* The units were bought; the excess chip and the eventual hand-off to a sibling need
  the true count. The review line reads "200 more than this job needs, not charged to it".
- *Cap both.* Simpler ledger, but the manual form loses a behaviour it has, and over-bought units
  disappear from every figure.

**Recommendation.** Keep as excess on both paths.

**Blocked until decided.** Stage G's review copy and its tests; the `recordExcess` option on the paste.

### Extras on Purchasing: move, mirror or stay

**Question.** Does the Extras editor move from Complete to the Job costs panel, render on both stages
over the same rows, or stay on Complete with Job costs showing totals only?

**Why it is James's call.** The plan defers it as "a decision about Complete, taken with it", and the
ore hand-off needs an *estimate* row in whichever Extras zone exists on this stage.

**Options.**
- *Mirror.* `extrasEditor.jsx` becomes a shared component mounted on both stages over
  `build.extrasCosts`. No data change; two entry points to one list.
- *Move.* Purchasing owns entry; Complete shows a read-only summary. Cleaner ownership, but a courier
  paid after the build has no editor on the stage the player is then on.
- *Stay.* Job costs shows the extras total and links to Complete. Least work; the hauling estimate
  then has no row to sit beside.

**Recommendation.** Mirror, with one shared editor; the estimate row follows the rows wherever they
render.

**Blocked until decided.** Stage I's Extras zone; the hauling-estimate seam for the ore panel.

### What "ready" means for taking a child's cost

**Question.** Is a child's cost offered when every material of the child is bought (`isReadyToBuild`),
when it has no unfinished linked run (`isReadyToStart` and beyond), or only when the child's
`jobStatus` is Complete?

**Why it is James's call.** The plan names `jobStatus` "with `isReadyToBuild` as the softer line" and
does not pick. The import is one-shot (a second is refused), so a gate that is too soft freezes a
provisional figure permanently; one that is too hard makes the pull useless until the child is closed,
which is when the push already fires from the child's own Complete stage.

**Options.**
- *All materials bought* (`isReadyToBuild`). The child's material cost is final; install and extras may
  still change.
- *Build finished* (linked ESI runs delivered, or `jobStatus` at Complete). Every component of
  `buildCost` is final; the pull and the push then fire at the same moment, so the pull's value is
  letting the parent initiate it.

**Recommendation.** Build finished, matching the rule that a cost reaches a parent only when the child
is done; show the softer state as the blocker text ("bought for, not yet built").

**Blocked until decided.** Stage D's gate and its three tests.

### The frozen record's field names

**Question.** What are the field names and types of the plan-price record, in the document and in Go?

**Why it is James's call.** It is a persisted, cross-process shape; the plan names the contents in
prose only. The proposal above (`planPrice: { unit, marketLocation, orderType, rung, at }`) reuses the
names `localPricing.buying.{market,orderType}` and `Purchase.ItemCost` already imply, but `market` vs
`marketLocation` and `at` vs a `recordedAt` are open.

**Options.** Take the proposal; or mirror `localPricing`'s `market`/`orderType` exactly.

**Recommendation.** The proposal, with `marketLocation` because that is the name the resolver hooks use.

**Blocked until decided.** Stage F2 in both languages.

## Dependencies and order

**Waits on.** Nothing hard. The ladder hooks it adopts exist (`useEffectiveMarketHub.js`,
`useMaterialGroupPricing.js`, `materialPricing.js`); Planning's table (`materialsTable.jsx`,
`tableParts.jsx`), drawer (`materialDrawer.jsx`) and picker (`pricingOrderType.jsx`) exist and are
marked Done in planning-stage-panels. Planning's Stage Q (stepper → tabs) has since landed;
`editJob.jsx` renders tabs, and no file under Purchasing imports from it, so the independence the
contents file claims held.

**Waited on by.** The ore panel from reprocessing-rebuild § Not in the sequence. Its engine side is
further along than the plan records (C and E complete, D1/D3 landed), so this project's B, C, F1 and I
are now the only things between the design and the build. One wording difference between the plans:
reprocessing's § Not in the sequence says the ore panel waits on "worklist and drawer stages (B and C)";
this plan says B, C, F1 and I. This plan is right — recording goes through F1's funnel and the hauling
estimate needs I's Extras zone — and the reprocessing plan should say so when next touched.

**Recommended next slice.** Stage A alone, as the plan says: it is a correctness fix on a live
surface, needs no decision above, and F2 cannot be trusted without it. Take the two § Starting position
corrections (the `importPurchase` callers, `readMarketPriceForType`) with it so F1 starts from an
accurate description. Then B → C with Planning's drawer as the template, then F1 → F2 once the undo and
field-name decisions are taken.
