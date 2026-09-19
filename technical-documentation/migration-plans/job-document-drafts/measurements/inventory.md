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
