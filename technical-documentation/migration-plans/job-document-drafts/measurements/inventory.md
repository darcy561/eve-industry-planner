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
