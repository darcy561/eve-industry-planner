# Custom structure model — measurements

Raw readings this project's design is argued from, taken from the tree on 2026-09-15. Add to it as
work lands; do not replace a measurement with the conclusion drawn from it.

## Four lanes, three classes

`CustomStructures` (`services/shared/models/accountDocuments.go:129`) holds four lanes, but only three
types fill them — manufacturing and reaction are **both** `CustomStructure`.

| Lane | Go type | SPA class |
|------|---------|-----------|
| `manufacturing` | `CustomStructure` | `Classes/customStructure.js` |
| `reaction` | `CustomStructure` | `Classes/customStructure.js` |
| `reprocessing` | `ReprocessingStructure` | `Classes/reprocessingStructure.js` |
| `invention` | `InventionStructure` | `Classes/inventionStructure.js` |

So the lane is already not what decides the shape, and one shape already serves two lanes.

## The fields, and how little they differ

Read from the SPA constructors and the Go structs, which agree field for field.

| Field | manufacturing / reaction | reprocessing | invention |
|-------|--------------------------|--------------|-----------|
| `id` | ✓ | ✓ | ✓ |
| `jobType` | ✓ | ✓ | ✓ |
| `name` | ✓ | ✓ | ✓ |
| `structureType` | ✓ | ✓ | ✓ |
| `systemType` | ✓ | ✓ | ✓ |
| `tax` | ✓ | ✓ | ✓ |
| `default` | ✓ | ✓ | ✓ |
| `rigType` | ✓ | — | — |
| `systemID` | ✓ | — | — |
| `rigSlot1` | — | ✓ | ✓ |
| `rigSlot2` | — | ✓ | ✓ |
| `implant` | — | ✓ | — |

**Seven of twelve fields are common to all three.** The differences are one rig field against two, a
system id, and an implant.

## Every row already carries its own type

All three classes and all three Go structs store `jobType`, and every id is minted with a per-type
prefix from `customStructureLocationMap` (`Context/defaultValues.jsx:604`): `manStruct-`,
`reacStruct-`, `reprocessingStruct-`, `inventionStruct-`, each followed by a UUID.

A row lifted out of its lane is therefore still self-describing, twice over. Nothing has to be
inferred from which array it was found in.

## Methods, and the one that is not shared

| Class | Methods beyond the shared setters and `toDocument` |
|-------|----------------------------------------------------|
| `CustomStructure` | `setRigType`, `setSystemID` |
| `ReprocessingStructure` | `setRigSlot1`, `setRigSlot2`, `setImplant`, **`rigBonusFor`**, **`structureBonusFor`** |
| `InventionStructure` | `setRigSlot1`, `setRigSlot2` |

`rigBonusFor` and `structureBonusFor` are reprocessing's own calculations and the only real behaviour
difference in the three files.

## How much code would move

| Surface | Count |
|---------|-------|
| SPA files importing any of the three classes, excluding tests | 7 |
| SPA files mentioning `customStructures` at all, excluding tests | 9 |
| Go references to a named lane, excluding tests | 5 |
| SPA references to `customStructures.manufacturing` / `.reaction` | 1 each |
| SPA references to `customStructures.reprocessing` / `.invention` | 0 each |

The Go references are the planner settings clone (`models/planner/settings.go:72-75`),
`EmptyCustomStructures()` (`accountDocuments.go:22`), and the v0→v1 upgrade step that seeds
`Invention` (`documentschema/documentschema.go:50`).

The SPA reads the lanes almost nowhere by name: the store keeps them and the settings screens build
from the classes.

## Schema versions in play

| Document | Constant | Value |
|----------|----------|-------|
| `ApplicationSettings` | `models.ApplicationSettingsSchemaCurrent` | 1 |
| Planner settings | `planner.SettingsSchemaCurrent` | 1 |

Both documents embed the same `models.CustomStructures`, so both are on the hook for any reshape.
The existing v0→v1 step for `ApplicationSettings` — seeding an absent `Invention` lane — is the worked
precedent for the step this project needs.

## `go fix -diff`

Run while this plan was written, scoped to the packages in the touch surface.

| Scope | Result |
|-------|--------|
| `./shared/models/...` | Clean |
| `./shared/documentschema/...` | Clean |
