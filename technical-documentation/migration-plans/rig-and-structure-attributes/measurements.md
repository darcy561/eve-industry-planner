# Rig and structure attributes — measurements

Raw readings this project's design is argued from, taken from the tree on 2026-09-28. Add to it as
work lands; do not replace a measurement with the conclusion drawn from it.

## The requirements table, in full

Three entries, in `Context/defaultValues.jsx`, doing three unrelated jobs.

| Id | Label | Carries | What it is |
|----|-------|---------|------------|
| 0 | The Fulcrum - Zarzak | `rigID: 0`, `systemTypeID: 3`, `structureID: 4`, `systemID: 30100000`, `taxValue: 0.25`, `allowedJobTypes` | A legality rule: one structure, in one system, manufacturing only, no rigs |
| 1 | Thukker Manufacturing Rigs | `rigID: 9`, `alternativeSystemValue: {0: 0.1, 1: 1.9, 2: 0.1}`, `allowedJobTypes` | Per-rig security data, not a constraint at all |
| 2 | NPC Station | `rigID: 0`, `structureID: 0`, `taxValue: 0.25` | A legality rule: no rigs, and a tax |

Two of the three are constraints on what a reader may pick; one is a rig's own figures. Entries 0 and
2 both set `rigID: 0`, which is the constraint "this place takes no rigs" expressed as a value to write
rather than a rule to enforce.

`taxValue: 0.25` appears on both constraint entries. ESI publishes no facility tax for either, so
neither figure could be verified against the game.

## What points into it

| Pointer | Where | Count |
|---------|-------|-------|
| A rig's own `requirementID` | `manRigs[9]` | 1 of 24 rigs across all four kinds |
| A structure's `requirementID` | `manStructure[0]` (NPC Station), `manStructure[4]` (The Fulcrum) | 2 |
| A system security's `requirementID` | `manSystem[3]` (Zarzakh) | 1 |
| A system id's, through a second table | `systemStructureRequirements[30100000]` | 1 |

Four kinds of thing point at one table of three entries, and one of those pointers is a second table
whose only row restates what requirement 0 already says.

## Five modules read the requirement machinery

`Classes/jobSetup.js`, `Functions/Blueprint Calculations/calculateMaterialsForSetup.js`,
`Components/Settings/Standard Layout/Custom Structures/structureForm.jsx`,
`Styled Components/autocomplete/virtualisedSystemSearch.jsx`, and the table itself.

`structureForm.jsx` holds its own `applyRequirements` beside `Setup`'s — the same rule written twice —
and `virtualisedSystemSearch.jsx` reads `systemStructureRequirements` to decide which systems a kind may
be offered.

## `appliedRequirementID` is written and never read

Seven mentions in `Classes/jobSetup.js`: the constructor default (`-1`), the JSDoc, `toDocument`, the
write in `applyRequirements`, and the reset in `removeRequirements`. Nothing reads it to make a
decision. It is declared on the Go side too, as `AppliedRequirementID int64` on
`services/shared/models/job.go`, so it is persisted in every stored setup.

## Manufacturing has no item vocabulary; reprocessing does

| Kind | Rigs | Carrying `appliesToAll` | Carrying `appliesTo` |
|------|------|-------------------------|----------------------|
| Manufacturing | 5 | 5 | 0 |
| Reaction | 4 | 4 | 0 |
| Invention | 6 | 6 | 0 |
| Reprocessing | 9 | 0 | 9 |

Reprocessing rigs name the item types they help, from `reprocessingItemTypes` — ore, moon ore, ice, gas,
scrap, unrefined ore. The other three kinds have no counterpart list, so every one of their fifteen rigs
is flagged as helping everything, and `rigSlotBonuses` counts a rig only when that flag is set.

## `manSystem` conflates a system with a security class

Four entries where the axis has three: High Sec (1), Low Sec (1.9), Null Sec / WH (2.1), and Zarzakh
(1) — a single solar system sitting in a list of security bands, carrying `requirementID: 0` to say so.

## `go fix -diff`

Run 2026-09-28 over `./core/commands/...` and `./shared/models/...`. **Not empty**: one suggestion in
`shared/models/job_test.go`, merging a struct literal with a field assigned on the next line. It is in a
test, and in neither the setup shape nor the release commands this project touches, so it is not taken
here — named so a later scan coming back non-empty is not mistaken for new debt.
