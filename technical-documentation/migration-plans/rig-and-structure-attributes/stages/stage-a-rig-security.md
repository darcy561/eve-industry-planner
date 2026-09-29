# Stage A — Every rig carries its own security multipliers

**Depends on:** nothing. **Blocks:** [job-document-drafts](../../job-document-drafts/plan.md).
**Moves stored figures:** yes — `materialCount`.

## What is wrong

`requirements[1]` is not a constraint. It is rig 9's own security figures, reached through a pointer
from `manRigs[9].requirementID`, and it never arrives: `Setup.gatherRequirements` asks for them with
`this.getObjectRequirements(this.getRigObject)`, and `getRigObject` is not a member of `Setup`, so the
guard returns `null` and the rig axis is dead. The structure and system-type axes beside it work.

Every rig in the game carries `hiSecModifier` / `lowSecModifier` / `nullSecModifier` of its own. The
standard trio is `1 / 1.9 / 2.1`, which is exactly what `manSystem` stores as a system's `value` — so
the app has a rig attribute recorded on space itself, and one rig whose figures differ has been bolted
on beside it through a pointer. Reprocessing rigs carry a different trio again (`1 / 1.06 / 1.12`),
which the app cannot express at all.

Readings: [measurements.md](../measurements.md) § What the SDE says about rigs.

## Steps

1. **Put `security` on every rig row whose axis is scaled** in
   [`Context/defaultValues.jsx`](../../../../frontend/src/Context/defaultValues.jsx) — `manRigs`,
   `reactionRigs` and `reprocessingRigs` — keyed by the band ids that kind's own system table uses.
   Take each trio from the SDE rather than assuming: the manufacturing standard is `1 / 1.9 / 2.1`,
   rig 9 is `0.1 / 1.9 / 0.1`, reaction's two bands are `1 / 1.1`, and reprocessing is
   `1 / 1.06 / 1.12`.

   **`inventionRigs` gets none.** An invention rig carries `cost` and `time`, and neither is scaled
   by a security band anywhere in the app — `inventionSystem`'s `value` was read by no calculation at
   all, only its `label`. A map nothing reads is data to keep correct for no return, so invention is
   deliberately left out and a test pins that it stays out. If the open question about scaling time
   is ever taken, invention comes with it.
2. **Delete `requirementID: 1` from `manRigs[9]`** and **delete `requirements[1]`**. It is the only
   pointer into that entry.
3. **Teach `rigSlotBonuses`** in
   [`Functions/Industry Facilities/rigs.js`](../../../../frontend/src/Functions/Industry%20Facilities/rigs.js)
   to take the security band and apply each rig's own multiplier **per axis**, so the winner of each
   axis is the better of the two slots after each rig's modifier is applied — not before. One figure
   for the whole setup is not what the game does.
4. **Read the rig, not the system**, in `getSystemData` in
   [`Functions/Blueprint Calculations/calculateMaterialsForSetup.js`](../../../../frontend/src/Functions/Blueprint%20Calculations/calculateMaterialsForSetup.js).
   The `alternativeSystemValue` branch goes; the multiplier now comes from the rig that won the axis.
5. **Drop `value` from the system tables** — `manSystem`, `reactionSystem` and the reprocessing
   equivalent — leaving them naming the band only. Keep the band ids stable; Zarzakh's fourth entry is
   Stage B's to remove, not this stage's.
6. **Follow the same change into reprocessing**:
   [`Classes/reprocessingItem.js`](../../../../frontend/src/Classes/reprocessingItem.js) reads
   `getSystemTypeFromID(...)?.value` and passes `rig` and `sys` separately into
   `reprocessFromItemType`, the same shape the manufacturing formula uses.
7. **Delete `getObjectRequirements`'s rig call site** in
   [`Classes/jobSetup.js`](../../../../frontend/src/Classes/jobSetup.js) — with requirement 1 gone,
   `gatherRequirements` has no rig axis to gather. Do **not** repair `getRigObject`: Stage C deletes
   the method this lives in, and repairing a call that is about to be removed is work spent twice.
   If Stage A ships alone and B/C are deferred, revisit this.

## Tests

- `rigs.test.js` — a rig's own multiplier applied per axis; two rigs with different multipliers where
  the better raw figure loses after its multiplier is applied.
- `manufacturingMaterialCalculation.test.js` — the rig-and-system term for a rig-9 setup in each band.
- The reprocessing formula tests, for the trio that differs from manufacturing's.
- A test that no rig row is missing `security`, so a rig added later cannot silently read zero.

## Migration — none

Live already applies rig 9's own multipliers: `Setup.getRigObject` exists on `Public`, so
`gatherRequirements` reaches requirement 1 and the `0.1 / 1.9 / 0.1` figures are what live costs
those jobs with. The dead rig axis is this branch's, introduced when the rig-slot split removed the
method, and it has never reached a reader.

So no stored `materialCount` moves on this stage's account, and nothing is owed. The corpus in
`Functions/Blueprint Calculations/liveParity.corpus.test.js` proves it setup by setup — see
[measurements.md](../measurements.md) § The live model and this one, compared setup by setup.

## Done when

- Every rig row carries its own `security` trio, and no system table carries a `value`.
- `requirements[1]` is gone and nothing points at it.
- A rig's multiplier is applied per axis to that rig's own figure.
- Stored `materialCount` has been recalculated for every affected setup by a release step.
