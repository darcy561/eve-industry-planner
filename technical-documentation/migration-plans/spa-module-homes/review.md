# SPA module homes — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

## Summary

This is a filing project: it moves and renames SPA modules and tests without changing behaviour. The
plan's own status is "Phase 1 only, nothing has moved", and the tree bears that out: every file the
survey names as misplaced is still where the survey found it, every file it names as dead still has no
importer, and the upward import from `Zustand/editSession/` into `Components/Edit Job/Edit Job Hooks/`
is still there in all three files the plan names. The survey's counts have drifted slightly as other
projects added files, but no finding has been overtaken.

Two things need attention before the first move. First, the destination of the job model is an open
question in the plan, and every wide move depends on it, so the project cannot start its main work until
it is answered. Second, one "cheap" move is not behaviour-free: the `panelStates` fork the plan would
delete differs from the shared component in a rendered dimension, so pointing its two callers at the
shared one changes a screen. A smaller finding is that the plan both deletes the empty
`Functions/UserDocument/` folder and would move `userDocumentsPersistSchedule.js` "beside its subject",
which is that folder.

In-flight work in the same tree matters for ordering: reprocessing-rebuild has uncommitted edits that
create `Functions/Reprocessing/{engine,selection,valuation}/` and move a module out of
`Functions/Skills/`, and six uncommitted files import the modules this project would move.

## Verified status

The plan has no numbered stages; the rows follow its groups in [plan.md](./plan.md) § The moves, by
what they cost, plus the survey it rests on.

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---------------|-----------|----------------|----------|---------|
| Phase 1 (folder, contents, plan, overlay, section row) | done | Folder holds `contents.md`, `plan.md`, `overlay.md`; the section task map has the row | `technical-documentation/migration-plans/contents.md` line 22 | confirmed |
| Survey: job model under a page's hooks folder | 95 / 53 importers; 7 of 18 files are not hooks | `jobSelectors.js` is imported by 88 files, `jobCommands.js` by 52, `materialSelectors.js` 17, `linkedRunSelectors.js` 5, `jobDraftStore.js` 21; 139 import sites sit outside `Components/`. The folder now holds 19 non-test modules, 8 of them not hooks | `frontend/src/Components/Edit Job/Edit Job Hooks/` | confirmed, counts drifted |
| Survey: one upward import | `core`, `jobChanges`, `stateDefault` import `jobDraftStore` | All three do, as multi-line imports from `../../Components/Edit Job/Edit Job Hooks/jobDraftStore.js` | `frontend/src/Zustand/editSession/core.js` lines 1–6, `jobChanges.js` 1–6, `stateDefault.js` 1 | confirmed |
| Survey: `Functions/Debounce/` named for a technique | Five domains; `priceRefreshSchedule.js` does not use its helpers | Five schedules plus `helpers/` with four modules; `priceRefreshSchedule.js` imports nothing from it. One importer of `helpers/` sits outside the folder: `Functions/JobDocuments/inboundJobDocuments.js` | `frontend/src/Functions/Debounce/`, `frontend/src/Functions/MarketData/prices/priceRefreshSchedule.js` | confirmed, one omission |
| Survey: two dozen orphan tests in `Classes/`; three named after the deleted job class | 29 test files in `Classes/`; 17 import a subject outside `Classes/`, 3 mix a `Classes/` subject with one outside, 9 sit beside their subject. `job.test.js`, `job.meta.test.js`, `job.parity.test.js` all exercise `Functions/JobDocuments/jobDocument.js` | `frontend/src/Classes/*.test.js*` import lists | understated count, otherwise confirmed |
| Survey: four duplications | fork, dead fork, forwarding wrapper, class importing selectors | `Components/Edit Job/panelStates.jsx` differs from `Styled Components/Paper/panelStates.jsx` (see Discrepancies); `Hooks/usePlannerCardDrag.jsx` has no importer while `Components/Job Planner/Hooks/useDnD.jsx` has 14; `Functions/JobPlanner/workingCopyOfJob.js` only forwards to `copyOfJob`; `Classes/jobMaterial.js` lines 8–15 import seven functions from `materialSelectors` | the four files named | confirmed |
| Survey: misleading names | `worldDataSlIce.js`; `flatternObject.js`; mixed folder case; four `Job*` folders | `Zustand/worldDataSlIce.js` imported once (`Zustand/usersStore.js` line 11) beside `Zustand/worldDataSlice/`; `Functions/Debugging/flatternObject.js` has no importer; six `Functions/` folders carry spaces against 31 without; `Job`, `Job Build`, `JobDocuments`, `JobPlanner` | `ls frontend/src/Functions` | confirmed |
| Free: six dead modules and five empty folders | open | All six exist and nothing imports them. Exactly five empty folders: `src/theme`, `src/tests/tmp`, `Components/Sentry`, `Functions/UserDocument`, `Components/Archive Statistics/src` | `find frontend/src -type d -empty` | confirmed open |
| Free: rehome orphan tests | open | None moved; `Classes/reprocessing.test.js` has uncommitted edits from reprocessing-rebuild and now imports `Functions/Reprocessing/engine/reprocessingSetup.js` while staying in `Classes/` | `git status --short frontend/src/Classes` | confirmed open |
| Cheap: `panelStates`, `workingCopyOfJob`, `worldDataSlIce` | open | Two Edit Job callers of the fork (`Building/StandardLayout/Tab Panel/linkedJobs.jsx`, `availableJobs.jsx`); two callers of the wrapper (`Functions/JobPlanner/editSessionLifetime.js`, `closeActiveJob.js`, the latter with uncommitted edits); one importer of the slice | import greps | confirmed open |
| Wide: `jobDraftStore`, then `jobCommands` + `materialSelectors` + `linkedRunSelectors`, then `jobSelectors` | open | All five still under `Components/Edit Job/Edit Job Hooks/` | folder listing | confirmed open |
| Folders: fold `Components/Edit Job/Hooks/`, dissolve `Functions/Debounce/` | open | `Edit Job/Hooks/` holds three hooks (`useJobMatchesAndWorldData`, `useMarketOrdersAndWorldData`, `useRefreshLinkedESIData`); `Debounce/` unchanged | folder listings | confirmed open |
| Conventions: unify `.e2e.` / `.endToEnd.` / `.integration.`; write survivors into testing/frontend | open | 6 / 2 / 8 files; `.corpus.` 9, `.parity.` 9. Vitest selects no suffix (`frontend/vite.config.js` lines 136–162 use the default include), so every suffix is descriptive only. `testing/frontend/contents.md` states the beside-the-module rule and names no suffix | `find frontend/src -name "*.<suffix>.test.*"` | confirmed open, survey incomplete |

### Discrepancies

- **The `panelStates` fork is not a pure duplicate.** The Edit Job copy renders its loading state with
  `minHeight: "200px"`; the shared `Styled Components/Paper/panelStates.jsx` uses `minHeight: 20`, adds
  `overflow: "hidden"`, and takes a `loadingMessage` prop. Pointing `linkedJobs.jsx` and
  `availableJobs.jsx` at the shared component changes the height of two Building-stage panels while they
  load. The plan files this under "cheap" and § Wire compatibility says no rendered screen changes; one
  of those has to give (see Decisions).
- **Orphan test count.** "Two dozen" is 17 clear cases plus 3 mixed; `contents.md` says "two" tests
  are named after the deleted file where `plan.md` says three, and three is right.
- **Importer counts** in the plan are import statements; the file counts above are lower by a few in
  each case except `jobDraftStore.js` (21 files against 18). The codemod should record which it counts.
- **Non-hooks in `Edit Job Hooks/`** are now eight, not seven: `jobCommands.js`, `jobDraftReview.js`,
  `jobDraftStore.js`, `jobSelectors.js`, `linkedRunSelectors.js`, `materialSelectors.js`,
  `mergeEditJobNavigationSearch.js`, `saveOpenJob.js`. `jobDraftReview.js` and `saveOpenJob.js`
  arrived with document-write-granularity and shared-planners after the survey.
- **`Functions/Debounce/helpers/` has an importer outside the folder** —
  `Functions/JobDocuments/inboundJobDocuments.js` — so renaming the helpers folder is a seven-importer
  move (five schedules plus this file and its tests), not an internal one.
- **"Four remaining persist schedules" against five in the folder.** The plan's survey counts five
  domains and its move list says four; nothing in the plan says which one is already accounted for.
  Importer counts are far from uniform: `userDocumentsPersistSchedule.js` has 21 non-test importers
  across Settings, Accounts, First Login, Tutorials, Reprocessing and WebSocket handlers;
  `jobGroupsPersistSchedule.js` 7; `jobDocumentsPersistSchedule.js` 5; `plannerSettingsPersistSchedule.js`
  3; `accountSingletonsSyncSchedule.js` 1. The first is a wide move by the plan's own scale.
- **Suffix survey is incomplete.** Beyond the five suffixes the plan names, about forty test files carry
  an ad-hoc middle segment (`.render.` 5, `.live.` 3, `.names.` 3, `.replay.` 2, and some thirty
  singletons such as `.rotation.`, `.lockFrame.`, `.writePath.`). The convention step has to say
  whether these are part of the vocabulary or are plain descriptive names that stay free-form.
- **Empty folders are untracked.** Git stores no empty directory, so the five exist only in the working
  tree; removing them is a local filesystem act with nothing to commit, and they can reappear on any
  checkout that recreates them.

## What each remaining step changes

Nothing has landed, so every group is a remaining step. The plan's own groups are kept.

### Free — dead modules, empty folders, orphan tests

**Today.** Six modules with no importer; 20 tests in `Classes/` whose subject lives elsewhere, which
`testing/frontend/contents.md` says should not happen. The clearest case:

```text
frontend/src/Classes/job.test.js           imports ../Functions/JobDocuments/jobDocument.js
frontend/src/Classes/jobCost.test.js       imports ../Components/Edit Job/Edit Job Hooks/jobSelectors.js
frontend/src/Classes/jobClone.test.js      imports ../Components/Edit Job/Edit Job Hooks/jobCommands.js
```

**After.** Each test sits beside its subject; where the subject is itself about to move (the job model
modules), the test moves twice unless this step waits for the wide moves. The plan leaves the target
names unspecified — `job.test.js` beside `jobDocument.js` would reasonably become `jobDocument.test.js`,
but that collides with the existing `Functions/JobDocuments/jobDocument.test.js`, so the move is also a
merge or a rename.

**Work.**
1. Delete `Hooks/usePlannerCardDrag.jsx`, `Classes/watchlistItem.js`,
   `Functions/Shared/findAllChildJobCountOrIDs.js`, `Events/refreshEvents.js`,
   `Functions/Debugging/flatternObject.js`, `Functions/Endpoints/Private/accountCredentialsClient.js`.
2. Remove the five empty folders locally (nothing to commit).
3. Move the 17 orphan tests beside their subjects, resolving the name collisions with the tests already
   there; split or move the three mixed tests (`shoppingListValue`, `reprocessing`, `linkedESIJob`) only
   where the outside half is the real subject.
4. Hold `Classes/reprocessing.test.js` until reprocessing-rebuild's uncommitted edits to it are in.
5. Suite passes unchanged.

**Wire.** None.

### Cheap — the fork, the wrapper, the case-only rename

**Today.**

```js
// frontend/src/Functions/JobPlanner/workingCopyOfJob.js
export default function workingCopyOfJob(source) {
  if (!source?.jobID) return source;
  return copyOfJob(source);
}
```

Two callers. The `jobID` guard is behaviour the wrapper adds; inlining must keep it at both call sites.
`Zustand/usersStore.js` line 11 imports `./worldDataSlIce`.

**After.** `copyOfJob(source)` guarded inline in `editSessionLifetime.js` and `closeActiveJob.js`;
`Zustand/worldDataSlice.js` beside the `worldDataSlice/` folder. The `panelStates` half waits on a
decision (below).

**Work.**
1. Inline the guard and call at the two sites; delete the wrapper. `closeActiveJob.js` has uncommitted
   edits from another session, so do this after those land.
2. Two-step `git mv` for the case-only rename; update the one importer.
3. `panelStates` per the decision.

**Wire.** None.

### Wide — the job model's home

**Today.** The store slice reaches up into a component folder for its own state shape:

```js
// frontend/src/Zustand/editSession/stateDefault.js
import { emptyDraftState } from "../../Components/Edit Job/Edit Job Hooks/jobDraftStore.js";
```

and 139 import sites outside `Components/` name `Edit Job Hooks/` for selectors or commands.

**After.** The plan does not fix the destination (its first open question). Either:

```text
frontend/src/Functions/JobDocuments/{jobDraftStore,jobCommands,jobSelectors,materialSelectors,linkedRunSelectors}.js
```

beside `jobDocument.js`, `jobDelta.js` and `inboundJobDocuments.js`, or a new `Functions/Job/` that also
absorbs `Functions/Job Build/`. Either way `Zustand/editSession/*` imports from `Functions/` and nothing
in `Zustand/` imports from `Components/`.

**Work.**
1. Settle the destination (Decision 1).
2. Codemod `jobDraftStore.js` (21 files) in its own commit.
3. Codemod `jobCommands.js`, `materialSelectors.js`, `linkedRunSelectors.js` (74 files) together.
4. Codemod `jobSelectors.js` (88 files) alone.
5. Each commit: suite passes; `grep -rn "Components/" frontend/src/Zustand` returns only
   `applicationSettings/markets.test.js`, which is a test importing a writer and is a separate
   placement question.
6. Coordinate with the six uncommitted files that import these modules
   (`Components/Reprocessing/reprocessingSettingsPanel.jsx` and its test,
   `Functions/GroupTemplates/instantiateGroupTemplate.js` and its test,
   `Functions/JobPlanner/closeActiveJob.js`, `Functions/JobPlanner/mergeJobs.js`).

**Wire.** None.

### Folders — fold `Edit Job/Hooks/`, dissolve `Debounce/`

**Today.** `Components/Edit Job/Hooks/` holds three hooks and their tests; `Edit Job Hooks/` holds
eleven hooks once the model modules leave. `Functions/Debounce/` holds five schedules and `helpers/`.

**After.** One hooks folder under `Components/Edit Job/` (the plan does not name it). Each schedule sits
with its subject, e.g. `Zustand/jobsSlice/` or `Functions/JobDocuments/` for `jobDocumentsPersistSchedule.js`,
`Functions/Groups/` for `jobGroupsPersistSchedule.js`; the helpers keep their technique name somewhere
the plan has not chosen. `userDocumentsPersistSchedule.js` has no obvious home once
`Functions/UserDocument/` is deleted (Decision 3).

**Work.**
1. Move the three hooks and tests into the survivor; rename it; codemod importers.
2. Move five schedules (37 non-test importers in total) beside their subjects.
3. Rename `helpers/`; update the five schedules and `inboundJobDocuments.js`.
4. Delete `Functions/Debounce/`.

**Wire.** None.

### Conventions — test-name suffixes

**Today.** `.e2e.` 6, `.endToEnd.` 2, `.integration.` 8, plus around forty other middle segments; no
runner config reads any of them.

**After.** One name for the three, written into `testing/frontend/contents.md` on promote, with a
statement about the free-form segments.

**Work.**
1. Decide the survivor and the status of free-form segments (Decision 4).
2. Rename the 16 files (10 if `.e2e.` or 8 if `.integration.` survives).
3. Draft the suffix paragraph in `overlay.md` for promotion into `testing/frontend/contents.md`.

**Wire.** None.

## Decisions needed

### Where the job model lives

**Question.** Does the job model move into `Functions/JobDocuments/`, or into a new `Functions/Job/`
that also absorbs `Functions/Job Build/`?

**Why it is James's call.** It fixes the name 139 import sites will carry and is the plan's first open
question. `Functions/JobDocuments/` already holds `jobDocument.js`, `jobDelta.js`, `writeBody.js`,
`revisionConflict.js` and `inboundJobDocuments.js`, which are about the stored document and its wire
shape; `jobSelectors.js` and `jobCommands.js` are about a job in memory. `Functions/Job/` today holds
`costBreakdown.js`, `returns.js`, `buildComparison.js`, `materialSourcingRow.js` — figures about a job —
and `Functions/Job Build/` holds `getItemRecipes.js` and `setupHelpers.js`.

**Options.**
- `Functions/JobDocuments/`: one codemod per module, no new folder, but a reader finds in-memory
  selectors under a name that says "stored document".
- `Functions/Job/` absorbing `Job Build/`: the name matches the vocabulary ("a job"), and it removes one
  of the four `Job*` folders and one space-named folder; costs a further codemod for `Job Build/`'s
  importers and leaves `JobDocuments/` as the document-shape sibling.
- Both, split by what each module is about: selectors, commands and the draft store into
  `Functions/Job/`; the document shape stays in `JobDocuments/`. Two folders a reader has to tell apart,
  but each name is true.

**Recommendation.** The third option. It is the only one where every folder name says what is inside,
and `jobDraftStore.js` exporting `emptyDraftState` to `Zustand/editSession/` reads correctly from
`Functions/Job/`.

**Blocked until decided.** Every wide move, and the orphan tests whose subject is one of those modules
(so they move once rather than twice).

### Whether the `panelStates` fork may change a screen

**Question.** When the two Edit Job callers move to the shared `PanelFallBack`, do they accept its
`minHeight: 20` loading state, or does the shared component gain a prop so the Building panels keep
their 200px?

**Why it is James's call.** § Does not own forbids a rendered-screen change, and the plan files this move
under "cheap". Only he can say whether a 200px-to-20px loading placeholder on `linkedJobs.jsx` and
`availableJobs.jsx` is a change worth preserving or a drift worth losing.

**Options.**
- Accept the shared sizing: one deletion, two import rewrites, the Building stage's loading placeholder
  shrinks.
- Add a `minHeight` prop to the shared component with the shared default; the two callers pass 200.
  Behaviour-free, but it widens a shared component for one caller.
- Leave the fork for building-stage-panels to resolve when it rewrites the Building stage, and remove
  this move from the project.

**Recommendation.** The third, if building-stage-panels is going to replace those two tab panels; the
first otherwise, recorded in `overlay.md` as the one rendered change the project knowingly made.

**Blocked until decided.** The `panelStates` line of the cheap group only.

### Where `userDocumentsPersistSchedule.js` goes

**Question.** Does `Functions/UserDocument/` stay (and receive the user-document persist schedule), or
is it deleted as one of the five empty folders and the schedule filed elsewhere?

**Why it is James's call.** The plan lists the empty folder for deletion and, separately, says each
schedule moves "beside its subject". The subject of this one is the user document, and the empty folder
is named for it. Its 21 importers span Settings, Accounts, First Login, Tutorials, Reprocessing and a
WebSocket handler, so wherever it goes is a wide move.

**Options.**
- Keep `Functions/UserDocument/` and put the schedule there, with `accountSingletonsSyncSchedule.js`
  beside it if the account document is treated as the same subject.
- Delete the folder and file the schedule under `Zustand/account/` beside the slice that writes it.
- Leave it in a renamed `Functions/Debounce/` — which keeps a technique-named folder and fails § Done when.

**Recommendation.** The first. The folder exists because something once expected to live there, and the
schedule is exactly that thing.

**Blocked until decided.** The `Debounce/` dissolution and the count of empty folders to remove.

### Which test suffix survives, and whether free-form segments are allowed

**Question.** Which of `.e2e.`, `.endToEnd.`, `.integration.` becomes the one name, and are the forty
other middle segments part of the convention or outside it?

**Why it is James's call.** It is a naming vocabulary that outlives the project and goes into live SoT
on promote. The plan only counts the three it names.

**Options.**
- `.e2e.` survives (6 files keep their name, 10 rename): shortest, already used by the route journeys
  and both market-data delivery tests.
- `.integration.` survives (8 keep, 8 rename): the most common of the three; longer; the SPA's
  "integration" tests and "e2e" tests are the same kind of test under Vitest.
- Free-form segments: declare `.corpus.` and `.parity.` plus the survivor as the only meaningful ones
  and leave the rest as descriptive names; or forbid middle segments outside that set and rename forty
  files.

**Recommendation.** `.e2e.` survives; `.corpus.`, `.parity.` and `.e2e.` are the vocabulary; other
segments remain descriptive and unregulated, which is what `testing/frontend/contents.md` implies today.

**Blocked until decided.** The conventions step and its `overlay.md` paragraph.

### Whether to add a path alias first

**Question.** Should `vite.config.js` gain an `@/` alias (and the matching Vitest resolve) before the
wide codemods, so each later move rewrites one line per importer rather than a relative path?

**Why it is James's call.** It is a build change touching every future import in the SPA, larger than
any single move in this project and not reversible without another codemod. It is the plan's third open
question.

**Options.**
- Add the alias first: the 200-odd importers of the job model are rewritten once to `@/Functions/...`;
  every later move is a search-and-replace on a stable prefix. Costs a build change and a convention the
  SPA does not have today.
- Do not add it: each move is a relative-path codemod, which the plan already assumes.

**Recommendation.** Do not add it in this project. A filing project is the wrong place to introduce a
build convention, and the codemod cost is paid once per module either way.

**Blocked until decided.** Nothing; the wide moves can start on relative paths.

## Dependencies and order

- **Waits on** the decisions above, and on the uncommitted work in the same tree: reprocessing-rebuild
  is editing `Classes/reprocessing.test.js`, `Functions/JobPlanner/closeActiveJob.js`,
  `Functions/JobPlanner/mergeJobs.js` and `Components/Reprocessing/reprocessingSettingsPanel.jsx`, all of
  which this project would touch. A codemod over a file another session has open produces a merge
  nobody chose.
- **Hands nothing to** another project. No project cites this folder.
- **Cross-project note.** reprocessing-rebuild's uncommitted edits already do filing work of their own:
  `Functions/Reprocessing/{engine,selection,valuation}/` are new, `getAllReprocessingSkills.js` has
  moved from `Functions/Skills/` to `Functions/Reprocessing/`, and `Components/Reprocessing/Hooks/` is
  new. That matches what the plan says document-write-granularity did and is the pattern this project
  generalises; it also leaves `Classes/reprocessing.test.js` as an orphan that now imports the new
  engine folder, which this project should pick up once those edits land.
- **Recommended next slice.** The free group minus the tests whose subject is a job model module and
  minus `Classes/reprocessing.test.js`: delete the six dead modules, remove the empty folders (subject to
  Decision 3 for `Functions/UserDocument/`), and rehome the orphan tests whose subject is settled —
  `closeAdjustmentSummary.test.js` to `Functions/JobPlanner/`, `refreshLinkedESIData.test.jsx` beside
  `useRefreshLinkedESIData.js`, `jobPricingOverride.test.js` and the three `job.*.test.js` files to
  `Functions/JobDocuments/`. Then Decision 1, then `jobDraftStore.js` on its own.
