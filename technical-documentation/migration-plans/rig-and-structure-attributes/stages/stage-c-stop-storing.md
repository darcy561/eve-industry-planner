# Stage C — The setup stops storing what the game decides

**Depends on:** [Stage B](./stage-b-declared-constraints.md), which is where the values are derived
from instead. **Moves stored figures:** no, but it removes a stored field.

## What is wrong

`applyRequirements` persists `appliedRequirementID` and stamps game constants onto the player's stored
setup. [planning-stage-panels](../../planning-stage-panels/plan.md) § What is stored, and where
forbids exactly this: game constants live in the SPA, the player's choices live in the document.

And nothing reads it. Seven mentions in
[`Classes/jobSetup.js`](../../../../frontend/src/Classes/jobSetup.js) — the constructor default
(`-1`), the JSDoc, `toDocument`, the write in `applyRequirements`, the reset in `removeRequirements` —
and no decision anywhere depends on its value. It is declared on the Go side as
`AppliedRequirementID int64` on [`job.go`](../../../../services/shared/models/job.go), so it is
persisted in every stored setup.

## Steps

1. **Delete the write path** from `Classes/jobSetup.js`: `manageRequirements`, `applyRequirements`,
   `removeRequirements`, `getObjectRequirements`, `getSystemIDRequirements` and `gatherRequirements`.
   With Stage B landed, every one of them has a read-time answer.
2. **Stop the four updaters stamping fields.** `updateStructureID`, `updateRigSlot`, `updateSystemType`
   and `updateSystemID` set the field the reader chose and nothing else. What a declaration forces is
   applied by the selector at read time, and refused at the picker.
3. **Remove `appliedRequirementID`** from the constructor, the JSDoc and `toDocument`.
4. **Remove `AppliedRequirementID`** from `models.JobSetup` in
   [`job.go`](../../../../services/shared/models/job.go), and from the fixture in
   [`job_model_parity_test.go`](../../../../services/shared/models/job_model_parity_test.go).
5. **Run `go fix -diff`** on the packages touched and nothing else — `./shared/models/...` here. The
   standing position is recorded in [measurements.md](../measurements.md) § `go fix -diff`.

## Tests

- `jobSetupStructure.test.js` currently asserts `appliedRequirementID` is written and preserved. Those
  cases are replaced by cases asserting that choosing a constrained structure changes only the field
  the reader chose, and that the forced values resolve at read time.
- A parity test proving the stored shape no longer carries the field in either language.

## Migration

`appliedRequirementID` comes off the stored shape in both languages, which owes a release step
unsetting it from every stored setup. It rides the same cutover as Stage A's recalculation and Stage
B's `systemTypeID` remap — one walk over stored jobs rather than three.

The leftovers `removeRequirements` never undid are a separate question, and this is the stage that has
to answer it: a stored setup may hold a `taxValue`, `systemID` or `systemTypeID` written by a
requirement it no longer names. Decide deliberately whether the release step clears them or leaves
them as the reader's own values — they are indistinguishable from a deliberate choice by then, which
argues for leaving them and letting the pickers surface them.

## Done when

- The requirement write path is gone from `Setup`, and the four updaters set only what was chosen.
- `appliedRequirementID` and `AppliedRequirementID` are gone from both languages and from stored
  documents.
- `go fix -diff` is clean on the packages this stage edited.
