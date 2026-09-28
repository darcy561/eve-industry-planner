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
| Goals, scope, done-when | [plan.md](./plan.md) |
| Know why every rig applies to all items, and what reading one against an item would take | [plan.md](./plan.md) § A rig knows what it applies to |
| Know why a rig's security multipliers and a structure's legality rules do not belong in one table | [plan.md](./plan.md) § A requirement belongs to the thing it describes |
| Know what is additive, what breaks the wire, and what needs a migration | [plan.md](./plan.md) § A requirement belongs to the thing it describes, **Wire** |
| Understand the stored-figure gate on the second half | [plan.md](./plan.md) § What it owes another project |
| Read how this behaves after a slice lands | [overlay.md](./overlay.md) |
