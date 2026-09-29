# Rig and structure attributes

## Owns

Where a fact about a rig, a structure or a system lives: on the thing it describes, rather than in a
flat table hanging off four different kinds of thing.

- **Which items a rig helps.** The game's own item-family vocabulary, the rig tables naming families,
  and reading a rig against what is being built — today every fittable rig is flagged as helping
  everything, because the stored data never recorded a family.
- **A rig's security multipliers**, carried on the rig row per axis, the way ESI publishes them.
- **A structure's and a system's legality rules**, as one declared list evaluated where it is read, in
  place of `requirements`, `systemStructureRequirements` and the two implementations that read them —
  and driving what every picker offers.
- **What a setup stops storing** — `appliedRequirementID`, and the game constants written onto it at
  selection time — and the recalculation of the stored `materialCount` that follows.
- **What a factional warfare system does to install cost**, and the enlistment a conditional bonus
  reads.

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
  records the defect Stage A answers.

## Task map

| I need to… | Read |
|------------|------|
| Understand why this is one project, and what order to do it in | [plan.md](./plan.md) § Why this project exists, § Sequencing |
| Know which stage to pick up, and what to settle first | [plan.md](./plan.md) § Start here |
| Follow a stage step by step | The stage's own file under [stages/](./stages/) |
| Move a rig's security multipliers onto the rig | [stages/stage-a-rig-security.md](./stages/stage-a-rig-security.md) |
| Replace the requirements tables with one declared list, and filter the pickers | [stages/stage-b-declared-constraints.md](./stages/stage-b-declared-constraints.md) |
| Take `appliedRequirementID` off the stored shape | [stages/stage-c-stop-storing.md](./stages/stage-c-stop-storing.md) |
| Give rigs their real item families, and rebuild the rig field | [stages/stage-d-real-rigs.md](./stages/stage-d-real-rigs.md) |
| Add a factional warfare system's cost effect | [stages/stage-e-fw-cost.md](./stages/stage-e-fw-cost.md) |
| Know what has already been decided and should not be reopened | [plan.md](./plan.md) § Decisions taken |
| Know what is additive, what needs a migration, and what moves a stored figure | [plan.md](./plan.md) § Wire compatibility |
| Know what is still unanswered and which stage it blocks | [plan.md](./plan.md) § Open questions |
| See what the three requirement entries actually hold, and everything that points at them | [measurements.md](./measurements.md) § The requirements table, in full |
| See what the game itself publishes about rigs, families and security | [measurements.md](./measurements.md) § What the SDE says about rigs |
| See what The Fulcrum really gives, and how the app reads it | [measurements.md](./measurements.md) § What The Fulcrum actually gives |
| See what a requirement leaves behind when it is removed | [measurements.md](./measurements.md) § `removeRequirements` undoes nothing but the id |
| See how far manufacturing is from reprocessing's item vocabulary | [measurements.md](./measurements.md) § Manufacturing has no item vocabulary; reprocessing does |
| Check the `go fix` position before writing Go | [measurements.md](./measurements.md) § `go fix -diff` |
| Read how this behaves after a slice lands | [overlay.md](./overlay.md) |
| Check the two models against each other, figure by figure | [measurements.md](./measurements.md) § The live model and this one, § What a refinery yields, § What installing a setup costs |
| See what is ready to fold into live documentation, and where each draft lands | [promote/README.md](./promote/README.md) |
