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
the same way rather than restating the rule. At a place that fixes its own tax — an NPC station, The
Fulcrum — the field is shown but disabled, and the figure it displays comes from the place rather than
whatever the row last stored; see
[../industry-facilities/constraints.md](../industry-facilities/constraints.md).

## One form, driven by the field map

`CustomStructuresForm` composes three pieces: `StructureKindSelection`, a radio group offering the
four build kinds; `StructureForm`, which renders a control for each field the selected kind's entry in
`fieldsForKind` carries; and `CurrentStructuresFrame`, listing what is already saved.

`structureFields.jsx` is the table `StructureForm` reads: each entry names which fields show it
(`shows`, tested against the same map `fieldsForKind` returns), its title, its description, and the
control that renders it — `StructureTypeSelect`, `SystemTypeSelect`, `VirtualisedRigSearch`,
`ImplantSelect`, `VirtualisedSystemSearch` and `TaxPercentageTextField` are shared components the rest
of the app also uses. The map that decides what a row stores is the map that decides what the form asks
for, so the two cannot disagree.

Every field the form offers is narrowed by the same declared rules a job setup runs through: a
structure being described as sitting at The Fulcrum or an NPC station offers only what that place
allows, and a field the place fixes cannot be moved off that value — see
[../industry-facilities/constraints.md](../industry-facilities/constraints.md) § A place is declared
once, and read where it matters. The system search refuses a system that does not allow the kind being
described.

A structure needs a name: the form refuses to save one with nothing typed, or only whitespace, because
an unnamed row is indistinguishable from any other unnamed row in the pickers that offer it.

## Rig slots

A structure carries **two independent rig slots** rather than one combined rig, on every kind that
carries rigs. What one rig gives, how two fitted rigs combine per axis, and which families a rig helps
are [../industry-facilities/bonuses.md](../industry-facilities/bonuses.md); this form reads that
through the same shared pieces every other rig-slot editor does:

- Every rig field here is `VirtualisedRigSearch`, offering the rigs that fit the chosen structure's
  size, each option saying which families it helps.
- [`Hooks/useRigSlots.js`](../../../frontend/src/Hooks/useRigSlots.js) is the one place the
  rig-conflict rule is applied: choosing a rig that competes with the other slot clears the slot being
  set and marks it with "Cannot have the same rig or related rigs in both slots", rather than silently
  keeping the old value. Every editor offering two rig slots — this form, the Reprocessing page's
  structure panel, the dashboard watchlist's structure options, and the Edit Job setup editor — takes
  the hook's `slot1` / `slot2` props rather than carrying its own copy of the rule.

## What a job setup takes from a saved structure

[`Functions/Custom Structures/customStructureSetup.js`](../../../frontend/src/Functions/Custom%20Structures/customStructureSetup.js)
is the one mapping between a saved structure and what a job setup stores about it:
`setupFieldsFromCustomStructure` reads a structure's rig slots, system, structure type and tax into
the fields a setup carries, guarding a kind that carries no rig slots to `0` rather than `undefined`;
`customStructureFieldsFromSetup` reads the other way, which is how this form applies what a place fixes
back onto the structure being described.

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
| `Functions/Custom Structures/customStructureSetup.js` | `setupFieldsFromCustomStructure`, `customStructureFieldsFromSetup`, `setupHasOrphanedCustomStructure`, `setupShowsManualStructureFields`, `clearOrphanedCustomStructureOnSetups` |
| `Functions/Custom Structures/addCustomStructure.js` | Saving a new structure: the system index it needs, and the one save-succeeded announcement |
| `Functions/Helper/coerceTaxPercentage.js` | The tax percentage rule |
| `Hooks/useRigSlots.js` | The rig-conflict rule, shared by every editor offering two rig slots |
| `Zustand/applicationSettings/structures.js` | `getCustomStructureWithID`, `getDefaultCustomStructureWithJobType`, `addCustomStructure`, `setDefaultCustomStructure`, `deleteCustomStructure` |
| `Components/Settings/Standard Layout/Custom Structures/CustomStructuresForm.jsx` | The tab: kind picker, form, saved list |
| `.../structureKindSelection.jsx` | The four build kinds a reader can save here |
| `.../structureForm.jsx` | The form, driven by the field map and the declared place rules |
| `.../structureFields.jsx` | The table naming each field, its control, and when it shows |
| `.../currentStructures.jsx` | What is already saved, filtered to the selected kind |

## Topic-only detail

What a rig or a structure gives, and the rig field's shared autocomplete →
[../industry-facilities/bonuses.md](../industry-facilities/bonuses.md). Where a place may be used and
what it fixes about a structure or a setup built there →
[../industry-facilities/constraints.md](../industry-facilities/constraints.md). The stored shape, the
decode-time fold and the accessors that read it without knowing a row's kind →
[backend/shared/custom-structures.md](../../backend/shared/custom-structures.md).
