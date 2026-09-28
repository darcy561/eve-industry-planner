# Rig and structure attributes

## Owns

Where a fact about a rig or a structure lives: on the thing it describes, rather than in a flat table
hanging off four different kinds of thing.

- **Which items a rig helps.** An item-family vocabulary for manufacturing, the rig tables naming
  families, and reading a rig against what is being built — today every fittable rig is flagged as
  helping everything, because the stored data never recorded a family.
- **A rig's security multipliers**, carried on the rig row per axis, the way ESI publishes them.
- **A structure's and a system's legality rules**, as one declared list evaluated where it is read,
  in place of `requirements`, `systemStructureRequirements` and the two implementations that read them.
- **What a setup stops storing** — `appliedRequirementID`, and the game constants written onto it at
  selection time — and the recalculation of the stored `materialCount` that follows.

**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan tracks done + live-SoT **promote**
(go-ahead).

## Does not own

- **The custom structure model itself** — one shape, one array, the field map, the two rig slots and
  what a setup takes from a structure. That is live:
  [frontend/settings/custom-structures.md](../../frontend/settings/custom-structures.md) and
  [backend/shared/custom-structures.md](../../backend/shared/custom-structures.md).
- **The rig-conflict rule** and how two fitted rigs combine per axis, which are landed behaviour in
  those same documents.
- **The Edit Job and Planning panels** that display or edit a setup's structure →
  [planning-stage-panels](../planning-stage-panels/contents.md),
  [purchasing-stage-panels](../purchasing-stage-panels/contents.md).
- **The job document's own shape** → [job-document-drafts](../job-document-drafts/contents.md), which
  records the defect this project's second half answers.

## Task map

| I need to… | Read |
|------------|------|
| Goals, stages, done-when, open questions | [plan.md](./plan.md) |
| Know which stage to pick up, and why that one | [plan.md](./plan.md) § Start here |
| See what the three requirement entries actually hold, and everything that points at them | [measurements.md](./measurements.md) § The requirements table, in full |
| Know why one table read two ways is one problem rather than four | [plan.md](./plan.md) § What one table is doing today |
| Know why every rig applies to all items, and what reading one against an item would take | [plan.md](./plan.md) § Stage D |
| See how far manufacturing is from reprocessing's item vocabulary | [measurements.md](./measurements.md) § Manufacturing has no item vocabulary; reprocessing does |
| Know what is additive, what needs a migration, and what moves a stored figure | [plan.md](./plan.md) § Wire compatibility |
| Understand the stored-figure gate this owes job-document-drafts | [plan.md](./plan.md) § What it owes another project |
| Check the `go fix` position before writing Go | [measurements.md](./measurements.md) § `go fix -diff` |
| Read how this behaves after a slice lands | [overlay.md](./overlay.md) |
