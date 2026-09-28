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

## Stages

**Phase 1 — project folder and docs.** This file, [contents.md](./contents.md),
[overlay.md](./overlay.md), [measurements.md](./measurements.md), and the row in the section
[contents.md](../contents.md). Done.

**Stage A — A rig carries its own security multipliers.** Requirement 1 is not a constraint at all: it
is rig 9's figures, reached through a pointer. This stage puts them on the rig row as a
`security: { 0, 1, 2 }` map matching ESI's `hiSecModifier` / `lowSecModifier` / `nullSecModifier`,
carried **per axis** through `rigSlotBonuses`' winner because each rig has its own modifier and one
figure for a whole setup is not what the game does. `getSystemData` then reads the rig before the system
type, and requirement 1 disappears.

It lands first because it is the half that **moves a stored figure**, and because
[job-document-drafts](../job-document-drafts/plan.md) is waiting on it — see § What it owes another
project. Nothing else here depends on it.

**Stage B — A constraint is declared where it is read.** The two remaining entries are legality rules
about what a reader may pick. This stage makes them one declared list keyed on the choice —
`{ label, when, forces }` — evaluated by a read-time selector rather than written onto the setup. One
entry point instead of four, nothing game-derived stored, and the same declaration locks the fields it
forces, so an illegal combination is unreachable: today nothing stops a reader choosing The Fulcrum and
then changing the system out from under it.

`systemStructureRequirements` becomes the reverse index of that list rather than a second table, which
is what removes the duplicate implementation in `structureForm.jsx` and the picker. `manSystem` goes
back to the three security buckets ESI names; Zarzakh's specialness is a legality rule and belongs in
the list with the rest.

**Stage C — The setup stops storing what the game decides.** `appliedRequirementID` comes off the
stored shape in both languages, and the fields `applyRequirements` wrote onto a setup are derived where
they are read. Last, because it is only safe once B has somewhere to derive them from.

**Stage D — A rig knows which items it helps.** A real manufacturing rig helps one family of items —
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

It is last because it is the only stage that needs a vocabulary that does not exist yet, and because
nothing else waits on it.

## What one table is doing today

`requirementID` points into a flat table of three entries and hangs off four different kinds of thing —
a structure, a rig, a system security and a system id through `systemStructureRequirements`. Those three
entries do three unrelated jobs: two are legality rules about what a reader may pick, and one is rig 9's
own security figures, which ESI publishes as dogma attributes 2355/2356/2357 on type 45641. Every row,
every pointer and every reader is counted in [measurements.md](./measurements.md).

**Two execution models read it, and neither is right.** `applyRequirements` writes the requirement's
fields onto the stored setup at selection time and persists `appliedRequirementID` — it **stores
game-derived facts**, which [planning-stage-panels/plan.md](../planning-stage-panels/plan.md) § What is
stored, and where forbids: game constants live in the SPA, the player's choices live in the document.
`gatherRequirements` is meant to re-derive them at calculation time, letting the structure, the rig and
the system each contribute, and it **does not work at all** — the rig axis is dead, so rig 9's security
data reaches no calculation today.

**And the rule is written twice.** `Setup` holds one implementation and the Custom Structures
`structureForm.jsx` holds its own `applyRequirements` beside it, while `virtualisedSystemSearch.jsx`
reads the second table to decide which systems a kind may be offered.

That is what the stages above take apart: a rig's figures go on the rig, a constraint becomes a
declaration evaluated where it is read, and the setup stops carrying either.

## Wire compatibility

| Surface | Change | Note |
|---------|--------|------|
| The constraint list and the rig `security` maps | **Additive** | SPA-only; no stored shape and nothing crosses a process boundary |
| `appliedRequirementID` on a stored setup | **Migrate-required** | A stored-shape removal in both languages, owing a prerelease step |
| A stored setup's `materialCount` | **Migrate-required, and it moves figures** | Making rig 9's multiplier reachable changes the material quantity a saved setup already holds — the gate that kept this defect out of the job cutover. Recalculating is a `prepareRelease` step over stored setups, not an upgrader |

## Open questions

- **Is Zarzakh's rig multiplier really 1**, rather than null sec's figure? The table says 1 and nothing
  confirms it.
- **Does EVE apply a security modifier per rig, or one per structure?** Stage A's shape assumes per rig,
  which is what carrying it on the rig row means.
- **Where do the two `taxValue: 0.25` entries come from?** They could not be verified: ESI publishes no
  facility tax for either The Fulcrum or an NPC station.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| A — a rig's own security multipliers | Not started |
| B — a constraint declared where it is read | Not started |
| C — the setup stops storing what the game decides | Not started |
| D — a rig knows which items it helps | Not started |

## Start here

**Stage A**, because it is what [job-document-drafts](../job-document-drafts/plan.md) is waiting on and
the only stage that moves a figure a job has already stored. Read
[measurements.md](./measurements.md) § The requirements table, in full first: the three entries do three
unrelated jobs, and seeing that is what makes the rest of this plan read as one change rather than four.

Stages B and C are one piece of work in two parts and should be taken together or in that order. Stage D
is independent of all three and can be scheduled whenever the item-family vocabulary is worth building.

## Done when

- A rig names the family of items it helps, and a rig that helps one family is not counted for an item
  it does not.
- A structure's and a system's legality rules are one declared list, evaluated where they are read,
  with nothing game-derived written onto a stored setup.
- `appliedRequirementID` is gone from the stored shape in both languages, and the stored
  `materialCount` of every affected setup has been recalculated.
- Live SoT promoted and this folder deleted.
