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

## The three build forms, before the surface redesign (2026-09-20)

Measured before deciding whether a market kind gets its own form. Line counts are whole files under
`Components/Settings/Standard Layout/Custom Structures/`.

| File | Lines | Fields beyond the shared set |
|---|---|---|
| `structureSelection.jsx` | 322 | `systemID` |
| `reprocessingStructureSelection.jsx` | 251 | `implant` |
| `inventionStructureSelection.jsx` | 230 | none |

The shared set is the same in all three: name, structure type, system security, two rig slots, tax.
So 803 lines describe one form plus two optional fields, and `CustomStructuresForm` picks between
them with a nested ternary on the job type.

Every field already has a shared component — `StructureTypeSelect`, `SystemTypeSelect`,
`RigTypeSelect`, `ImplantSelect`, `VirtualisedSystemSearch` — so what the three files hold is wiring,
not widgets.

The market kinds share almost none of it: no rigs, no structure type, no security, and a broker fee
where the build kinds have a tax. That is what decided one field-map-driven form over a build form
and a market form — the two families differ no more from each other than reprocessing differs from
invention, and a second form would have had to agree with the first about name, default and delete.

## Resolving a station's region from ESI (2026-09-20)

Checked live against Tranquility while deciding whether a saved NPC station needs a region picker.

| Call | Input | Answers |
|---|---|---|
| `/universe/stations/{id}` | 60003760 | `system_id` 30000142, plus `race_id` and `owner` the fee already reads |
| `/universe/systems/{id}` | 30000142 | `constellation_id` 20000020 |
| `/universe/constellations/{id}` | 20000020 | `region_id` 10000002 |

Region 10000002 is The Forge, which is Jita's, so the chain resolves correctly end to end. All three
are public and unauthenticated.

`POST /universe/ids/` was checked as a way for a reader to name a station: it resolved
`"Jita IV - Moon 4 - Caldari Navy Assembly Plant"` to 60003760 and returned **nothing** for
`"Amarr VIII (Oris) - Emperor Family Academy"` in the same request, so it wants the exact in-game
string and fails silently on a near miss. That is what rules it out as the reader's input, not
whether it works.

## What a market picker can be built from (2026-09-20)

| Need | Component | Already used by |
|---|---|---|
| Name a place | `VirtualisedLocationSearch` + `useAssetLocations` | the default asset location on this same settings page |
| Access character | `AssignUsersSelect` | the Returns panel, naming a seller |
| Broker fee | `TaxPercentageTextField` | every build kind's tax |
| System | `VirtualisedSystemSearch` | manufacturing and reaction |

`locationOptions` in `Functions/Assets/assetTree.js` applies no location-kind filter, so the asset
places list carries stations and citadels alike — one source serves both market kinds.

Nothing new has to be built for the form. The region is derived from the chosen place through the
ESI chain above rather than asked for.

## The reprocessing page edits the saved structure (2026-09-27)

Measured while working out what a functional structure would change, by following what the
Reprocessing page holds rather than by reading a figure. The page seeds itself from the store and
then edits what it was given in place, so the row it edits is the row the store holds.

| Step | Site | What it does |
|---|---|---|
| Seed | `Components/Reprocessing/Hooks/useReprocessingReducer.js:125` | `getDefaultReprocessingStructure(jobTypes.reprocessing)` — which is `getDefaultCustomStructureWithJobType`, returning the row found in `applicationSettings.customStructures` itself |
| Edit | `Components/Reprocessing/reprocessingStructurePanel.jsx` | five handlers — structure type, security, both rig slots and the implant — making nine calls to `pageState.currentStructure.setStructureType`, `setSystemType`, `setRigSlot1`, `setRigSlot2` and `setImplant`, because each rig slot branches to clear or set. Each then re-wraps the same object to force a render |
| Persist | `Components/Reprocessing/reprocessingSettingsPanel.jsx:70` | `scheduleDebouncedApplicationSettingsSave()`, on the same page under the advanced view |

So a reader comparing yields under a different rig is editing their **saved** default reprocessing
structure, not a copy of it. Two consequences, of different weight:

- **Always.** The store's row now carries the tried values, so the Settings screen shows them and
  every reprocessing figure for the rest of the session is worked out under them.
- **Whenever the same visit also changes a reprocessing setting.** Prefer-compressed and the three
  multipliers sit on that same page and schedule a settings save, which writes the whole array through
  `toPersistPayload`. The tried fitting is then stored, and the structure the reader saved is gone.

**Choosing a structure from the dropdown is safe**, which is why this has not been obvious:
`reprocessingStructurePanel.jsx:202` wraps the match in `new Structure(matchedStructure)` and so edits
a copy. Only the structure the page opens with is shared, and that is the one most readers use.

`addCustomStructure` in `Zustand/applicationSettings/structures.js` has the same shape more mildly: it
calls `structure.setDefault(...)` on the object the form still holds in its own state, so for the
moment between the add and the form's reset, the store's row and the form's draft are one object.

Neither is a bug in a calculation. Both are the consequence of a mutable row being handed between a
store and a screen, which is what a copy-on-change model removes rather than patches.

## What holds a structure as an instance (2026-09-27)

Counted to size the conversion. `Classes/structure.js` is 284 lines, of which 116 are comment lines.

| Site | `new Structure` | Setter calls | Needs |
|---|---|---|---|
| `Functions/Helper/customStructuresFromServer.js` | 2 | — | the read function |
| `Zustand/applicationSettings/core.js` | 1 | — | `toDocument`; its three-way instance/object/passthrough branch collapses |
| `Zustand/applicationSettings/structures.js` | — | 3 | rows mapped anew rather than flagged in place |
| `Components/Settings/.../structureForm.jsx` | 8 | 12 | the update function |
| `Components/Settings/.../useRigSlots.js` | — | 2 | returns the changed row |
| `Components/Reprocessing/reprocessingStructurePanel.jsx` | 10 | 9 | the update function, across five handlers |
| `Components/Reprocessing/Hooks/useReprocessingReducer.js` | 1 | — | a copy at the seed |
| `Classes/reprocessingItem.js` | 1 | — | the three bonus selectors |
| `Functions/Structure/addCustomStructure.js` | — | — | `fieldsForKind`, in place of `structure.fields?.systemID` |

**Two surfaces need nothing at all**, which is the measurement that says how far the field map already
carried this: `structureFields.jsx` reads plain fields and takes the kind's field entry as an
argument, and `currentStructures.jsx` reads `name`, `default`, the two rig slots and the system id
without ever calling a method.

`useReprocessingReducer.js` holds a second `new Structure` in a JSDoc `@example`, which is not a
construction site and is not counted.

Tests: 52 `new Structure` calls across five files — `Classes/structure.test.js` (35),
`Classes/reprocessing.test.js` (11), `Functions/Structure/addCustomStructure.test.js` (4),
`Functions/Reprocessing/toMinerals.test.js` (1) and the structure form's (1). Every one is a swap to
the read function; the class is nobody's oracle here, which is what made the job conversion's tests
the expensive part and does not apply to this one.
