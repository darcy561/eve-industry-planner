# Rig and structure attributes — behaviour overlay

How a rig's and a structure's own facts work **after** each slice lands. Live docs remain the truth
wherever this file is silent; where it speaks, it wins for this project's in-flight work.

Sections are written as their slice lands, not in advance — an overlay describing work that has not
happened is a plan, and the plan is [plan.md](./plan.md).

## Stage A — Every rig carries its own security multipliers

**Landed.** A rig row carries `security`, a map from the security band its job type names to the
multiplier that rig gives in that band. Manufacturing's standard rigs carry `1 / 1.9 / 2.1`, the
Thukker rig carries `0.1 / 1.9 / 0.1`, reaction rigs carry `1 / 1.1` over their two bands, and
reprocessing rigs carry `1 / 1.06 / 1.12`. A rig that names no band gives its bonus unscaled.

Invention rigs carry no map: they bonus `cost` and `time`, neither of which any band scales, and
`inventionSystem`'s `value` was read by nothing. A rig row's map covers exactly the bands its kind's
system table names, which a test asserts for every rig on a scaled axis.

`rigSlotBonuses(jobType, rigSlot1, rigSlot2, systemTypeID)` applies each rig's own multiplier to the
**material** axis before taking the better of the two slots, so the winner is the rig that actually
gives more in that band rather than the one with the larger printed figure. Time, cost and value are
returned unscaled, which is what they were before. `rigSecurityMultiplier(rig, systemTypeID)` reads
one rig's figure for callers that need the multiplier rather than the product.

The system tables no longer carry a `value`. `manSystem`, `reactionSystem`, `inventionSystem` and
`reprocessingSystem` name their bands and nothing else; the figure they used to hold was the standard
rig's multiplier.

The manufacturing and reaction material formulas take a rig figure already scaled to the band, so
`manufacturingFormulaCalculation` and `reactionFormulaCalculation` no longer take a system modifier
at all. Reprocessing keeps its multiplier separate, because there it scales the whole yield rather
than the rig's own contribution: `rigSecurityFor(structure, itemType)` gives the multiplier belonging
to the rig that won the item type, and the yield formula applies it only when a rig is fitted.

`requirements[1]` is gone, and with it the rig axis of `Setup.gatherRequirements`. Fitting the
Thukker rig no longer clears the second rig slot — that was requirement 1 stamping `rigSlot2: 0`, and
the rig-conflict rule already refuses the rigs it genuinely competes with.

Stored `materialCount` for a setup naming rig 9 holds a figure calculated under the old rule until its
job is next opened, when `Functions/JobPlanner/correctSetupFigures.js` corrects it.

## Stage B — A constraint is declared where it is read

**Landed, together with Stage C.** The two constraint entries are one declared list,
`placeConstraints` in `Context/defaultValues.jsx`. Each entry says which choices put a setup under it
(`when`, any one of which is enough), what it then fixes (`forces`), what figures the place supplies
(`values`), and which of those hold only for a character flying for a named militia
(`enlistedValues`). `requirements` and `systemStructureRequirements` are both gone, and so is the
second implementation that lived in the Custom Structures form.

`Functions/Industry Facilities/placeConstraints.js` is the one reader. `constraintsFor` answers which
rules a setup is under; `forcedFieldsFor` merges what they fix, a later rule winning a field an
earlier one also fixes; `settledFieldFor` reads one field through that; `enlistedValuesFor` hands back
the figures a place gives only to a character flying for a militia it names; `offerableOptions` drops
the entries a table keeps only so stored data still reads; `allowedOptionsFor` narrows a field to the
fixed value where one is fixed; and `jobTypesAllowedIn` says which kinds of job a system takes.

More than one rule can be in force at once. A manufacturing setup in Zarzakh that names an NPC
station is under both, and resolves to The Fulcrum — which is right, because The Fulcrum is the only
industry facility in the system. A structure is read through the same rules by translating it into a
setup's vocabulary with `setupFieldsFromCustomStructure`, and written back with
`customStructureFieldsFromSetup`.

Every picker reads it, in the Custom Structures form and in the Edit Job setup editor alike. The
structure, security-band and both rig fields take the options they may offer; the system search offers
only the systems that allow the kind of job being planned. At an NPC
station and at The Fulcrum the rig fields offer `None` and nothing else, because neither place takes
rigs. A field the rules fix cannot be moved off that value.

A reader picks from the three bands ESI names. Zarzakh stays in `manSystem` marked `legacy`, so a
setup that still names it resolves and displays, and no picker offers it; The Fulcrum fixes the band
it is read in. Nothing is lost by that, because no rig can be fitted in Zarzakh and the band only
scales a rig.

The facility tax is one of the fields a place fixes rather than a figure stamped onto the setup, so
the tax field is shown but not editable where a place supplies one, and changing the declared figure
changes what every affected setup calculates without touching a stored document. The install-cost
estimate reads the structure, the system and the tax through the rules, so a setup switched to an NPC
station is charged that station's tax whatever it stored.

A setup's SCC surcharge is reduced by the figure The Fulcrum supplies to a character flying for the
Angel Cartel or the Guristas. The militia is the character's own, read from `faction_id` on the public
character data `Classes/character.js` already fetches; a setup may name a different one in
`enlistedFaction` when the reader is estimating rather than recording. Nothing server-side stores or
acts on it.

## Setups are brought back into step when a job is opened

**Landed.** `Functions/JobPlanner/correctSetupFigures.js` walks a job's setups as it opens and
replaces any stored figure that no longer agrees with what it is worked out from, returning which
figures on which setups it corrected. It runs in `useEditJobInitialState`, beside the sweep that
clears a reference to a custom structure that is gone.

It holds one list of the figures a setup works out from its own choices — today `materialCount` —
each saying how to work the figure out again and how to tell whether the stored one still agrees, so
a figure that drifts under a changed calculation rule is corrected and anything a setup comes to
derive later is one more entry. A setup whose figures already agree is left untouched rather than
rewritten.

The job's recipe is out of its reach. `rawData` is the blueprint as it stood when the job was built,
and a job keeps that blueprint for life; only a newly created job is built from the current one. The
setup's `rawTime` is copied from that snapshot and is never corrected against it.

## The release steps this project adds

**Landed.** `clear the system left on a setup that moved off The Fulcrum` unsets `systemID` on every
stored setup naming Zarzakh whose structure is not The Fulcrum, across job documents, jobs, archived
jobs and group template payloads. Choosing The Fulcrum wrote that system onto a setup and choosing
anything afterwards never took it back, so the leftover is on live already; the declared rules read a
setup naming that system as being at The Fulcrum, which is right for a job really there and wrong for
one carrying the leftover.

It runs after `reshape every job document` and after `fold rig slots onto every setup`, which is
pinned by a test over the step registry rather than left to the comment beside it. It is idempotent,
and a setup still at The Fulcrum keeps its system.

## Stage C — The setup stops storing what the game decides

**Landed, together with Stage B.** `Setup` no longer carries `manageRequirements`,
`applyRequirements`, `removeRequirements`, `getObjectRequirements`, `getSystemIDRequirements` or
`gatherRequirements`. `updateStructureID`, `updateRigSlot`, `updateSystemType` and `updateSystemID`
set the field they were given and nothing else — what a place fixes is applied where it is read.

`appliedRequirementID` is gone from the setup, from `toDocument`, and from `models.JobSetup` in Go.
The setup gained `enlistedFaction`, a nullable militia id, in both languages.

## Stage D — The real rigs, scoped to the structure they fit

**Landed.** The SDE build publishes `industryBonuses.json`: every rig and structure the game gives an
industry bonus for, each with the families that bonus reaches, the security multipliers it scales by,
the structure size it fits and the group two of them compete through. A bonus names its own activity,
so a source bonusing several keeps them apart. The kind — `structure`, `rig` or `outpostRig` — is read
from the type's category, and all three are published so the SPA narrows rather than the build
deciding.

A figure is reached two ways, because the game publishes it two ways: a type either carries the
attribute the industry tables name, which is how Raitaru, Azbel and Sotiyo carry theirs, or reaches it
through one of its own dogma effects, which is how two rigs naming one figure read different
attributes. Reprocessing rigs are published differently again, as a `refiningYieldMultiplier` on the
type rather than through the industry tables, and are catalogued from that.

`Functions/Industry Facilities/industryBonuses.js` is the SPA's reader: whether an item is in a family,
whether a bonus reaches it, the best figure a source gives it on one axis, and the rigs that fit a
structure's size. `Hooks/Static/useIndustryBonuses.js` fetches the file for a screen;
`readIndustryBonuses` answers a calculation that cannot wait, from the last payload read.

`getRigInfoFromID` answers from the app's own table first and the published catalogue second, so a
setup naming either resolves. `rigSlotBonuses` takes the band and the item being built, and a rig
gives its flat figure where it is one of the app's own and its published figure for the family that
item is in otherwise. `rigsCompete` refuses two rigs of one published group, which is the game's own
one-per-group rule and what `relatedTo` alone could not reach.

A structure's bonus goes through the same filter: published where the game publishes it, its own
declared scope where the app declares one, and its flat figure otherwise. The Fulcrum is the first
with a scope — **6%** material rather than the 1.06% the table held, for sub-capital Angel Cartel and
Guristas hulls only.

Every rig field in the app is `Styled Components/autocomplete/virtualisedRigSearch.jsx`, offering the
rigs that fit the structure's size with each option saying which families it helps. Grouping them
under family headings was tried and does not compose with a virtualised listbox, which measures a flat
list of rows. A rig a setup already names is always offered even when it would not be, so a legacy rig
still shows. `Styled Components/Select/rigType.jsx` is gone.

Stored figures move for a setup at The Fulcrum, and are corrected when its job is next opened. The
correction refuses to run at all until the published bonuses have arrived, because a figure rebuilt
without them would be wrong in a new way.

## Stage E — A factional warfare system carries its cost effect

**Landed.** A system held by a militia lowers the cost of industry in its own NPC stations by 10% per
upgrade level, to -50% at level 5, and only for a character flying for the faction that holds it.

**Which faction holds a system rides in beside its cost index.** `esitypes.SystemIndexes` carries
`militiaFactionID`, the API's `SystemIndexesHandler` fills it from `DatasetMilitiaSystems`, and the
worker refreshes that dataset from ESI's `/fw/systems/` on the hour. The SPA's
`fetchSystemIndexes` already passes each system's payload through whole, so the flag reaches
`worldData.systemIndexes` with no new plumbing and no second request.

`Functions/Industry Facilities/enlistedFaction.js` owns the militia vocabulary:
`enlistedFactionForSetup` says which militia a setup is costed against — the one it names, or the one
its character flies for; `militiaHolding` says which faction holds a system; `systemTakesAnUpgradeLevel`
says whether a reader may state a level for it; and `militiasThatMatterFor` lists every militia that
would change what this setup costs, being the ones its place gives figures to plus the one holding its
system. `militiaDiscount.js` is left with the discount alone, so the two modules point one way.

**The level is stored on the setup**, as `militiaUpgradeLevel`, because ESI publishes ownership,
contested state and victory points but no level. It is clamped to 0–5 on the way in.

`installCosts.js` applies it as `(1 - militiaDiscount)` on the index-derived term — the same term a
structure's `cost` bonus reduces — rather than as a new term or a changed index.

**Two controls appear in the setup editor and only where they can matter.** An *Enlisted Militia*
select offers the militias `militiasThatMatterFor` names, and a *System Upgrade Level* select appears
beside it where a militia holds the system. A setup in an ordinary system under no constraint shows
neither. The militia names are resolved by `useLocationNames`, the app's own id-to-name cache, so a
faction named on one screen is named on the next.

## The setup editor offers both rig slots

The Edit Job setup editor offered a field for `rigSlot1` only, so the second slot a structure carries
could be set from the watchlist dialogue and the Custom Structures form but not from the page the job
is planned on. It now uses `Hooks/useRigSlots` like those two surfaces do, offering *Rig 1* and *Rig 2*
and refusing a rig that competes with the one in the other slot.

Its layout is flexbox — a wrapping `Stack` of fields — rather than MUI `Grid`.

## A surface shows what the place settled, not what the reader last chose

A setup does not store what a place fixes — Stage C's rule is that it is applied where it is read — so
a surface that displayed a setup's raw fields showed figures the calculations were not using. Choosing
The Fulcrum narrowed the security band picker to the one band it allows while the picker's own value
was still the band the setup came from, so it rendered empty; the system, the tax and the rig slots all
kept showing what they held before.

`settledSetup(setup)` in `placeConstraints.js` is the one answer to that: a setup with every field its
constraints fix laid over what it carries. It is what a surface displays, and it reads the same way
`settledFieldFor` does for a single field, so a control and the figure beneath it can no longer
disagree.

Four surfaces display a setup and all four use it — the Edit Job setup editor, the Planning stage's
setup card, the Purchasing stage's setup information, and the watchlist dialogue's options. The two
editors also disable the controls a place fixes, so a reader is not offered a choice that would be
read back as something else; `TaxPercentageTextField` already took a `disabled` for exactly this, and
the rig and system autocompletes now do too.

The watchlist dialogue additionally narrows its structure and security band pickers through
`allowedOptionsFor`, which it had never done — it was offering combinations the place does not allow.

## A place can always be left again

The Fulcrum's constraint was a one-way door. Its `when` names three routes in — the structure, the
system and the Zarzakh security band — and its `forces` sets all three, so whichever a reader changed
was immediately put back by the other two, and the structure picker narrowed to the single entry that
had trapped them. Choosing The Fulcrum meant never choosing anything else.

Two rules answer it, and a place now releases whatever it decided as soon as a reader says they want
something else:

- **`fieldsReleasedBy(setup, field, value)`** names the fields a place stops deciding once this choice
  takes the setup out of it. A reader who sets a field to something other than what a place in force
  fixes it to is saying they do not want that place, so every other field that place forced is let go
  — back to the values a fresh setup carries, through `Setup.releaseFields`. Picking a different
  structure at The Fulcrum lets go of Zarzakh; picking a different system lets go of the structure.
- **`allowedOptionsFor` does not narrow the field a setup came in by.** The `when` entry currently
  matching is the reader's handle, so that picker keeps its full list while the rest stay narrowed.
  At The Fulcrum the structure picker offers all five structures and the security band still offers
  only High Sec, which is the band Zarzakh is.

Both editors of a setup follow it — the Edit Job setup editor and the Settings page's Custom
Structures form, which releases to `blankStructure`'s values for the kind being described.

The rules are general rather than written for Zarzakh: any future place that fixes a field a reader
can also choose is escapable by the same two moves, and needs nothing declared beyond its `when` and
`forces`.

## Where these modules live

The modules this project added or rewrote were accumulating in
`Functions/Custom Structures/`, which owns the structures a reader saves for themselves — not what
the game says about the place a job runs in. They now sit in **`Functions/Industry Facilities/`**:

| Module | What it knows |
|--------|---------------|
| `rigs.js` | A rig: reading one by id from either table, what two fitted rigs give, whether they compete |
| `industryBonuses.js` | The published catalogue: families, which items a bonus reaches, what a source gives one, what a rig field offers |
| `structureBonusForItem.js` | What a structure gives the item being built |
| `placeConstraints.js` | Where a job may run, what that place fixes, and what each picker may offer |
| `enlistedFaction.js` | Which militia a setup is costed against |
| `getStructureInfo.js` | Reading a structure, system band or implant out of the tables its kind keeps |

`Functions/Custom Structures/` keeps only the reader's own structures — building one, storing one,
reading them back from the server, and what a setup takes from one.

`Functions/Reprocessing/structureBonuses.js` is renamed `reprocessingBonuses.js`, which says the
subject it belongs to and stops it reading as a sibling of `structureBonusForItem.js`.

**Live documentation names the old paths**, in `frontend/settings/custom-structures.md`,
`frontend/reprocessing/structure-panel.md`, `testing/frontend/settings.md` and
`testing/frontend/reprocessing.md`. Those are corrected on promote, not before.
