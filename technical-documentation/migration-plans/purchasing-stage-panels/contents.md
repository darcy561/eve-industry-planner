# Purchasing stage panels

## Owns

The Edit Job **Purchasing** stage: what it asks, what it answers, and the shape it answers in.

- The **retirement of the material card**. One `ContentPanel` per material currently carries a
  quantity readout, a cost total, a ledger of purchases, three status boxes and a live entry form,
  tiled four across. What replaces it is a worklist — one row per material — and a drawer that opens
  under the row being worked.
- **Where a price on this stage comes from.** Purchasing resolves the job, account and global rungs
  and stops, so a material's own override and its market group default are skipped and the stage can
  quote a different price from the one Planning quoted for the same row. This project puts it on the
  ladder every other consumer already uses.
- **One place that records a purchase**, in place of the class method and the command-layer copy that
  disagree about guarding, keying and defaults.
- The **frozen plan price**: a small record written into the job document the first time a material is
  bought, so "against plan" is a comparison that holds still and survives into the archive.
- **When a child job's cost may be taken** by a parent, and what a parent shows while it waits.
- The **multibuy paste**, reviewed before it is applied rather than after.
- **What a player already holds**, as opt-in information scoped exactly as the shopping list scopes
  it, and never costed into a job on its own.
- The **Job costs panel**: install, invention and extras — the three parts of `buildCost` that are not
  materials — and the setup list that produces the first of them.
- What the stage does on a **phone**, which today is the standard layout with a nested scroll region.

## Does not own

- **The pricing ladder itself.** The rungs, the market group walk and the resolver hooks are
  [market-pricing-defaults](../market-pricing-defaults/contents.md)'s work and are built. This project
  is the last consumer to adopt them and changes none of them.
- **The Planning stage.** Its three panels, the basis picker and the selling charges are
  [planning-stage-panels](../planning-stage-panels/contents.md). This project reuses the picker and the
  Materials & Sourcing table shape and alters neither.
- **The shopping list.** Its asset choice, its location scoping and its dialogue stay exactly as they
  are — it is wired into other surfaces and this project reads its resolution rather than reshaping it.
- **The direction costs flow between jobs.** `passBuildCostsToParentJobs` pushes from the child's
  Complete stage. This project adds a readiness-gated pull for one child and changes nothing about the
  push, the per-child purchase row, or the refusal of a second import.
- **The Price Entry dialogue** and the **Market Data dialogue**. Both stay as they are.
- **The Edit Job page frame.** Stage navigation is a vertical MUI `Stepper` in `editJob.jsx` and the
  stage's panels render inside its active `Step`. Nothing here changes how a reader moves between
  stages, and no stage depends on that changing first. Replacing the stepper with tabs is now
  [planning-stage-panels](../planning-stage-panels/contents.md) § Stage Q, and it confirms that
  independence rather than relying on it — no stage panel imports anything from `editJob.jsx`, so it
  can land before, after or beside this project.
- **The Extras editor on the Complete stage.** This project proposes surfacing the same rows here and
  says so; whether Extras moves, is mirrored, or stays is a decision about Complete, taken with it.
- **The excess hand-off.** Offering over-bought units to a sibling job is a behavioural change that
  writes to a job the player is not editing. It is described and deliberately left out of the stage
  sequence — see [plan.md](./plan.md) § Not in the sequence.
- Live SPA and backend behaviour, promoted only when this project closes.

## Task map

| I need to… | Read |
|------------|------|
| Understand what is wrong with the stage today | [plan.md](./plan.md) § Starting position |
| See the surfaces that replace it | [plan.md](./plan.md) § Target shape |
| Know why the price ladder comes first | [plan.md](./plan.md) § Ordering |
| Find the price resolution defect and its fix | [plan.md](./plan.md) § Stage A |
| See what the worklist row carries | [plan.md](./plan.md) § Stage B |
| Find why the drawer has two separated zones | [plan.md](./plan.md) § Stage C |
| Know when a parent may take a child's cost | [plan.md](./plan.md) § Stage D |
| Find why purchase recording exists twice | [plan.md](./plan.md) § Starting position, § Stage F1 |
| Find the stored plan price and what it costs to build | [plan.md](./plan.md) § Stage F2 |
| Check what is additive and what breaks | [plan.md](./plan.md) § Wire compatibility |
| See how the multibuy paste is reviewed | [plan.md](./plan.md) § Stage G |
| Understand why assets are behind a choice | [plan.md](./plan.md) § Stage H |
| Know what “Job costs” includes, and why | [plan.md](./plan.md) § Stage I |
| See how several setups are drawn | [plan.md](./plan.md) § Stage I, § Several setups |
| Find the setup-count census behind that rule | [measurements/setup-counts.md](./measurements/setup-counts.md) |
| Find the real job the full-page design is drawn from | [measurements/ishtar-job.md](./measurements/ishtar-job.md) |
| Know what changes on mobile | [plan.md](./plan.md) § Stage J |
| Find what was described but deliberately not scheduled | [plan.md](./plan.md) § Not in the sequence |
| See the visual design the stages build to | [plan.md](./plan.md) § Design reference |
| See how a part works while the project is in flight | [overlay.md](./overlay.md) |
| See the stages and their order | [plan.md](./plan.md) § Stages |
| Check what has landed | [plan.md](./plan.md) § Stage status |
