# Promotion drafts — planning-stage-panels

> **Ready — apply only with James's go-ahead.** Every stage, A–S, has landed, and the drafts below
> describe the stage as it runs. Promotion happens once, in one pass: `plan.md` § Start here.

Links inside each drafted file are written relative to the file's **live target**, not to this folder,
so they resolve the moment the draft is folded in.

## Index

`frontend/editjob/` already exists in live SoT, holding `contents.md`, `floating-step-buttons.md` and
`parent-job-link.md`. This project updates that area; it does not create it.

| Draft | Live target | Apply |
|-------|-------------|-------|
| [`frontend/contents.md`](./frontend/contents.md) | `technical-documentation/frontend/contents.md` | **Update.** Re-cut from the live file on 2026-10-05; only the Edit Job phrase in Owns and the `editjob/` task-map row differ. Re-cut again if the live file moves before promote |
| [`frontend/editjob/contents.md`](./frontend/editjob/contents.md) | `technical-documentation/frontend/editjob/contents.md` | **Update.** Replaces the live file: keeps its Does not own entries and the parent-job-link row, drops the floating-arrows row, and adds the Planning stage. Add the rows for the P–S topics below when they are drafted |
| [`frontend/editjob/materials-sourcing.md`](./frontend/editjob/materials-sourcing.md) | `technical-documentation/frontend/editjob/materials-sourcing.md` | **New** topic |
| [`frontend/editjob/cost-breakdown.md`](./frontend/editjob/cost-breakdown.md) | `technical-documentation/frontend/editjob/cost-breakdown.md` | **New** topic |
| [`frontend/editjob/returns.md`](./frontend/editjob/returns.md) | `technical-documentation/frontend/editjob/returns.md` | **New** topic |
| [`frontend/editjob/skills.md`](./frontend/editjob/skills.md) | `technical-documentation/frontend/editjob/skills.md` | **New** topic |
| [`frontend/editjob/selling-charges.md`](./frontend/editjob/selling-charges.md) | `technical-documentation/frontend/editjob/selling-charges.md` | **New** topic |
| [`frontend/editjob/parent-job-link.md`](./frontend/editjob/parent-job-link.md) | `technical-documentation/frontend/editjob/parent-job-link.md` | **Replace.** Opened from Output; each candidate states its need for this item |
| [`frontend/editjob/output.md`](./frontend/editjob/output.md) | `technical-documentation/frontend/editjob/output.md` | **New** topic |
| [`frontend/editjob/page-frame.md`](./frontend/editjob/page-frame.md) | `technical-documentation/frontend/editjob/page-frame.md` | **New** topic |
| [`frontend/editjob/setups.md`](./frontend/editjob/setups.md) | `technical-documentation/frontend/editjob/setups.md` | **New** topic |
| [`frontend/editjob/blueprint-library.md`](./frontend/editjob/blueprint-library.md) | `technical-documentation/frontend/editjob/blueprint-library.md` | **New** topic |

## Live docs this project deletes

Stage Q removes the floating step arrows and, with them, `useIsScrolledOutOfView`, whose only caller
they were. Two pieces of live SoT describe them and are deleted at promote, not rewritten:

- `technical-documentation/frontend/editjob/floating-step-buttons.md` — the whole file, and its row in
  `frontend/editjob/contents.md` (the draft above already leaves it out).
- `technical-documentation/frontend/technical-rules.md` § **Watching whether an element is on screen** —
  the whole section. It teaches a hook that no longer exists.

Before deleting, check nothing else in live SoT links to either; the frontend `contents.md` draft above
already drops the floating-arrows wording from Owns and the task map.

## Additions owed to the component docs

Four shared pieces were added while building P–S. Fold each into the named live file, beside what is
already there:

- `technical-documentation/frontend/components/figures.md` § Laying figures out — after the
  `Disclosure` paragraph: "`FoldedList` shows a list's first rows up to a limit and folds the rest
  behind a `Disclosure` whose label counts them. A fold of a single row is not worth a press, so it
  folds only once two or more rows would be hidden: at the default limit of six, seven rows show whole
  and eight show six and the fold line. A caller may set its own limit — the Blueprint Library sets
  three on a phone, where four show whole. Output's parent jobs and the Blueprint Library's blueprints
  use it."
- `technical-documentation/frontend/components/figures.md` § Status — `STATUS_TONE` gains `BAD`,
  mapped to the error colour, for a state that is about to stop being possible or already has: a
  blueprint copy a running job will use up.
- `technical-documentation/frontend/components/surfaces.md` — a new section after § InsetSurface:
  "**BottomSheet** (`Styled Components/Dialogue/BottomSheet.jsx`) is a MUI `Drawer` rising from the foot
  of a phone screen, with a handle and an optional title, for a choice or an editor that would otherwise
  open against the edge of a 360px screen. The pricing order type picker opens its options in one, and
  the Setups panel its editor."
- `technical-documentation/frontend/components/rows.md` — a new section after § Actions:
  "**ExpandableRow** (`Styled Components/Paper/ExpandableRow.jsx`) is a row that opens what sits beneath
  it. A press anywhere on the row or on its chevron (`ExpandToggle`) opens it, and a press on a control
  it carries does not. An open row, or the one the page is working with, takes `openRowBackground` — the
  tint a selected table row takes — so a list and a table mark an open row alike. The Setups panel is
  built on it; the Materials & Sourcing table and its phone cards open the same way, with the same
  chevron and the same tint — a table row through MUI's own `selected`, which takes that tint, and a
  card through `openRowBackground` itself."

## Update owed to a testing doc

`technical-documentation/testing/frontend/esi-collections.md` § Coverage map has a **Tested** row for
`Components/Edit Job/.../manufacturingLayout.jsx`, `reactionLayout.jsx` — "The values each panel
renders, a stack counted as the blueprints it holds, and that neither writes to the rows it renders".
Stage S deleted both files and their tests. Replace the row with one for
`Components/Edit Job/.../Blueprint Library/blueprintLibraryPanel.jsx` and
`Functions/Blueprints/blueprintJobState.js`, linked to the same `frontend/esi-collections/blueprints.md`,
stating what
`blueprintLibraryPanel.test.jsx` and `blueprintJobState.test.js` cover: each blueprint's research as a
row, original or copy and its runs in words, a running job and a copy it will use up named without a
legend, the blueprint the setup is on marked and offered no Use, Use applying a blueprint's research
and Undo putting it back, the Undo withdrawn once the setup no longer holds what Use wrote, the fold
past six, an empty library saying so, and neither list writing to the rows it renders; for a reaction,
a formula library counting every formula in a stack, a character's and a corporation's formulas apart,
the formulas running a job, and the holder building the open setup marked.

## Addition owed to a rules file

`technical-documentation/frontend/technical-rules.md` — insert as a new `##` section after
**§ A poke is not a value** and before **§ Lint and format**. Today **§ Watching whether an element is
on screen** sits between those two; it is deleted at the same promote (above), so the new section takes
its place. Do not replace the file; fold this section in among what is already there.

Still true against the code: `Styled Components/Paper/AppShellPanel.jsx` defaults the paper to
`height: "100%"`, and every stacked panel on the Planning stage overrides it.

---

## Stacked panels

`AppShellPanel` is full height by default, which is meant for panels sharing a grid row. A panel in a
vertical stack of panels — each with its own height rather than a shared row — sets
`paperSx={{ height: "auto" }}`, or it renders as a tall empty box that pushes its siblings down. Every
panel in such a stack needs this, including one that predates its neighbours. Nothing in a jsdom test
can catch a missing one, because jsdom has no layout — it takes a browser.

Do not reach for `Masonry` to stack panels of varying height in a single column. A masonry packs
items of differing heights into **several** columns without leaving gaps; at one column there is
nothing to pack, and the measuring it does to find that out is not free — it positions every child
absolutely and re-lays out the whole column whenever any one child's height changes, so opening a
drawer or a row appearing anywhere in the stack moves every panel beneath it. A plain `Stack` gives
the same varying heights for nothing.

---

## Not promoted

**Handed to the custom-structure work** (`plan.md` § Handed to the custom-structure work) — landed and
promoted elsewhere. market-locations and market-price-delivery built the saved-market lane, its editor
and a citadel priced on its own orders; the live description is
`technical-documentation/frontend/settings/market-locations.md`. Nothing from that section needs
folding in from here, and nothing in it is left without a home when this folder goes.

**Handed to the market pricing defaults work** — separate buying and selling defaults, and defaults
keyed to the market group tree. That project has promoted; its live SoT is
`technical-documentation/frontend/pricing/defaults.md` and
`technical-documentation/frontend/settings/job-settings.md`.

**Open questions** (`plan.md` § Open questions) — none block promotion, and none are decided:

- Whether the Cost Breakdown pricing-model toggle should ever drive what the rest of the app costs
  against, rather than staying display-only.
- How deep speculative child jobs should recurse beyond the current one level.
- Whether a Price Entry purchase price should override the pricing order type automatically or only when
  told to.
- Whether a saved citadel's editor, on the Settings page's Market Locations tab, should also be reachable
  from the Returns rate block.

**Known limits carried forward, not resolved** (`plan.md` § Known limits) — the per-component "vs last
build" comparison needs a statistics endpoint change (`ProductionTotalsRow` does not serve the cost
split) and belongs to that work, not this one. How often the Materials & Sourcing rows rebuild needs a
profile: the memo keys on the whole of `job.build`, so any edit under it rebuilds them, and the walk it
repeats was measured at well under a millisecond on the largest real job.

**Owed to the shared-planners release** (`plan.md` § Owed to the shared-planners release) — 184
archived jobs and 12 live job documents in the live snapshot carry numeric invention entry ids rather
than uuids; switching them rides that project's release window rather than a migration of its own, and
is recorded there, not here.

## Left for the caller

- The fold into live SoT, the two deletions above, the testing-doc row above, the row removal from
  `migration-plans/contents.md`, and the folder deletion.
- **Run the citation check before deleting the folder:**

  ```
  grep -rn 'planning-stage-panels/' --include='*.md' technical-documentation/ \
    | grep -v '^technical-documentation/migration-plans/planning-stage-panels/'
  ```

  On 2026-10-05 it lists citations from active projects — among them shared-planners (the invention id
  rewrite), job-document-drafts, purchasing-stage-panels and building-stage-panels (the page frame,
  Stage Q) and reprocessing-rebuild (minerals bought as ore) — and from promoted ones. The three that
  sent readers here for the Edit Job reducer's ownership of `state.activeJob` (react-19-idioms'
  `contents.md` and `plan.md`, effect-state-sync's `contents.md`) now point at job-document-drafts and no
  longer count. Per `migration-plans/documentation-rules.md` § A promoted project folder is deleted, not
  archived, each remaining active citation must be checked against what has actually promoted before the
  folder goes; a promoted project citing it is not a reason to keep it.
