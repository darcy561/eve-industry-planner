# Custom structures form (`Components/Settings/Standard Layout/Custom Structures`)

Live SoT for describing and saving the four places a job is built in — manufacturing, reaction,
reprocessing and invention — on the Settings page. A saved market is a different kind of place
entirely and is not offered here — see [market-locations.md](./market-locations.md).

Reached from the Settings page (`routes/_protected/settings.jsx`), which mounts
[`settingsPage.jsx`](../../../frontend/src/Components/Settings/settingsPage.jsx) and its Standard
Layout frames.

## A structure is a row, described by a field map

A structure is a plain object rather than an instance of anything, read and changed through
[`Functions/Custom Structures/customStructure.js`](../../../frontend/src/Functions/Custom%20Structures/customStructure.js):
`structureFromDocument` builds one from a stored row or empty for a kind, `updateStructure` returns a
changed copy without mutating the one passed in, and `structureToDocument` says what it stores.

`fieldsForKind(jobType)` is the one table every one of those reads: which optional fields a kind
carries — `built` (structure type, system security, tax), `rigSlots`, `implant`, `systemID`. A field a
kind's entry does not name is left unset and left out of the stored document rather than written as a
zero, so a row keeps saying what its kind means. **Adding a kind is a row in this table**, not a new
class or a new form.

| Kind | Carries beyond name, id and default |
|------|--------------------------------------|
| Manufacturing, reaction | Structure type, system security, tax, two rig slots, system |
| Reprocessing | Structure type, system security, tax, two rig slots, implant |
| Invention | Structure type, system security, tax, two rig slots |

## Tax is a percentage, never a fraction

`2.5` on a structure means 2.5%; a consumer divides by 100 where it costs something.
[`Functions/Helper/coerceTaxPercentage.js`](../../../frontend/src/Functions/Helper/coerceTaxPercentage.js)
is the one place that settles a tax figure — a finite number, never below zero — so every kind clamps
the same way rather than restating the rule.

## One form, driven by the field map

`CustomStructuresForm` composes three pieces: `StructureKindSelection`, a radio group offering the
four build kinds; `StructureForm`, which renders a control for each field the selected kind's entry in
`fieldsForKind` carries; and `CurrentStructuresFrame`, listing what is already saved.

`structureFields.jsx` is the table `StructureForm` reads: each entry names which fields show it
(`shows`, tested against the same map `fieldsForKind` returns), its title, its description, and the
control that renders it — `StructureTypeSelect`, `SystemTypeSelect`, `RigTypeSelect`, `ImplantSelect`,
`VirtualisedSystemSearch` and `TaxPercentageTextField` are shared components the rest of the app also
uses. The map that decides what a row stores is the map that decides what the form asks for, so the
two cannot disagree.

Choosing a structure type or a system can apply a **requirement** — a preset naming the rest of a
real structure's fit, such as a system that only permits one structure type — which fills the fields
the preset names and leaves the rest as they were.

A structure needs a name: the form refuses to save one with nothing typed, or only whitespace, because
an unnamed row is indistinguishable from any other unnamed row in the pickers that offer it.

## Rig slots

A structure carries **two independent rig slots** rather than one combined rig, on every kind that
carries rigs. `Functions/Custom Structures/rigs.js` owns what a rig is:

- `getRigInfoFromID(jobType, id)` reads one rig out of its kind's table.
- `rigSlotBonuses(jobType, rigSlot1, rigSlot2)` takes, **independently per axis** (material, time,
  cost, value), the better of whatever the two slots give — a rig that cuts build time must not also
  have to beat the material bonus of the rig beside it. Only a rig flagged `appliesToAll` is counted;
  a rig naming a specific item family is skipped, because answering for one needs to know what is
  being built and this helper does not.
- `rigSlotLabel(jobType, rigSlot1, rigSlot2)` names both fitted rigs, the one that is fitted, or
  "None" when neither is — an empty slot is left unsaid rather than printed beside a rig.
- `rigsCompete(rig, otherSlotRigID)` says whether a rig conflicts with whatever the other slot holds:
  the same rig, or one named in the other's `relatedTo`.

[`Hooks/useRigSlots.js`](../../../frontend/src/Hooks/useRigSlots.js) is the one place the
rig-conflict rule is applied: choosing a rig that competes with the other slot clears the slot being
set and marks it with "Cannot have the same rig or related rigs in both slots", rather than silently
keeping the old value. Every editor offering two rig slots — this form, the Reprocessing page's
structure panel, and the dashboard watchlist's structure options — takes the hook's `slot1` / `slot2`
props rather than carrying its own copy of the rule.

## What a job setup takes from a saved structure

[`Functions/Custom Structures/customStructureSetup.js`](../../../frontend/src/Functions/Custom%20Structures/customStructureSetup.js)
is the one mapping between a saved structure and what a job setup stores about it:
`setupFieldsFromCustomStructure` reads a structure's rig slots, system, structure type and tax into
the fields a setup carries, guarding a kind that carries no rig slots to `0` rather than `undefined`.

Whether a setup's saved structure is still there is one predicate,
`setupHasOrphanedCustomStructure` — a setup naming no structure at all is never an orphan, only one
whose stored id no longer resolves is. `setupShowsManualStructureFields` is true whenever a setup
either names nothing or names a structure that has been deleted, and is what every screen showing or
editing a setup's structure fields reads to decide between the saved row and the manual ones.
`clearOrphanedCustomStructureOnSetups` clears a dangling reference in memory, keeping the fields the
setup was built with.

## What a screen reads

A surface wanting one kind's structures reads the whole saved array and filters on `jobType`, rather
than naming a lane — `CurrentStructuresFrame` and the structure picker
(`Styled Components/Select/customStructure.jsx`) both do this under `useMemo`, so an unrelated store
change does not wake either.

`getCustomStructureWithID`, `getDefaultCustomStructureWithJobType`, `addCustomStructure`,
`setDefaultCustomStructure` and `deleteCustomStructure`
(`Zustand/applicationSettings/structures.js`) are the one set of actions every screen reads or writes
a saved structure through. Setting a default, or removing a structure that was the default, scopes to
**that structure's own kind** — one array holds every kind, so an unscoped sweep would touch the
defaults of kinds the reader never asked about.

## Where every file lives

| Path | Holds |
|------|-------|
| `Functions/Custom Structures/customStructure.js` | `fieldsForKind`, `structureFromDocument`, `updateStructure`, `structureToDocument` |
| `Functions/Custom Structures/customStructuresFromServer.js` | Reading a settings document's structures, from either stored shape |
| `Functions/Custom Structures/rigs.js` | `getRigInfoFromID`, `rigSlotBonuses`, `rigSlotLabel`, `rigsCompete` |
| `Functions/Custom Structures/getStructureInfo.js` | Structure type, system security and implant lookups |
| `Functions/Custom Structures/customStructureSetup.js` | `setupFieldsFromCustomStructure`, `setupHasOrphanedCustomStructure`, `setupShowsManualStructureFields`, `clearOrphanedCustomStructureOnSetups` |
| `Functions/Custom Structures/addCustomStructure.js` | Saving a new structure: the system index it needs, and the one save-succeeded announcement |
| `Functions/Helper/coerceTaxPercentage.js` | The tax percentage rule |
| `Hooks/useRigSlots.js` | The rig-conflict rule, shared by every editor offering two rig slots |
| `Zustand/applicationSettings/structures.js` | `getCustomStructureWithID`, `getDefaultCustomStructureWithJobType`, `addCustomStructure`, `setDefaultCustomStructure`, `deleteCustomStructure` |
| `Components/Settings/Standard Layout/Custom Structures/CustomStructuresForm.jsx` | The tab: kind picker, form, saved list |
| `.../structureKindSelection.jsx` | The four build kinds a reader can save here |
| `.../structureForm.jsx` | The form, driven by the field map |
| `.../structureFields.jsx` | The table naming each field, its control, and when it shows |
| `.../currentStructures.jsx` | What is already saved, filtered to the selected kind |

## Topic-only detail

The stored shape, the decode-time fold and the accessors that read it without knowing a row's kind →
[backend/shared/custom-structures.md](../../backend/shared/custom-structures.md).
