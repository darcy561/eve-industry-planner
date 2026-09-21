# Building stage panels

## Owns

The Edit Job **Building** stage: what it asks, what it answers, and the shape it answers in.

- The **retirement of the two tabs**. `availableJobs.jsx` and `linkedJobs.jsx` draw the same card in
  757 lines and disagree about what colour a finished run is; what replaces them is one row component
  and one status vocabulary.
- **What the stage is a checklist of** — the slots a setup plans — and how a linked run is matched to a
  setup when nothing records which one it was installed for.
- The **separation of linked from offered**: a run inside a setup section is one the reader has linked,
  and everything the matcher found sits in a block of its own.
- **How a list stays readable at thirty slots**: one grouping rule, applied to the runs, the schedule
  and the setup table, on keys that do not move.
- The **schedule** that replaces a progress readout, because industry runs last days and the useful
  figure is the wall-clock moment each one is due.
- The **corporation / personal filter** over what is offered, and where it must not reach.
- **Which clock a time is shown in**, the account setting that decides it, and the shared formatter
  that reads it.
- What the stage does on a **phone**, which today is the standard layout inside a nested scroll region.

## Does not own

- **Managing linked ESI jobs across the archive.** Archiving a job releases its runs from
  `account.linkedJobs` and they return to the offers — a system of its own, being designed separately.
  This project records the mechanism and the facts that system inherits, and mitigates only so far as
  not making the consequence cheaper — see [plan.md](./plan.md) § Handed on.
- **Recording a setup id on a linked run.** The field that would make attribution exact on every path
  is a stored-shape change and its own slice; this project matches on what both sides already carry and
  says plainly where that is not enough.
- **The Edit Job page frame.** Stage navigation is a vertical MUI `Stepper` in `editJob.jsx` and the
  stage's panels render inside its active `Step`. Nothing here changes how a reader moves between
  stages, and no stage depends on that changing first. Replacing the stepper with tabs is now
  [planning-stage-panels](../planning-stage-panels/contents.md) § Stage Q, and it confirms that
  independence rather than relying on it — no stage panel imports anything from `editJob.jsx`, so it
  can land before, after or beside this project.
- **Listing and resolving a custom structure.** That belongs to
  [custom-structure-model](../custom-structure-model/contents.md); this stage reads whatever it
  resolves, and falls back to the size-class list where a setup names none.
- **The shared components this stage reuses.** The worklist row, the muted destructive control, the
  Job costs panel and its setup table are
  [purchasing-stage-panels](../purchasing-stage-panels/contents.md)'. This project uses them and
  revises one of that project's decisions — see § Owed to the purchasing work.
- **How ESI industry jobs are fetched.** `useGetAllIndustryJobs` and the matcher's own reads are
  unchanged; this project changes what is drawn from them.
- Live SPA and backend behaviour, promoted only when this project closes.

## Owed to the purchasing work

This project's grouping rule **reverses a decision recorded in**
[purchasing-stage-panels/plan.md](../purchasing-stage-panels/plan.md) § Stage I. That plan first
rejected grouping identical setups because a roll-up which collapses only while every field matches
changes format under the reader. The objection is sound about a *conditional* roll-up and does not
apply to an unconditional one: group always, and a group of one is an ordinary row. That plan has been
corrected and cites this one; the two must not be read as disagreeing.

## Task map

| I need to… | Read |
|------------|------|
| Understand what is wrong with the stage today | [plan.md](./plan.md) § Starting position |
| See the surfaces that replace it | [plan.md](./plan.md) § Target shape |
| Know why the row component comes first | [plan.md](./plan.md) § Ordering |
| Find the two contradictions duplication has already caused | [plan.md](./plan.md) § Stage A |
| Tell the two fields named `esiJobTab` apart | [plan.md](./plan.md) § Stage A |
| See the grouping rule and why a group of one is a row | [plan.md](./plan.md) § Stage B |
| Know why a schedule replaced a progress bar | [plan.md](./plan.md) § Stage C |
| Find how a run is matched to a setup, and where it cannot be | [plan.md](./plan.md) § Stage D |
| See what an empty planned slot means and why it is a row | [plan.md](./plan.md) § Stage D |
| Understand why offers are a separate block | [plan.md](./plan.md) § Stage E |
| Know what the owner filter may and may not touch | [plan.md](./plan.md) § Stage F |
| Find which clock a timestamp is in | [plan.md](./plan.md) § Stage G |
| Know what changes on mobile | [plan.md](./plan.md) § Stage H |
| Find what this project handed to another system | [plan.md](./plan.md) § Handed on |
| Check what is additive and what breaks | [plan.md](./plan.md) § Wire compatibility |
| See how many jobs actually sit on this stage | [measurements/stage-occupancy.md](./measurements/stage-occupancy.md) |
| Find why no linked-run figures were measured | [measurements/stage-occupancy.md](./measurements/stage-occupancy.md) § What could not be measured |
| See the visual design the stages build to | [plan.md](./plan.md) § Design reference |
| See how a part works while the project is in flight | [overlay.md](./overlay.md) |
| Check what has landed | [plan.md](./plan.md) § Stage status |
