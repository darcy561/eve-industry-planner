# Promote drafts — rig-and-structure-attributes

Routing: overlay section → live destination.

| Overlay section | Live destination | Added, replaced, or new |
|---|---|---|
| Stage A — rig security multipliers, `rigSlotBonuses` | `frontend/industry-facilities/bonuses.md` | **New** topic |
| Stage B — `placeConstraints`, pickers, enlistment override, tax as a declared value | `frontend/industry-facilities/constraints.md` | **New** topic |
| Setups are brought back into step when a job is opened (`correctSetupFigures.js`) | `frontend/industry-facilities/bonuses.md` § A setup's stored figures are kept in step | **New** topic (section) |
| Stage C — `appliedRequirementID` removed, four updaters set only what was chosen | Folded into `frontend/settings/custom-structures.md` (form no longer restates a removed requirement path) and `frontend/industry-facilities/constraints.md` (forced fields applied at read time) | Updated |
| Stage D — the published bonus catalogue, the real rigs, the autocomplete rig field, The Fulcrum corrected | `frontend/industry-facilities/bonuses.md` | **New** topic |
| Stage D — legacy rigs kept, rig-conflict rule gains an Edit Job consumer | `frontend/settings/custom-structures.md` § Rig slots | Updated |
| Stage D — reprocessing's own rig/structure reading renamed, rig field becomes an autocomplete | `frontend/reprocessing/structure-panel.md` | Updated |
| Stage E — enlisted militia, upgrade level, install-cost discount | `frontend/industry-facilities/constraints.md` § The militia a setup is costed against, § A factional warfare system lowers install cost | **New** topic (section) |
| Stage E — `esitypes.SystemIndexes.MilitiaFactionID`, `DatasetMilitiaSystems`, `refreshMilitiaSystems` task/trigger/handler/cron, the API merge | `backend/worker/system-indexes.md` | **New** topic |
| Stage E — the militia Redis dataset | `backend/shared/redis.md` § What Redis holds | Updated (one row) |
| "Where these modules live" — the `Functions/Custom Structures` / `Functions/Industry Facilities` split, and the reprocessing rename | Threaded through every frontend draft below rather than stated as its own section, because a live doc names the current path and says nothing about where it used to live | Updated |
| `INDUSTRY_BONUSES` static file | `frontend/static-data/contents.md` (file table row) | Updated |

## Drafts written

| Draft | Live target | Apply |
|-------|-------------|-------|
| [`frontend/industry-facilities/contents.md`](./frontend/industry-facilities/contents.md) | `technical-documentation/frontend/industry-facilities/contents.md` | **New** section |
| [`frontend/industry-facilities/bonuses.md`](./frontend/industry-facilities/bonuses.md) | `technical-documentation/frontend/industry-facilities/bonuses.md` | **New** topic |
| [`frontend/industry-facilities/constraints.md`](./frontend/industry-facilities/constraints.md) | `technical-documentation/frontend/industry-facilities/constraints.md` | **New** topic |
| [`frontend/settings/custom-structures.md`](./frontend/settings/custom-structures.md) | `technical-documentation/frontend/settings/custom-structures.md` | Replaced |
| [`frontend/settings/contents.md`](./frontend/settings/contents.md) | `technical-documentation/frontend/settings/contents.md` | Updated (Owns, Does not own, task map) |
| [`frontend/reprocessing/structure-panel.md`](./frontend/reprocessing/structure-panel.md) | `technical-documentation/frontend/reprocessing/structure-panel.md` | Replaced |
| [`frontend/reprocessing/contents.md`](./frontend/reprocessing/contents.md) | `technical-documentation/frontend/reprocessing/contents.md` | Updated (Does not own) |
| [`frontend/static-data/contents.md`](./frontend/static-data/contents.md) | `technical-documentation/frontend/static-data/contents.md` | Updated (file table row, Does not own, task map) |
| [`backend/shared/redis.md`](./backend/shared/redis.md) | `technical-documentation/backend/shared/redis.md` | Updated (§ What Redis holds, one row) |
| [`backend/worker/system-indexes.md`](./backend/worker/system-indexes.md) | `technical-documentation/backend/worker/system-indexes.md` | **New** topic |
| [`backend/worker/contents.md`](./backend/worker/contents.md) | `technical-documentation/backend/worker/contents.md` | Updated (Owns, Does not own, task map) |
| [`testing/frontend/settings.md`](./testing/frontend/settings.md) | `technical-documentation/testing/frontend/settings.md` | Replaced |
| [`testing/frontend/reprocessing.md`](./testing/frontend/reprocessing.md) | `technical-documentation/testing/frontend/reprocessing.md` | Replaced |
| [`testing/frontend/industry-facilities.md`](./testing/frontend/industry-facilities.md) | `technical-documentation/testing/frontend/industry-facilities.md` | **New** topic |
| [`testing/frontend/contents.md`](./testing/frontend/contents.md) | `technical-documentation/testing/frontend/contents.md` | Updated (task map row) |
| [`testing/services/worker.md`](./testing/services/worker.md) | `technical-documentation/testing/services/worker.md` | Updated (behaviour links, one new § Tested row for the militia systems task) |
| [`testing/services/api.md`](./testing/services/api.md) | `technical-documentation/testing/services/api.md` | Updated (one new § Tested row for the system index militia merge) |

## Why a new `frontend/industry-facilities/` area

`rigs.js`, `industryBonuses.js`, `structureBonusForItem.js`, `placeConstraints.js`, `enlistedFaction.js`
and `getStructureInfo.js` are read from four surfaces — the Settings page's Custom Structures form, the
Reprocessing page's structure panel, the dashboard watchlist, and (once its own owning project promotes)
the Edit Job setup editor — and none of the four owns what they say. The code itself drew this boundary:
the overlay's own "Where these modules live" section states plainly that these facts belong under
`Functions/Industry Facilities/` because they are "what the game says about the place a job runs in,"
not the reader's own saved structures. A live docs area named the same way keeps that boundary visible
rather than duplicating the same facts into whichever route happens to read them first.

## Checked against code

Read directly, past the overlay's own account: `Functions/Industry Facilities/rigs.js`,
`placeConstraints.js`, `enlistedFaction.js`, `industryBonuses.js`, `structureBonusForItem.js`,
`getStructureInfo.js`; `Functions/Reprocessing/reprocessingBonuses.js`; `Context/defaultValues.jsx`
(`placeConstraints`, `manStructure`, `manRigs`, `reactionRigs`, `reprocessingRigs`, `inventionRigs`,
the system tables, `CACHED_DATA_FILES`); `Components/Settings/.../structureFields.jsx` and
`structureForm.jsx`; `Components/Reprocessing/reprocessingStructurePanel.jsx`; `Hooks/useRigSlots.js`;
`Hooks/Static/useIndustryBonuses.js`; `Styled Components/autocomplete/virtualisedRigSearch.jsx`;
`Functions/JobPlanner/correctSetupFigures.js`; `Classes/jobSetup.js`; `Classes/character.js`;
`services/shared/models/job.go`; `services/shared/core/esi/types/types.go`;
`services/worker/tasks/esi/refreshMilitiaSystems.go` and `refreshSystemIndexes.go`;
`services/api/v1endpoints/systemIndex.go`; `services/shared/redis/dataset.go`;
`services/shared/nats/tasks.go`; `services/worker/asynq/handlers.go`;
`services/core/scheduler/esi/systemIndexRefresh.go` and `services/core/scheduler/jobs.go`; the
directory listing under `Functions/Industry Facilities/`, `Functions/Custom Structures/`,
`Functions/Reprocessing/` and `Styled Components/{autocomplete,Select}` confirming the file moves and
the deletion of `rigType.jsx`; and the test files under `Functions/Industry Facilities/*.test.js` and
`Styled Components/autocomplete/virtualisedRigSearch.test.jsx`.

**Where code and the overlay/plan disagreed:**

- `models.JobSetup` was missing `MilitiaUpgradeLevel` when these drafts were written, which made the
  plan's "two new fields in both languages" read as wrong. It was the code that was wrong: an
  incremental job write resolves every member of the body against that struct and fails the whole
  write for one it cannot place, so a setup carrying the field could not be saved at all. The field is
  now declared, and the two languages' field lists are held together by
  `testing/fixtures/job-setup-fields/fields.json` — see [measurements.md](../measurements.md) § A setup
  field the SPA writes and the server does not declare drops the save. The plan's table is accurate.
- `plan.md`'s Stage status table read Stage E as "Not started" while `overlay.md` § Stage E and
  `stages/stage-e-fw-cost.md` both said "Landed" and the code matched the landed account. The plan now
  says Stage E is complete.
- `manStructure` carries no `publishedID` on any of today's four manufacturing structure rows
  (`NPC Station`, `Medium`, `Large`, `X-Large`, `The Fulcrum`), so `structureBonusForItem`'s published
  branch is real code with no live structure exercising it yet. Documented as a capability of the
  function rather than as something any particular structure currently uses.

## Not promoted

- **The two release steps** — `clear the system left on a setup that moved off The Fulcrum`
  (Stage B/C cutover) and the Stage D step recalculating `materialCount` for every setup naming The
  Fulcrum. Both are one-off migration actions against already-stored documents, not standing behaviour
  of the running system, and live docs describe current behaviour only — per this project's own
  Stage status and the migration-plans rule against cutover checklists in live topic docs. They stay as
  process history; nothing in the project folder needs to survive for them, since `core/core.md`
  already documents the release-step mechanism generically (`tasks list`, running a step) without
  cataloguing individual steps.
- **The Edit Job setup editor's own UI** — offering both rig slots, the flexbox layout, the *Enlisted
  Militia* and *System Upgrade Level* selects. This project's own `contents.md` § Does not own already
  says the Edit Job and Planning panels belong to `planning-stage-panels` and `purchasing-stage-panels`,
  both still unpromoted, so there is no live topic to fold this into yet. Only the facts this project
  does own about that surface — that it is now a `useRigSlots` consumer, and a `VirtualisedRigSearch`
  consumer, alongside the three surfaces already documented — are folded into
  `frontend/settings/custom-structures.md` and `frontend/industry-facilities/bonuses.md`. The setup
  editor's own screen is left for its owning project to describe when it promotes.
- **`militiaUpgradeLevel`'s wire shape** — left undescribed here because a setup's stored shape belongs
  to `job-document-drafts`. It is carried in both languages and guarded by a fixture; that project
  describes it when it promotes.
- **`Functions/Blueprint Calculations/liveParity.corpus.test.js` and
  `Functions/Installation Costs/liveParity.corpus.test.js`** have no owning testing topic to fold into —
  neither area (`Blueprint Calculations`, `Installation Costs`) has a live behaviour doc or a testing
  topic yet, a gap that predates this project. Only `Functions/Reprocessing/liveParity.corpus.test.js`
  got a home, in `testing/frontend/reprocessing.md`, because that topic already exists.
- **A live API-side doc for `POST /api/v1/systemindexes/query`.** No `backend/api/*.md` owns this
  endpoint today; rather than open a near-empty stub, the militia merge is described from the worker
  side in `backend/worker/system-indexes.md`, which is where the rest of the endpoint's behaviour
  (the two datasets, the refresh cadence) already had to be documented.
- **`backend/shared/custom-structures.md`** — read and confirmed unaffected: `AppliedRequirementID` was
  removed from `models.JobSetup` (`shared/models/job.go`), not from `models.CustomStructure`
  (`shared/models/accountDocuments.go`), and this project's stated `Does not own` already excludes the
  custom-structure model itself. Left untouched.

## Left for the caller

- Fold each draft above over its live target, apply the `redis.md` and `contents.md` updates, and
  remove `rig-and-structure-attributes`'s row from `migration-plans/contents.md`.
- Delete the project folder once folded. Citation check, run before deleting:

  ```bash
  grep -rn 'rig-and-structure-attributes/' --include='*.md' technical-documentation/ \
    | grep -v '^technical-documentation/migration-plans/rig-and-structure-attributes/'
  ```

  Result at draft time (excluding this project's own row in `migration-plans/contents.md`, which goes
  with the folder):

  ```text
  technical-documentation/migration-plans/spa-module-homes/contents.md:23
  technical-documentation/migration-plans/spa-module-homes/plan.md:103
  technical-documentation/migration-plans/job-document-drafts/plan.md:1816
  ```

  Three **active** projects cite this folder — `spa-module-homes` (twice, naming it as a project
  editing files it is also tracking module-home moves for) and `job-document-drafts` (its own defect
  record naming Stage A as the fix, in "What it owes another project"). Per the promoted-folder rule,
  an active citation is a reason to **keep the folder** rather than delete it: check whether each
  citation is a live cross-reference that still needs the folder, or a historical pointer that could be
  repointed at the promoted `frontend/industry-facilities/bonuses.md` § A setup's stored figures are
  kept in step. Only delete once none of the three still needs it — or update the citing line and
  re-run the check before deleting.
