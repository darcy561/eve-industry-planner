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

**Neither moved.** The reshape reads from either stored shape, so no version distinguishes them and
the stored documents are converted by a prerelease step instead —
[overlay.md](./overlay.md) § The prerelease step.

## `go fix -diff`

Run while this plan was written, scoped to the packages in the touch surface.

| Scope | Result |
|-------|--------|
| `./shared/models/...` | Clean |
| `./shared/documentschema/...` | Clean |

## What Stage A actually moved (2026-09-19)

Measured from the change itself, not estimated beforehand.

| Surface | Count |
|---------|-------|
| Go non-test files changed | 5, plus 1 added (the release step) |
| Go test files changed | 2 |
| Go test files added | 2 |
| Net lines, non-test Go | +81 (133 added, 52 removed) |
| Lines removed from `session-responses/surface.json` | 45 |
| Lines added to it | 13 |

The wire surface shrinking by 32 lines is the measurement worth keeping: four keyed lists each
re-listing the same seven shared fields collapse to one array that names them once.

### `go fix -diff` after the work

| Scope | Result |
|-------|--------|
| `./shared/models/...` | Clean |
| `./shared/documentschema/...` | Clean |
| `./shared/mongo/...` | Clean |

### Where the SPA reads the lanes, corrected

[plan.md](./plan.md) § Code in scope and the § How much code would move table above put SPA
references to a named lane at one each for `manufacturing` and `reaction` and **zero** for
`reprocessing` and `invention`. That undercounts: `Zustand/applicationSettings/structures.js` reaches
every lane through `customStructureMap[jobType]`, so a grep for a lane's name does not see it. The
coupling is centralised rather than absent, which makes Stage B narrower than the count suggests but
not as narrow as zero.

Files importing one of the three classes, excluding tests, re-counted on 2026-09-19: **7**, unchanged.

## What the SPA side moved (2026-09-20)

Measured from the change, not estimated beforehand.

| Surface | Count |
|---------|-------|
| Classes deleted | 3, plus one test file |
| Files that imported a per-kind class, now on `Structure` | 7 |
| Rig table entries, manufacturing | 10 → 6 |
| Rig table entries, reaction | 9 → 5 |

The rig tables shrinking is the measurement worth keeping: five of the ten manufacturing entries were
pre-combined pairs, and a table of one rig per entry is what makes two slots expressible.

### The consumer count, corrected again

§ How much code would move put "SPA files importing any of the three classes, excluding tests" at 7,
and that held — but it missed the surfaces reaching a lane through `customStructureMap`, which the
2026-09-19 note above records. Both counts were needed to size the work: one for the classes, one for
the store reads.


## A stored `rigType` read after Stage BR (2026-09-20)

Checked while writing Stage D, by feeding `Classes/structure.js` a row shaped exactly as the deleted
`customStructure.js` wrote one. `rigType: 9` is Faction ME — a real manufacturing rig worth 3.7
material and 0.2 time, not a placeholder.

Input row:

```js
{ id: "manStruct-old", jobType: 1, name: "Pre-BR Sotiyo",
  structureType: 0, systemType: 0, rigType: 9,
  systemID: 30000142, tax: 2.5, default: true }
```

Read back through `new Structure(stored)`:

| | Value |
|---|---|
| `rigSlot1`, `rigSlot2` | `0`, `0` |
| `rigType` retained on the instance | `undefined` |
| `rigBonuses` | `{ material: 0, time: 0, cost: 0, value: 0 }` |
| `toDocument()` rig fields | `rigSlot1: 0, rigSlot2: 0` — no `rigType` |

Two things this measured that reading the code had not settled:

- `toDocument()` does not merely omit `rigType`; it writes zeros over it. The value is destroyed by
  the first save of that structure, not left behind beside the slots.
- `models.CustomStructure` still declares `RigType`, and `foldCustomStructures` decodes through that
  struct and `$set`s only `customStructures`, so the server-side fold preserved it. The stored copy
  survives until a reader opens and saves the row.

Which is why the conversion has to run before the Go field is removed: that field is the last copy.
