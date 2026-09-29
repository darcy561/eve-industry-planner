# Stage D — The real rigs, scoped to the structure they fit

**Depends on:** [Stage B](./stage-b-declared-constraints.md) for the picker filtering, and on the SDE
build carrying two more files. **Moves stored figures:** yes — The Fulcrum's `materialCount`.

## What is wrong

The app models five manufacturing rigs, labelled `T1 - ME - All`, `T2 - ME - All`, `T1 - TE - All`,
`T2 - TE - All` and `Faction - ME - All`. The game has roughly sixty, each helping one family of
items. Every one of the app's fifteen manufacturing, reaction and invention rigs carries
`appliesToAll`, and `rigSlotBonuses` counts a rig only when that flag is set.

`manRigs[9]` — `Faction - ME - All` — is the Thukker Advanced Component rig. It helps `Components` and
`Advanced Capital Components` and nothing else, yet the app grants its 3.7% to every manufacturing
job. It also has two material figures in the game, `-2.0` and `-3.7`, where the app models one.

The same hole exists on structures, and worse. The Fulcrum's bonuses apply only to sub-capital Angel
Cartel and Guristas ships, and `getStructureData` returns a structure's figure with no notion of what
is being built. Its stored material figure is also wrong: a citadel's flat `1` and The Fulcrum's
bonus are the same kind of figure, read as a percentage, and The Fulcrum's is **6%**, not the `1.06`
the table holds.

Readings: [measurements.md](../measurements.md) § What the SDE says about rigs.

## The vocabulary is CCP's

`industryTargetFilters.jsonl` names eighteen families — Drones/Fighters, Equipment, Ships, Charges,
Small/Medium/Large T1 and T2 Ships, Capital Ships, Structures, Capital Components, Components,
Advanced Capital Components, and the three reaction families. `industryModifierSources.jsonl` ties
each rig type to the activity, the axis, the dogma attribute carrying the figure, and the filter it
applies to — 118 manufacturing-material sources.

Do not invent a vocabulary beside it.

## Steps

1. **Carry the two files into the SDE build.** Add `industryTargetFilters.jsonl` and
   `industryModifierSources.jsonl` to
   [`map_build_fields.go`](../../../../services/worker/tasks/sde/update/map_build_fields.go).
   `groups.jsonl` with `categoryID` is already ingested; resolving a filter against the item being
   built also needs the product's group and category to reach the SPA.
2. **Generate the rig tables** from the SDE rather than hand-writing them. Five handmade rows become
   roughly 125 real rig types with real figures and real filters, which is static data, not a literal
   in `defaultValues.jsx`.
3. **Build one filter, for bonuses in general.** One place answers "does this bonus apply to the item
   in hand". A rig asks it; a structure asks it the same way. The SDE agrees this is the shape —
   Raitaru, Azbel and Sotiyo are modifier sources in their own right and simply carry no filter.
4. **Let the filter express a faction rule as well as a named family.** The Fulcrum's scope is not one
   of the eighteen: a type carries its own `factionID` (500011 Angel Cartel, 500010 Guristas Pirates),
   so its rule is that faction pair intersected with not-a-capital.
5. **Scope the picker by structure size.** `rigSize` is 2 on every M-Set, 3 on every L-Set and 4 on
   every XL-Set, mapping onto the Medium / Large / X-Large a setup already chooses. A reader picking
   Medium is offered M-Sets and nothing else.
6. **Label a rig by the part of its name that distinguishes it.** Drop both the
   `Standup M-Set` / `L-Set` / `XL-Set` prefix and the word `Manufacturing`, so
   `Standup L-Set Advanced Component Manufacturing Efficiency II` reads as
   `Advanced Component Efficiency II`. Derive the label in the SDE build, not in the SPA, so one place
   knows the rule and the reprocessing and reaction lists do not each grow a copy of it. The names
   stay unique within every size — 78 M-Set, 38 L-Set, 9 XL-Set, no collisions — and a reader only
   sees one size at a time. M-Sets split material from time and still say which; L and XL combine both
   and read as `Efficiency`.
7. **Teach `rigSlotBonuses` the item family**, while keeping `appliesToAll` honoured for anything that
   still carries it.
8. **Correct The Fulcrum**: `manStructure[4].material` becomes `6`, scoped by the filter to
   sub-capital Angel Cartel and Guristas hulls. The figure and the scope land together — `6` applied
   to everything would be further from the game than today's `1.06`.

## The legacy rigs

Manufacturing rigs have already been reorganised once: from a single combined rig slot to the **two
independent slots** that are landed, live behaviour
([frontend/settings/custom-structures.md](../../../frontend/settings/custom-structures.md) § Rig
slots). The `T1 - ME - All` entries are what that conversion produced, and they are the baseline every
stored setup now sits on. **That conversion is as far as a reader's stored structure information gets
reorganised.**

So the five generic rigs are **kept, still resolve, still display, and still apply to every item** —
that is how they have always worked and what every saved setup was costed against. They keep their
ids, keep `appliesToAll`, and are simply no longer offered for a new selection. Nothing is remapped,
nothing is deleted, nothing changes meaning. A stored `rigSlot1: 1` means "a T1 ME rig, family
unrecorded", and no mapping to a family-specific rig would be anything but invented.

**`relatedTo` is the part that will be got wrong.** The conflict rule is id-based. A new
`T1 - ME - Ships` must compete with the legacy `T1 - ME - All` as well as with the other new tiers, or
a reader fits a legacy generic in one slot and a new specific in the other and stacks two ME bonuses
the game would never allow. Every new rig lists the legacy ids it overlaps, and the legacy entries
gain the new ids in theirs. [`useRigSlots`](../../../../frontend/src/Hooks/useRigSlots.js) applies the
rule across all three editors, so it only needs fixing in the table.

**The picker needs a notion the app does not have**: in the table, resolvable, not offered.
`rigTypeMap` is read straight into the options today. The option list filters on something the row
carries, while `getRigInfoFromID` keeps returning it for display and calculation.

## The rig field becomes an autocomplete

A Medium structure offers 78 rigs, which a `Select` cannot carry: its menu cannot be typed into, so
the list can only be scrolled past rather than searched. The SPA already settled this —
[`Styled Components/autocomplete/`](../../../../frontend/src/Styled%20Components/autocomplete/) holds
`virtualisedSystemSearch`, `virtualisedLocationSearch` and `virtualisedRecipeSearch`, all built on
MUI's `Autocomplete` over `VirtualisedListbox`, which mounts only the rows in view.

The rig field becomes the fourth member of that family rather than a new pattern. It is proved on
`structureFields.jsx` first, which is where it has landed.

**All four call sites take it.** `structureFields.jsx` was first, then
`reprocessingStructurePanel.jsx`, `watchlistOptions.jsx` and `editJobSetup.jsx`;
`Styled Components/Select/rigType.jsx` is gone. Reprocessing's ten rigs come from
`refiningYieldMultiplier` rather than the industry tables (see
[measurements.md](../measurements.md) § Reprocessing rigs are published), and the ore kinds each
helps are read from its group through `reprocessingRigFamilies`.

Three things it carries that the existing three do not: each option **saying which families it
helps** — grouping was tried first and does not compose with a virtualised listbox, which measures a
flat list of rows and cannot see options nested under group headers; a rig **saying which families it affects**, since that is now the reason to
choose one over another; and it feeds `useRigSlots` unchanged — that hook already takes the chosen
entry as an object, which is what `Autocomplete` hands back where `Select` had to look the id up
again.

The smaller lists — 9 reprocessing, 4 reaction, 6 invention — move to the same component. One rig
field behaving the same way everywhere beats a select for short lists and an autocomplete for long
ones.

## What it inherits

Readers have been told by the form's own help text to create **a second custom structure** for items a
rig does not cover, so real structures exist that were built as a workaround. They keep working
untouched, because the generic rig they name still resolves. Stage D leaves them alone; it cannot tell
them apart from genuine second structures, and does not need to.

## Migration

Correcting The Fulcrum moves figures in both directions: a setup building one of those hulls gains the
bonus it should have had, and one building anything else loses the 1.06% it should never have had.

Add a release step to [`prepare_release.go`](../../../../services/core/commands/prepare_release.go)
recalculating `materialCount` for every stored setup naming The Fulcrum. It is separate from the
A–B–C cutover's step, because this stage ships after it.

Nothing else here migrates: the rig work is additive, the generic rigs keep their ids and their
behaviour, and no stored rig id is remapped.

## Tests

- A legacy rig still applies to an item it was never told about; a new family-specific rig does not.
- A new rig and the legacy generic it overlaps refuse to be fitted together.
- The picker offers only the sizes that fit, and still displays a fitted rig it would not offer.
- Label derivation, including the M-Set material/time split.
- The structure filter: The Fulcrum bonusing an Angel sub-capital and not bonusing anything else.

## Done when

- A rig names the family of items it helps, and is not counted for an item it does not.
- The Fulcrum gives 6% to sub-capital Angel and Guristas hulls and nothing to anything else, and
  every stored setup naming it has been recalculated.
- A structure filters its bonus by the same mechanism.
- The generic rigs still resolve, still display, still apply to everything, and are not offered.
- Every rig field in the app is the same autocomplete.
