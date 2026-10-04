# SPA module homes — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the
[frontend](../../frontend/technical-rules.md) and [frontend documentation](../../frontend/documentation-rules.md)
pair for the code.
Phase 1 (project folder and docs) before any product work.
No Go surfaces are in scope, so no `go fix` gate applies.
Live SoT will not be edited until this project is complete and promotion is approved.

**Status:** Phase 1 only. Nothing has moved under this project's name.
[document-write-granularity](../document-write-granularity/contents.md) moved its own inbound job-document
machinery into `Functions/JobDocuments/` as `inboundJobDocuments.js` while its work was in hand, which is
the pattern this project generalises rather than a stage of it.

## Goal

A module is where somebody looking for it would look, and its name says what it is. Nothing about what
the code does changes.

## Why this project exists

Five large projects have landed SPA code over many months — `job-document-drafts`,
`document-write-granularity`, `market-price-delivery`, `custom-structure-model`,
`planning-stage-panels` — and each filed its work where the page it was working on happened to be. The
result is not untidy so much as **misleading**: the folder a module sits in now tells a reader something
untrue about who owns it.

This is a filing project because the alternative is worse. Every one of these moves is available to any
session that happens to be editing nearby, and taken one at a time they produce a long tail of
half-finished renames that make the tree harder to read rather than easier. Doing them as one project,
in whole groups, is what keeps a bisect legible.

## What the survey found

**The job model is filed under one page's hooks folder and is not a page concern.**
`Edit Job Hooks/jobSelectors.js` has 95 importers and `jobCommands.js` 53 — counted as import
statements naming the module — and they are imported from
`Functions/`, `Classes/`, `Zustand/` and `Hooks/` — sixty-odd non-component files. Seven of the eighteen
files in that folder are not hooks.

**One import runs the wrong way.** `Zustand/editSession/{core,jobChanges,stateDefault}.js` import
`Components/Edit Job/Edit Job Hooks/jobDraftStore.js`: the store's own state shape is defined inside a
component folder. This is the single clearest wrong place in the tree and the reason the draft store
moves before anything else.

**`Functions/Debounce/` is named for a technique** and holds persist schedules for five unrelated
domains. The convention has already moved on without it: the newest comparable module,
`Functions/MarketData/prices/priceRefreshSchedule.js`, was written beside its subject and does not use
the folder's helpers at all.

**Two dozen tests sit in `Classes/` testing modules that live elsewhere**, three of them — `job.test.js`, `job.meta.test.js` and
`job.parity.test.js` — named after a file `job-document-drafts` deleted. The class was the tests'
oracle; the class went and the tests stayed.

**Four duplications the scattering caused.** `Components/Edit Job/panelStates.jsx` is a diverged fork of
`Styled Components/Paper/panelStates.jsx`; `Hooks/usePlannerCardDrag.jsx` is a dead fork of
`Components/Job Planner/Hooks/useDnD.jsx`; `Functions/JobPlanner/workingCopyOfJob.js` is a forwarding
wrapper around `copyOfJob`; and `Classes/jobMaterial.js` imports back the selectors its own getters
duplicate, which `job-document-drafts` records as deliberate mid-conversion state.

**Names that mislead on their own.** `Zustand/worldDataSlIce.js` carries a capital `I` beside a
correctly spelled `worldDataSlice/` folder; `Functions/Debugging/flatternObject.js` is misspelled and
dead; `Functions/` is split between `Title Case With Spaces` and `PascalCase` folder names; and four
folders begin with the word Job without saying which is which.

## The moves, by what they cost

Ordered by value against risk rather than by area. The SPA has no path aliases in `vite.config.js`, so
every move rewrites a relative specifier in each importer — a codemod, not hand-editing, and an argument
for moving whole groups at one depth in one commit.

**Free — nothing imports them.** Delete `Hooks/usePlannerCardDrag.jsx`, `Classes/watchlistItem.js`,
`Functions/Shared/findAllChildJobCountOrIDs.js`, `Events/refreshEvents.js`,
`Functions/Debugging/flatternObject.js`, `Functions/Endpoints/Private/accountCredentialsClient.js`, and
the five empty folders. Rehome the two dozen orphan tests in `Classes/` beside their subjects — nothing
imports a test, so this is the highest value per unit of risk in the project.

**Cheap — one or two importers.** Point the two Edit Job callers at the shared `panelStates` and delete
the fork. Inline `copyOfJob` at its two call sites and delete `workingCopyOfJob.js`. Rename
`worldDataSlIce.js`, which is a case-only rename and needs a two-step `git mv`.

**The wide ones, in this order.** `jobDraftStore.js` first, at 18 importers, because it is what removes
the upward import. Then `jobCommands.js` (53), `materialSelectors.js` (20) and `linkedRunSelectors.js`
(7) together. Then `jobSelectors.js` (95) on its own, in its own commit, so a bisect stays clean.

**Then the folders.** Fold `Components/Edit Job/Hooks/` into the survivor and rename it once it holds
only hooks. Move the four remaining persist schedules beside their subjects, rename
`Functions/Debounce/helpers/` for the technique it is, and delete `Functions/Debounce/`.

**Last, the conventions.** `.corpus.` and `.parity.` are meaningful and stay. `.e2e.`, `.endToEnd.` and
`.integration.` are three names for one thing and become one. Whatever survives gets written into
[testing/frontend](../../testing/frontend/contents.md), which today states the beside-the-module rule
and nothing about suffixes.

## What stays where it is

`Functions/MarketData/`, `Functions/Custom Structures/`, `Functions/Endpoints/`, the `Zustand/` slice
layout, `WebSocket/`, `frontend/src/tests/` and the `Planning/Standard Layout/` panel tree are filed
correctly. They are what the rest should look like.

`Classes/` keeps existing. Four of its survivors carry real behaviour, `jobSetup.js` and `character.js`
carry what a setup and a character hold for the industry facility rules in
[../../frontend/industry-facilities/contents.md](../../frontend/industry-facilities/contents.md), and
converting `group.js` — 629 lines and 25 importers — is a behaviour project rather than a filing one.

## Wire compatibility

None. No stored shape, wire shape or rendered screen changes. A move that would change one of those is
out of scope by § Does not own.

## Done when

- A reader looking for the job model finds it in one place, and nothing imports upward out of `Zustand/`
  into `Components/`.
- No folder in `Functions/` is named for a technique.
- Every test sits beside what it covers, and the suffixes that survive are written down.
- The four duplications are one implementation each.
- The whole SPA suite passes unchanged at every step, because nothing here changes behaviour.

## Open questions

- **Whether `Functions/JobDocuments/` is the job model's final name**, or whether it becomes
  `Functions/Job/` absorbing the two-file `Functions/Job Build/`. The second reads better and costs a
  wider rename; the first is where half the machinery already lives and where
  document-write-granularity has just put the other half.
- **Whether `Functions/Helper/` and `Functions/Shared/` should merge.** They have no stated boundary and
  a family of three parent/child link modules is split across them.
- **Whether a path alias would be worth adding** before the wide moves, so a future move rewrites one
  line rather than every importer. It is a build change, which makes it a bigger decision than any
  single move here.
