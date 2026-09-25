# Measurements — the edit page as it stands

Collected 2026-09-11 from `feature/shared-planners`, before any stage of this project. Counts exclude
`*.test.js(x)` unless a row says otherwise. Commands are recorded so a later reading can be compared
with this one.

## The classes a job rebuild constructs

```bash
wc -l frontend/src/Classes/{job,jobSetup,jobMaterial,marketOrder,linkedESIJob,extraCost,inventionEntry,brokerFee,transaction}.js
```

| File | Lines |
|------|-------|
| `Classes/job.js` | 1240 |
| `Classes/jobSetup.js` | 491 |
| `Classes/jobMaterial.js` | 268 |
| `Classes/marketOrder.js` | 207 |
| `Classes/linkedESIJob.js` | 184 |
| `Classes/transaction.js` | 192 |
| `Classes/brokerFee.js` | 94 |
| `Classes/extraCost.js` | 71 |
| `Classes/inventionEntry.js` | 66 |
| **Total** | **2813** |

`UPDATE_ACTIVE_JOB` runs `new Job(payload)`, whose constructor rebuilds every setup, material, linked
ESI job, market order, transaction, broker fee, extras cost and invention entry on the job. Every one of
those nine classes is reachable from one edit to one field.

## The re-render surface

| Measure | Count | Command |
|---|---|---|
| Files under `Edit Job` reading `state.activeJob` | 56 | `grep -rl 'state.activeJob' …'Components/Edit Job'` |
| `memo` wrappers under `Edit Job` | **0** | `grep -rn 'React.memo\|[^e]memo(' …'Components/Edit Job'` |
| `useMemo` call sites under `Edit Job` | 16 | `grep -rn 'useMemo(' …'Components/Edit Job'` |
| `updateActiveJob` call sites | 32 | `grep -rn 'updateActiveJob(' … frontend/src` |
| Files calling `updateActiveJob` | 26 | `grep -rl 'updateActiveJob' … frontend/src` |

Each command above is `grep` over `--include='*.js' --include='*.jsx'`, piped through
`grep -v '\.test\.'`, which is the `…` in the table. The `useMemo` row counts calls, not matching
lines: the bare term matches 27 lines across 11 files, 11 of which are the import.

State and actions reach those files by `{...props}` spread through
`Components/Edit Job/EditJobStepContentSelector.jsx` into each step's layout selector. With no `memo`
anywhere in the tree, a new `activeJob` identity re-renders all of it.

## The class's reach beyond the edit page

| Measure | Count |
|---|---|
| Non-test files constructing `new Job(...)` | 11 |
| Non-test files importing `Classes/job` | 23 |

Constructors outside `Edit Job`: `Functions/JobPlanner/buildJob.js`, `mergeJobs.js`,
`massBuildMaterials.js`, `moveItemsOnPlanner.js`, `deleteMultipleJobs.js`,
`Functions/Debounce/inboundJobDocumentsCoalesce.js`, `Functions/Endpoints/Private/jobDocuments.js`,
`requestJobDocumentsByIds.js`, `Components/Archived Jobs/ArchivedJobsList.jsx`.

`jobArray` in the store holds instances, `toDocument()` is the persistence contract read by
`Functions/JobDocuments/saveJobsViaApi.js`, and the inbound websocket coalescer reconstructs instances
on delivery. This is why § What happens to the classes is staged rather than landed at once.

## The reducer

| Measure | Count |
|---|---|
| Action types in `editJobReducer.js` | 19 |
| Lines in `editJobReducer.js` | 436 |
| Lines in `useEditJobReducer.js` | 336 |

Of the 19, two (`UPDATE_ACTIVE_JOB`, `SET_ACTIVE_JOB`) carry every field edit on the job. Ten maintain
the two add/remove intent sets. The rest are loading state, step movement, and the speculative and
temporary child job maps.

## Stored fields that are derived from their neighbours

Read from `Classes/jobSetup.js`. Each is written by a recalculation that reads the fields beside it, and
each is also persisted:

| Field | Derived from |
|---|---|
| `materialCount` | the blueprint's materials, `runCount`, `jobCount`, `ME`, structure and rig |
| `estimatedTime` | `rawTime`, `TE`, `runCount`, structure and rig |
| `estimatedInstallCost` | the system cost index, the job's value, `taxValue` |
| `rawTime` | the blueprint activity time |

`Material.quantity` is the counter-example: derived from the setups' `materialCount` through
`Job#materialRequirement` and deliberately not stored.

## Row collections and the key each already carries

Read from the constructors in `Classes/`. Every collection a patch would need to address is already
id-bearing and stored as an array:

| Collection | Key present on each row |
|---|---|
| `build.setup` | `id` — **already a map** |
| `build.materials` | `typeID` |
| `build.materials[].purchasing` | `id` (a uuid assigned on import) |
| `build.costs.extrasCosts` | `id` |
| `build.costs.inventionEntries` | `id` |
| `build.costs.linkedJobs` | `job_id` |
| `build.sale.marketOrders` | `order_id` |
| `build.sale.transactions` | the transaction id |
| `build.sale.brokersFee` | the fee's own id |

## Still to measure

Not needed for Phase 1, wanted before the stage named beside each:

- **Document size, before and after the removals** — the four derived setup fields, as a share of a real
  job document. Take it from the live snapshot rather than a synthetic job, and from jobs with several
  setups rather than one. `rawData` is not among them; [plan.md](../plan.md) § Stored derived figures
  come out says why it stays. *Before Stage 1.*
- **Renders per keystroke on a real job**, using the React profiler on a job with a full material list —
  the figure Stage 3 is judged against. *Before Stage 3.*
- **Repeated `typeID` rows in `build.materials` across the live snapshot.** The conversion uses
  `$arrayToObject`, which keeps the last value for a repeated key, so any job carrying two rows of one
  type loses one as it is rewritten. A count of zero is what lets the step run; anything else needs
  answering first. *Gates Stage 2.*
- **The update pipeline proven against real job documents** — `$arrayToObject` over `$map`, with
  `$toString` on the key and `$ifNull` for an absent array, run against a restored copy rather than
  invented rows. *First work in Stage 2.*

## Re-measured 2026-09-20, before Stage 3

Taken against `feature/shared-planners` with Stages 1 and 2 landed. Where a figure differs from the
section above, the earlier one counted a narrower thing; both are kept so the difference is visible
rather than silently corrected.

### The consuming surface is wider than `state.activeJob`

| Measure | Count |
|---|---|
| Files under `Edit Job` reading any `state.<field>` or `actions.<dispatcher>` | 79 |
| Files reading a `state.<field>` specifically | 59 |
| Files reading `state.activeJob` specifically | 56 |
| Files outside `Components/Edit Job` reading these fields | 3 |
| Action types in `editJobReducer.js` | 21 |

The 56 above counts files naming `state.activeJob`; the reducer carries seven other fields, and a file
reading only `state.temporaryChildJobs` or `state.isLoading` re-renders on every dispatch just the same.
The three outside the page are `Functions/JobPlanner/recalculateJobFromSetup.js`,
`Functions/Sentry/sentryErrorContextHints.js` and `Hooks/DocumentLock/useDocumentLockState.js`, so the
state shape is already an informal cross-module interface rather than private to the page.

### Derived figures, and where they are read

171 call sites across 44 non-test files: **70 on the edit page, 101 elsewhere**. 28 distinct getters plus
three derived methods (`buildCostPerItem()`, `totalCostPerItem()`, `averageItemSalePrice()`).

| Getter | Total | Edit Job | Elsewhere |
|---|---|---|---|
| `totalQuantityProduced` | 45 | 18 | 27 |
| `esiJobIDs` | 15 | 4 | 11 |
| `selectedSetup` | 11 | 11 | 0 |
| `esiOrderIDs` | 9 | 1 | 8 |
| `esiTransactionIDs` | 9 | 1 | 8 |
| `parentJobIDs` | 8 | 1 | 7 |
| `totalInstallCost` | 7 | 2 | 5 |
| `totalExtrasCost` | 7 | 2 | 5 |
| the remaining 21 getters | 53 | 26 | 27 |

`selectedSetup` is the one getter wholly owned by the editor. `lastRunToFinish` has no call site at all.

### Why the editor is not a clean boundary

Several files under `Edit Job` read derived figures off jobs pulled from `jobArray` rather than off the
job being edited — `Purchasing/.../materialCardFrame.jsx` totals `job.totalQuantityProduced` across the
child jobs it filters out of the store, and `childJobSupplyForMaterial.js`, `Purchasing/.../standardLayout.jsx`,
`finaliseCreatedChildJobs.js` and `parentJobOptions.jsx` do the same. Two files under the page mutate
jobs other than the active one.

Above that, the transport layer hydrates every inbound document into an instance —
`Functions/Debounce/inboundJobDocumentsCoalesce.js:97`, and the three `Endpoints/Private` readers — so
the store is instance-typed regardless of what the editor holds. **Store jobs therefore stay `Job`
instances through Stage 3**, and the re-render win is collectable only on panels reading the active job.

### Mutation of instances outside the edit page

50 sites across 15 files: 44 mutating method calls and 6 direct property assignments. `mergeJobs.js`,
`repairParentChildRelationships.js` and `normaliseParentChildRelationships.js` are the densest. These are
what § Undo's "edits stop mutating the live instance" has to reach, and they are Stage 5's surface rather
than Stage 3's.

### What already tolerates plain data

`putJobDocumentsBatch` guards with `typeof j.toDocument === "function" ? j.toDocument() : j`
(`Functions/Endpoints/Private/jobDocuments.js:181`), so the persistence path already accepts a plain
document. Four of the seven `toDocument()` call sites are the clone idiom `new Job(x.toDocument())`,
taken for a deep copy before mutating; against a draft that is a structural clone.

### React idioms on the edit page

Counted because Stage 3 was asked whether it collects the React 19 migration the frontend rules describe.
It does not: the mechanical React 18 patterns are already absent from this tree.

| Pattern | Sites under `Edit Job` |
|---|---|
| `forwardRef` | 0 |
| `useContext()` / `<Context.Provider>` | 0 |
| `useActionState` / `useOptimistic` / `useTransition` / `useDeferredValue` | 0 |
| `useEffect` | 9, in 8 files |
| `useMemo` / `useCallback` | 38 |

Of the nine effects, two mutate the job and dispatch it back — `Hooks/useRefreshLinkedESIData.js:27` and
`Hooks/useJobMatchesAndWorldData.js:38` — so Stage 3 rewrites those for § Undo's reason rather than for
idiom. The other seven synchronise with something outside React, which is what an effect is for. The 38
memo sites are the ones worth revisiting: they exist largely because every dispatch produces a new state
identity through a prop spread with no memo boundary, which structural sharing removes the need for.

### The mechanism, verified rather than assumed

Immer 11.1.18 is installed but **transitively only**, via `recharts` and `zustand`; using it means
declaring it directly. Probed against the four properties §§ How a job is held, Undo and A change
arriving mid-edit depend on:

| Property | Result |
|---|---|
| Untouched subtrees stay referentially identical after an edit | Holds — `materials`, `esi` and sibling setups are `===` the base |
| A log re-applies onto a base that has moved | Holds — the inbound change and the local edit both survive |
| A removal inverts | Holds — `remove` inverts to `add` carrying the value, so `undefined` need not mean unset |
| An unapplicable patch is surfaced | **Throws**, naming the path — § The merge, when the lock frees' fourth outcome arrives free |

`new Job(existing)` deep-rebuilds rather than sharing nested objects, confirmed by mutating a clone and
asserting the original: the `backupJob` ref guards against the mutation sites above, not against the
reducer's own clones.

## Re-measured 2026-09-21, before Stage 4

Stage 3 moved every way of changing a job onto a command, and the page onto plain data. What that left
on `Job` had not been counted. Every member of the class, against the whole SPA — a caller under
`Classes/job.js` itself is counted separately, because a member only its own neighbours read is not a
surface anything outside has to be converted off.

Counted with `grep -rn '\.<member>\b'` over `frontend/src`, splitting production from
`*.test.*` and `tests/`. `toDocument` is left out: it is the counterpart of `buildJob` rather than a
derived figure or a mutation, and § What happens to the classes keeps it.

| Member | Kind | Production | Inside `job.js` | Tests |
|---|---|---:|---:|---:|
| `totalQuantityProduced` | getter | 35 | 2 | 5 |
| `esiJobIDs` | getter | 11 | 2 | 9 |
| `parentJobIDs` | getter | 9 | 1 | 1 |
| `esiOrderIDs` | getter | 9 | 0 | 6 |
| `removeParentJob` | method | 9 | 0 | 2 |
| `esiTransactionIDs` | getter | 8 | 0 | 3 |
| `removeChildJob` | method | 8 | 0 | 8 |
| `addChildJob` | method | 7 | 0 | 4 |
| `materialIDs` | getter | 7 | 0 | 7 |
| `isReadyToBuild` | getter | 6 | 1 | 6 |
| `addParentJob` | method | 6 | 0 | 4 |
| `setupCount` | getter | 6 | 0 | 2 |
| `childJobIDs` | getter | 5 | 1 | 1 |
| `totalExtrasCost` | getter | 5 | 1 | 5 |
| `totalInstallCost` | getter | 4 | 1 | 17 |
| `assignToGroup` | method | 4 | 0 | 2 |
| `buildCost` | getter | 3 | 2 | 14 |
| `completedMaterialCount` | getter | 3 | 1 | 4 |
| `buildCostPerItem` | method | 3 | 0 | 8 |
| `totalBoughtMaterialCost` | getter | 3 | 0 | 1 |
| `totalInventionCost` | getter | 2 | 1 | 9 |
| `involvedCharacters` | getter | 2 | 0 | 1 |
| `keepOnlyChildJobs` | method | 2 | 0 | 2 |
| `keepOnlyParentJobs` | method | 2 | 0 | 2 |
| `nextRunToFinish` | getter | 2 | 0 | 2 |
| `relatedJobIDs` | getter | 2 | 0 | 1 |
| `totalCostPerItem` | method | 2 | 0 | 5 |
| `totalJobSlots` | getter | 2 | 0 | 4 |
| `attachNewSetupToJob` | method | 1 | 1 | 7 |
| `selectedSetup` | getter | 1 | 1 | 4 |
| `setupToBuildFrom` | getter | 1 | 1 | 4 |
| `importPurchaseToMaterial` | method | 1 | 0 | 24 |
| `isReadyToStart` | getter | 1 | 0 | 1 |
| `recalculateSelectedSetup` | method | 1 | 0 | 2 |
| `releaseFromGroupToPlanner` | method | 1 | 0 | 2 |
| `remainingMaterialCount` | getter | 1 | 0 | 1 |
| `setJobStatus` | method | 1 | 0 | 4 |
| `setupSystemIDs` | getter | 1 | 0 | 1 |
| `stepBackward` | method | 1 | 0 | 1 |
| `stepForward` | method | 1 | 0 | 2 |
| `materialRequirement` | method | 0 | 3 | 1 |
| `totalBrokersFees` | getter | 0 | 1 | 14 |
| `totalCost` | getter | 0 | 1 | 4 |
| `totalMaterialCost` | getter | 0 | 1 | 12 |
| `totalSales` | getter | 0 | 1 | 8 |
| `totalTransactionFees` | getter | 0 | 1 | 7 |
| `addExtrasCost` | method | 0 | 0 | 4 |
| `addInventionCost` | method | 0 | 0 | 10 |
| `addMarketOrder` | method | 0 | 0 | 10 |
| `addNewSetup` | method | 0 | 0 | 1 |
| `addTransaction` | method | 0 | 0 | 13 |
| `averageItemSalePrice` | method | 0 | 0 | 4 |
| `deleteActiveSetup` | method | 0 | 0 | 4 |
| `estimatedSalesTaxOutstanding` | getter | 0 | 0 | 5 |
| `lastRunToFinish` | getter | 0 | 0 | 0 |
| `linkESIJob` | method | 0 | 0 | 16 |
| `removeExtrasCost` | method | 0 | 0 | 3 |
| `removeInventionCost` | method | 0 | 0 | 6 |
| `removeMarketOrder` | method | 0 | 0 | 4 |
| `removeMaterialPurchase` | method | 0 | 0 | 4 |
| `removeTransaction` | method | 0 | 0 | 2 |
| `salesByDate` | getter | 0 | 0 | 2 |
| `setSellingPlan` | method | 0 | 0 | 6 |
| `toggleGroupJobReadyForSale` | method | 0 | 0 | 4 |
| `unlinkESIJob` | method | 0 | 0 | 5 |
| `updateLinkedJobData` | method | 0 | 0 | 3 |

### What the counts say

**Twenty members have no caller at all outside their own tests.** They are the mutation methods Stage 3
replaced with commands — `linkESIJob`, `addTransaction`, `addMarketOrder`, `setSellingPlan`,
`deleteActiveSetup` and the rest — plus the figures only those methods fed. Nothing in the running app
reaches any of them.

**Six more are read only by their own neighbours**: `totalCost`, `totalBrokersFees`,
`totalTransactionFees`, `totalSales`, `totalMaterialCost` and `materialRequirement` are each summed by a
getter that does have callers, so they are internal arithmetic rather than a surface.

**The reach that is left is narrow and mostly id lists.** `totalQuantityProduced` at 35 sites is the
widest by a distance; after it come `esiJobIDs`, `parentJobIDs`, `esiOrderIDs`, `materialIDs` and
`childJobIDs` — all of them one line over stored fields. The heavy derived figures the stage was costed
for — `buildCost`, `totalInstallCost`, `buildCostPerItem` — are each read at three or four sites.

**The test counts are the work.** `linkESIJob` is named at sixteen test sites and `totalBrokersFees` at
fourteen, and those tests are where several rules are proven at all. A member cannot be deleted before
what it proves is proven of the command or the function that replaced it.

### What Stage 4 removed, measured afterwards

The table above is the surface as it stood before the stage. Against it, 4a removed twenty members,
4b nine id lists, and 4c five cost figures — thirty-four in all. `Classes/job.js` went from 1,405
lines to 919.

`lastRunToFinish` is the one member measured as having no caller that stays: it is named as an input
by [building-stage-panels](../../building-stage-panels/plan.md) § Stage C. `materialRequirement` and
`#costPerItem` stay and are private, being read only by their own neighbours.

What is left is more than the summands. The four nothing outside the class reads —
`totalMaterialCost`, `totalBrokersFees`, `totalTransactionFees` and `totalCost` — plus
`totalCostPerItem`, the counts and flags the planner and group cards still read off an instance
(`setupCount`, `completedMaterialCount`, `totalJobSlots`, `remainingMaterialCount`,
`totalBoughtMaterialCost`, `isReadyToBuild`, `isReadyToStart`), the setup and run reads
(`selectedSetup`, `setupToBuildFrom`, `nextRunToFinish`, `lastRunToFinish`, `involvedCharacters`), and
the mutation methods that still have production callers through `jobArray`. Every figure among them is
a one-line read of the selector that owns it rather than a second sum. They go with the class itself,
in Stage 5.


## Re-measured 2026-09-24, after Stage 5 steps 1–3

`Classes/job.js` is **533 lines, from 929**. The 919 recorded against Stage 4 is no longer the
baseline: an unrelated commit on this branch has since added to the file, so the journey measured here
is from where the branch actually stood.

What came off, and what it cost:

| Step | Taken off | Call sites moved |
|---|---|---|
| 1 | `setupCount`, `completedMaterialCount`, `totalJobSlots`, `totalCost`, `totalBrokersFees`, `totalTransactionFees`, `totalMaterialCost`, `totalCostPerItem`, `#costPerItem` | 3 — every other reader already called the selector |
| 2 | `selectedSetup`, `setupToBuildFrom`, `isReadyToBuild`, `isReadyToStart`, `nextRunToFinish`, `lastRunToFinish`, `involvedCharacters`, `remainingMaterialCount`, `totalBoughtMaterialCost` | 15 |
| 3 | `stepForward`, `stepBackward`, `setJobStatus`, `removeChildJob`, `keepOnlyChildJobs`, `addChildJob`, `addParentJob`, `removeParentJob`, `keepOnlyParentJobs`, `releaseFromGroupToPlanner`, `assignToGroup` | 42 method calls, across 14 files |

The 42 method calls became 38 `applyCommands` calls: a caller that ran two methods in a row — a merge
relinking a parent, a close trimming both ends — names both commands in one call.

**Step 1's members had almost no call sites because the conversion had already happened** — Stage 4
wrote the selectors and moved the readers, and the getters stayed only as the oracle the tests
compared against. The measurement above records that: nine members, three readers. What the step cost
was the 34 assertions that had to state their own expectations first, across seven files.

Selectors and commands grew by less than the class shrank: `jobSelectors.js` 662 → 781,
`materialSelectors.js` 139 → 174, `jobCommands.js` 531 → 552. The difference is the duplication
between a getter and the selector of the same name.

**What is left on the class**: the constructor, `buildJobObject`, `toDocument`, a private
`#materialRequirement` the constructor hands to each material row, and three members with both a live
production caller and a command equivalent — `importPurchaseToMaterial`, `attachNewSetupToJob`,
`recalculateSelectedSetup`. Every one of those goes in step 4, with the class.

`lastRunToFinish` moved rather than went: it still has no caller, and is still kept because
[building-stage-panels](../../building-stage-panels/plan.md) names it as an input. It is a selector
now, which is the form that project will want.
