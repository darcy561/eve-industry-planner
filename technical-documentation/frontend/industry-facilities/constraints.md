# Where a job may run (`Functions/Industry Facilities/placeConstraints.js`)

Live SoT for what a place — The Fulcrum, an NPC station — fixes about a setup or a saved structure
built there, and for the factional warfare cost effect a setup's enlistment can unlock. Package:
[`Functions/Industry Facilities`](../../../frontend/src/Functions/Industry%20Facilities). Links below
are relative to this file's own folder once it lands under `frontend/industry-facilities/`.

What a rig or a structure gives is [bonuses.md](./bonuses.md). The saved-structure shape and field map
are [../settings/custom-structures.md](../settings/custom-structures.md). Which faction holds a system
in factional warfare rides in beside that system's cost index, delivered server-side →
[../../backend/worker/system-indexes.md](../../backend/worker/system-indexes.md).

## A place is declared once, and read where it matters

`placeConstraints` is one declared list, each entry naming a place a setup or a saved structure can be
at:

```
{ id, label, jobTypes, when, forces, enlistedValues? }
```

- **`when`** is a list of ways a setup can already be read as being at this place — The Fulcrum fires on
  naming its structure, naming Zarzakh as its system, or naming Zarzakh's legacy security band, since a
  setup built before the band was retired can still say so any of the three ways.
- **`jobTypes`** limits a place to the kinds of job it takes; `null` means every kind. The Fulcrum takes
  manufacturing only; an NPC station takes every kind.
- **`forces`** is what the place fixes: a field a place forces cannot be changed out from under it by a
  reader, and is applied wherever the field is read rather than written onto the setup. An NPC station
  fixes both rig slots to none and the tax to 0.25%; The Fulcrum fixes its structure, its security band,
  both rig slots and the tax together.
- **`enlistedValues`** names figures a place gives only to a character flying for one of the factions it
  lists — The Fulcrum reduces the SCC surcharge by 90% for the Angel Cartel or Guristas militias, and
  names nothing for anyone else.

`constraintsFor(setup)` answers which places are in force for a setup or a structure, in declared
order. `forcedFieldsFor(setup)` merges what they fix, a later place winning a field an earlier one also
fixes. `settledFieldFor(setup, field, own)` reads one field through that — the fixed value where one
applies, else the setup's own. `enlistedValuesFor(setup, enlistedFaction)` hands back the figures a
place gives only to that militia. More than one place can be in force at once: a manufacturing setup in
Zarzakh naming an NPC station is under both, and resolves to The Fulcrum, because it is the only
industry facility in the system.

## What a surface displays

`settledSetup(setup)` is a setup with every field its places fix laid over what it carries. A surface
displaying a setup shows that rather than the raw fields, so the control a reader looks at and the
figure calculated beneath it can never disagree — choosing a place that fixes the security band, the
system, the tax or the rig slots is reflected in those controls at once, although nothing was written
to the setup.

Four surfaces display a setup and all four read it this way: the Edit Job setup editor, the Planning
stage's setup card, the Purchasing stage's setup information, and the watchlist dialogue's options.
The two that edit also disable the controls a place fixes, so a reader is not offered a choice that
would be read back as something else.

## Driving what a picker offers

`offerableOptions(table)` is every entry in one of the option tables — structure types, security bands,
rig tables — less an entry kept only so a stored value still reads, such as Zarzakh's `legacy` security
band. `allowedOptionsFor(setup, field, candidates)` narrows that further to the one value a place fixes,
where one does; otherwise every candidate is offered. `jobTypesAllowedIn(systemID)` names the kinds of
job a system takes, or `null` for a system no place names, which is every system search reads before
letting a reader choose one for a kind that system does not allow.

**A place can always be left again.** `allowedOptionsFor` does not narrow the field a setup came into
a place by — the `when` entry currently matching is the reader's handle, so that picker keeps its full
list while the rest stay narrowed. Changing a field to something other than what a place in force
fixes it to says the reader does not want that place, and `fieldsReleasedBy(setup, field, value)`
names every other field it was deciding so the caller can let them go, back to the values a fresh
setup or structure carries. At The Fulcrum the structure picker offers all five structures and the
security band offers only Null Sec / WH, which is the band Zarzakh is; picking another structure lets
go of Zarzakh, and picking another system lets go of the structure.

**Filtering never hides a value already chosen.** It decides what a reader may pick next, never what a
saved setup is allowed to say — a legacy rig, a structure built as a workaround, or a stray field left
by an old choice keeps displaying its real value rather than rendering blank. The system search is the
one field that says why a choice is missing rather than simply omitting it: Zarzakh still resolves and
displays on a setup that already names it, but is not offered to a new one, because no rig can be fitted
there and nothing else about the system is special once that is known.

## A structure's stored fields are read through the same rules

`setupFieldsFromCustomStructure` and `customStructureFieldsFromSetup`
(`Functions/Custom Structures/customStructureSetup.js`) translate a saved structure into a setup's own
field names and back, so a structure being described on the Settings page is checked against exactly
the same `placeConstraints` a setup runs through — a reader building a structure at The Fulcrum sees the
same forced fields and the same picker filtering a setup built there would.

## The militia a setup is costed against

`enlistedFactionForSetup(setup)` (`enlistedFaction.js`) answers which militia a setup is costed
against: the one it names in its own `enlistedFaction`, when set, or otherwise the one the setup's
character flies for, read from that character's own `faction_id`. A setup's override is meant for
estimating a build for a faction the reader is not yet flying, and is only ever stored when it differs
from the character's own.

`militiaHolding(systemID)` names the faction holding a system in factional warfare, from the
`militiaFactionID` carried on that system's cost index payload — zero for a system no militia holds.
`systemTakesAnUpgradeLevel(setup)` is true whenever a setup's system is held by a militia.
`militiasThatMatterFor(setup)` lists every militia that could change what a setup costs: the ones the
place it is in gives figures to (The Fulcrum's pirate militias), plus the one holding its system, so a
reader is offered exactly the choices that could matter and nothing else.

## A factional warfare system lowers install cost in its own NPC stations

A system a militia holds and has upgraded lowers the cost of industry in that system's NPC stations by
10% per upgrade level, to a maximum of 50% off at level 5 — and only for a character flying for the
faction that holds it. ESI publishes ownership, contested state and victory points for a factional
warfare system, but never an upgrade level, so a reader states one directly: a setup carries
`militiaUpgradeLevel`, clamped to 0–5, alongside its enlistment. `militiaDiscount.js` turns a setup's
own level into the fraction its own faction's discount is worth, and is the only place that does —
`enlistedFaction.js` answers *which* militia and *whether* a system takes a level at all, and stops
there.

`Functions/Installation Costs/installCosts.js` applies the discount as `(1 - militiaDiscount)` on the
same index-derived term a structure's own `cost` bonus reduces, rather than as a separate term or a
changed cost index — the discount and a structure's own reduction never apply to the same job, because
the discount only ever applies in an NPC station, where a structure gives none.

## Where every file lives

| Path | Holds |
|------|-------|
| `Functions/Industry Facilities/placeConstraints.js` | `constraintsFor`, `forcedFieldsFor`, `settledFieldFor`, `settledSetup`, `fieldsReleasedBy`, `enlistedValuesFor`, `offerableOptions`, `allowedOptionsFor`, `jobTypesAllowedIn` |
| `Functions/Industry Facilities/enlistedFaction.js` | `enlistedFactionForSetup`, `militiaHolding`, `systemTakesAnUpgradeLevel`, `militiasThatMatterFor` |
| `Functions/Industry Facilities/militiaDiscount.js` | Turning a setup's militia upgrade level into its cost discount |
| `Classes/character.js` | Keeping a character's own `faction_id` from the character ESI already fetches |
| `Functions/Installation Costs/installCosts.js` | Applying the militia discount and every other install-cost term |

## Topic-only detail

What a rig or a structure gives on the figures a place's forced fields feed into →
[bonuses.md](./bonuses.md). The saved-structure shape a place's forced fields are translated against →
[../settings/custom-structures.md](../settings/custom-structures.md). A setup's own stored fields —
`enlistedFaction`, `militiaUpgradeLevel`, and everything else a job document carries — are not this
file's to describe.
