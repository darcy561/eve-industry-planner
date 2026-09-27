# Reprocessing structure panel (`Components/Reprocessing/reprocessingStructurePanel.jsx`)

Live SoT for the structure the Reprocessing page tries yields under, and the panel that edits it. The
structure's own shape, the field map, and the rig-conflict rule this panel shares with every other
editor offering two rig slots are
[frontend/settings/custom-structures.md](../settings/custom-structures.md).

## The page opens on a copy of the saved default

`useReprocessingReducer` seeds `currentStructure` through
`structureFromDocument(getDefaultCustomStructureWithJobType(jobTypes.reprocessing))` — a fresh copy of
the reader's saved default reprocessing structure, not the row the settings store holds. The panel
edits that copy in place as the reader tries a different rig or structure type to compare yields, and
none of it reaches the settings store or the saved structure unless the reader explicitly picks a
different saved structure from the dropdown, which also reads a fresh copy.

A reader who has saved no reprocessing structure gets a blank one, expressed as the same
`structureFromDocument(undefined, jobTypes.reprocessing)` construction as the seed above — a copy of
nothing is what a blank structure already is.

## Editing the copy

Five controls change `currentStructure` through `updateStructure`, which is what keeps a name settled
and a tax clamped without every call site restating either rule: structure type, system security,
implant, and the two rig slots through `useRigSlots` — the same hook the Settings form and the
dashboard watchlist's structure options use, so a rig chosen here that competes with the other slot is
refused and marked the same way it is everywhere else.

Choosing a different saved structure from `CustomStructureSelect` reads it fresh with
`structureFromDocument`, replacing `currentStructure` outright rather than merging into it.

## Feeding reprocessing's own calculations

`Functions/Reprocessing/structureBonuses.js` is where a structure's rigs and structure type are read
against what is actually being reprocessed — ore, gas, ice or moon ore — which is reprocessing's own
question rather than the structure's:

- `rigBonusFor(structure, itemType)` takes the better of the two rig slots that `appliesTo` the item
  type being worked, or `0` for a kind that carries no rig slots at all.
- `structureBonusFor(structure, itemType)` reads the structure type's own ore or gas bonus for the
  item type, or `0` when the structure type gives none.

## Where every file lives

| Path | Holds |
|------|-------|
| `Components/Reprocessing/reprocessingStructurePanel.jsx` | The panel: structure type, security, implant, both rig slots, the saved-structure picker |
| `Components/Reprocessing/Hooks/useReprocessingReducer.js` | Seeding `currentStructure` as a copy of the saved default, or a blank one |
| `Functions/Reprocessing/structureBonuses.js` | `rigBonusFor`, `structureBonusFor` |

## Topic-only detail

The structure's stored shape, the field map, the rig-slot combining rule and the rig-conflict rule →
[frontend/settings/custom-structures.md](../settings/custom-structures.md).
