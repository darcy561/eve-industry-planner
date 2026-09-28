# Rig and structure attributes — plan

**Status:** Phase 1 done (this folder). Neither piece of work has started.

**Code in scope:** [`frontend/src/Context/defaultValues.jsx`](../../../frontend/src/Context/defaultValues.jsx)
— the rig, structure, system and requirement tables;
[`frontend/src/Functions/Custom Structures/rigs.js`](../../../frontend/src/Functions/Custom%20Structures/rigs.js);
[`frontend/src/Classes/jobSetup.js`](../../../frontend/src/Classes/jobSetup.js) — `applyRequirements`,
`gatherRequirements` and `appliedRequirementID`;
`frontend/src/Components/Settings/Standard Layout/Custom Structures/structureForm.jsx` and
[`frontend/src/Styled Components/autocomplete/virtualisedSystemSearch.jsx`](../../../frontend/src/Styled%20Components/autocomplete/virtualisedSystemSearch.jsx)
— the second implementation of the same rule;
[`frontend/src/Functions/Blueprint Calculations/`](../../../frontend/src/Functions/Blueprint%20Calculations/)
— what reads a rig's figures; and a `prepareRelease` step in
[`services/core/commands/`](../../../services/core/commands/) for the stored shape.
**Live SoT (until promote):** [frontend/settings/custom-structures.md](../../frontend/settings/custom-structures.md),
[backend/shared/custom-structures.md](../../backend/shared/custom-structures.md)

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages.
Live SoT will not be edited until this project is complete and promotion is approved.

## Why this project exists

What a rig helps and what a structure allows are facts about the rig and the structure, and neither is
recorded on one. A rig's item family is not recorded at all, so every rig the app can fit is flagged as
helping everything. A structure's and a system's legality rules share one flat `requirements` table with
a rig's security multipliers, hanging off four different kinds of thing, read by two execution models —
one of which writes game constants onto the player's stored setup and the other of which does not work.

Both were found inside the custom structure model, which made the shape expressible and deliberately
did not schedule either. They are one project because they are the same table, read the same two ways.

## What it owes another project

[job-document-drafts](../job-document-drafts/plan.md) § A defect this found, which the cutover does not
fix records that `Setup.gatherRequirements` calls `this.getRigObject`, which is not a member, so a rig's
requirement reaches no calculation. `manRigs[9]` carries one holding an `alternativeSystemValue`, and the
figure it feeds is **material quantity, which is stored** — so correcting it changes saved figures for
every affected job. The second section below is the shape that answers it, including the
`prepareRelease` recalculation that has to come with it.

## A rig knows what it applies to

A real manufacturing rig helps one family of items —
ships, modules, drones — the way a reprocessing rig helps one kind of ore. Every converted rig carries
`appliesToAll` because the stored data never recorded which family it helped, and `rigSlotBonuses`
counts only flagged rigs, so an item-specific rig cannot silently apply to everything.

This stage gives manufacturing an item-family vocabulary — there is no counterpart to
`reprocessingItemTypes` — teaches the rig tables to name families, and reads a rig against what is
being built. The custom structure model made this expressible and did not schedule it.

Two things it inherits and must handle: readers have been told by the form's own help text to create
**a second custom structure** for items a rig does not cover, so real structures exist that were
built as a workaround for the missing support; and a reader who fitted a generic rig means "I do not
know which", not "it applies to everything".

## A requirement belongs to the thing it describes

`requirementID` points into a flat
table of three entries and hangs off four different kinds of thing — a structure, a rig, a system type,
and a system id through `systemStructureRequirements`. Those three entries do three unrelated jobs: two
are legality constraints (The Fulcrum takes no rigs and sits in one system; an NPC station takes no
rigs), and one is per-rig security data — rig 9's `alternativeSystemValue`, which ESI publishes as dogma
attributes 2355/2356/2357 on type 45641.

Two execution models read that table. `applyRequirements` writes the requirement's fields onto the
stored setup at selection time and persists `appliedRequirementID`; `gatherRequirements` is meant to
re-derive them at calculation time, letting the structure, the rig and the system each contribute. The
first **persists game-derived facts**, which
[planning-stage-panels/plan.md](../planning-stage-panels/plan.md) § What is stored, and where forbids —
game constants live in the SPA, the player's choices live in the document. The second **does not work at
all**: the rig axis is dead, so rig 9's security data reaches no calculation today —
[job-document-drafts/plan.md](../job-document-drafts/plan.md) § A defect this found, which the cutover
does not fix has why.

And the rule is written twice: `Setup` holds one implementation and the Custom Structures
`structureForm.jsx` holds its own `applyRequirements` beside it, while `virtualisedSystemSearch.jsx`
reads the second table to decide which systems to offer.

What would replace it:

- **Security multipliers onto the rig row**, as a `security: { 0, 1, 2 }` map matching ESI's
  `hiSecModifier` / `lowSecModifier` / `nullSecModifier`. `getSystemData` then reads the rig before the
  system type, requirement 1 disappears, and the lookup that is missing has nothing left to find.
  Carried **per axis** with `rigSlotBonuses`' winner, because each rig has its own modifier and one
  figure for the whole setup is not what the game does.
- **Constraints as one declared list** keyed on what a reader picks — `{ label, when, forces }` —
  evaluated by a read-time selector rather than written onto the setup. One entry point instead of four,
  nothing game-derived stored, and the same declaration locks the fields it forces so an illegal
  combination is unreachable; today nothing stops a reader choosing The Fulcrum and then changing the
  system.
- **`systemStructureRequirements` derived** as the reverse index of that list rather than kept as a
  second table, which is what removes the duplicate implementation in the settings form and the picker.
- **`appliedRequirementID` removed** from the stored shape in both languages — it is written, persisted
  and read by nothing.
- **`manSystem` back to three security buckets.** Entry 3 "Zarzakh" conflates one system with a
  security class. What the axis needs is the three buckets ESI names; Zarzakh's specialness is a
  legality rule and belongs in the constraint list with the rest.

**Wire:** the constraint list and the rig `security` maps are SPA-only. `appliedRequirementID` is a
stored-shape removal and needs a prerelease step. **Stored `materialCount` moves**, because making rig
9's multiplier reachable changes the material quantity a saved setup already holds — which is the gate
that kept the defect from being taken during the job cutover. Recalculating is a `prepareRelease` step
over stored setups, not an upgrader.

**Three open questions come with it.** Whether Zarzakh's rig multiplier is really
1 rather than null sec's figure; whether EVE applies a security modifier per rig or one per structure,
which the shape above assumes is per rig; and the two `taxValue: 0.25` entries, which could not be
verified because ESI does not publish them.


## Done when

- A rig names the family of items it helps, and a rig that helps one family is not counted for an item
  it does not.
- A structure's and a system's legality rules are one declared list, evaluated where they are read,
  with nothing game-derived written onto a stored setup.
- `appliedRequirementID` is gone from the stored shape in both languages, and the stored
  `materialCount` of every affected setup has been recalculated.
- Live SoT promoted and this folder deleted.
