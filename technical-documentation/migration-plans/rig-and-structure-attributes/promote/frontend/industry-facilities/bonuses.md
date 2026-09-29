# What a rig or structure gives (`Functions/Industry Facilities`)

Live SoT for what a rig helps, what a structure gives, and how the two combine on a fitted setup or a
saved structure. Package: [`Functions/Industry Facilities`](../../../frontend/src/Functions/Industry%20Facilities).
Links below are relative to this file's own folder once it lands under `frontend/industry-facilities/`.

Where a place may be used at all, and what it fixes about a setup that runs there, is
[constraints.md](./constraints.md). What the SPA holds a reader's own saved structure as, and the
rig-conflict rule every editor offering two rig slots shares, is
[../settings/custom-structures.md](../settings/custom-structures.md).

## A rig's own security multipliers

A rig carries a `security` map from the security band its job type names to the multiplier that rig
gives in that band — the way ESI publishes `hiSecModifier` / `lowSecModifier` / `nullSecModifier` on
the rig type itself, rather than on the system it is fitted in. Manufacturing's standard rigs carry
`1 / 1.9 / 2.1`, the faction rig carries `0.1 / 1.9 / 0.1`, reaction rigs carry `1 / 1.1` over their two
bands, and reprocessing rigs carry `1 / 1.06 / 1.12`. A rig that names no band — every invention rig —
gives its bonus unscaled, because nothing scales `cost` or `time` by a security band anywhere in the
app.

`rigSecurityMultiplier(rig, systemTypeID, jobType)` reads one rig's figure for the band a setup runs
in, falling back to the band's own id and then to `1` for a rig that carries no map. Only the
**material** axis is scaled by it; time, cost and value are read unscaled.

## What a fitted rig gives

`rigSlotBonuses(jobType, rigSlot1, rigSlot2, systemTypeID, itemID)` takes, independently per axis, the
better of whatever the two fitted rigs give once each rig's own security multiplier has been applied —
a rig that cuts build time must not also have to beat the material bonus of the rig beside it, and the
multiplier is applied **before** the two slots are compared, so the winner is the rig that actually
gives more in that band rather than the one with the larger printed figure.

What a rig gives on an axis depends on what it is:

- A rig flagged `appliesToAll` gives its own flat figure to anything being built — this is every
  rig the app declares by hand, kept for the setups already costed against them.
- A rig with no flag reads its figure from the published bonus catalogue below, for the family the
  item being built is in. A rig that helps nothing the item is in gives nothing.

`getRigInfoFromID(jobType, id)` resolves either kind by id: the app's own table first, the published
catalogue second, so a setup naming either resolves. `rigSlotLabel(jobType, rigSlot1, rigSlot2)` names
both fitted rigs, the one that is fitted, or "None" when neither is. `rigsCompete(rig, otherSlotRigID,
jobType)` refuses two rigs that would double up: the same rig, one it names in `relatedTo`, one of its
own published group, or — for a legacy rig and a published one — one that bonuses the axis the other
already claims to help with everything.

## The published bonus catalogue

`industryBonuses.js` reads the catalogue the SDE build publishes as the `INDUSTRY_BONUSES` static
file, fetched by [`Hooks/Static/useIndustryBonuses.js`](../../../frontend/src/Hooks/Static/useIndustryBonuses.js)
for a screen and read without a hook by `readIndustryBonuses()` for a calculation that cannot wait, from
the last payload the hook read. A screen or a calculation reading before the file has ever arrived gets
an empty catalogue (`{ families: {}, sources: {} }`) rather than `null`.

The catalogue names every rig, outpost rig and structure the game gives an industry bonus for:

- **`families`**, the eighteen item families the game scopes a bonus by — Drones/Fighters, Equipment,
  Ships, Charges, the sized T1/T2 ship families, Capital Ships, Structures, Capital Components,
  Components, Advanced Capital Components, and the three reaction families — each naming the group and
  category ids `itemInFamily` matches an item against.
- **`sources`**, keyed by type id, each naming its `kind` (`rig`, `outpostRig` or `structure`), the rig
  `size` it fits where it is a rig, and the `bonuses` it gives — one entry per activity and axis, each
  naming the family it is scoped to, or none for a bonus that reaches every item.

`readItemFamilyFacts(typeID)` reads an item's group, category and faction id from the static item
list, which is what a family or a structure's own scope is matched against. `bonusReachesItem` and
`itemInFamily` decide whether one bonus or one family covers an item; `sourceBonusFor(source, activity,
axis, item, families)` is the figure a rig or a structure gives on one axis, the best over every bonus
that reaches the item.

`rigsFittingSize(catalogue, activity, size)` lists the published rigs a structure of one size may fit,
for one kind of job; `familiesHelpedBy(rig, families)` names what a rig helps, or "Every item" for one
that names no family; `rigOptionsFor(catalogue, activity, size, fitted)` is what a rig field offers: no
rig, every published rig that fits, and the rig already fitted even where it would not otherwise be
offered — a legacy rig, or one for a structure size a reader has since changed.

## What a structure gives

`structureBonusForItem(structure, jobType, axis, itemID)` reads a structure's figure three ways, in
order: its **published** figure, where the structure names a catalogue entry through `publishedID`;
its own **declared scope**, where the app states one directly — the shape is `{ factions, exceptFamilies
}`, matched against the item's own faction id and family; or its flat figure otherwise, the way a
citadel's flat material bonus always has been. The Fulcrum is the one structure with a declared scope
today: **6%** material and **70%** time to sub-capital Angel Cartel and Guristas hulls, and nothing to
anything else — a capital hull built there, or a hull of any other faction, takes neither bonus.

`getStructureInfoFromID(jobType, id)`, `getSystemTypeFromID(jobType, id)` and `getImplantFromID(jobType,
id)` are the small lookups every other reader in this package goes through rather than reaching into
the tables directly — a structure type, a system security band, or an implant, by id and kind.

## The rig field is one autocomplete everywhere

Every rig field in the app is
[`Styled Components/autocomplete/virtualisedRigSearch.jsx`](../../../frontend/src/Styled%20Components/autocomplete/virtualisedRigSearch.jsx),
built like `virtualisedSystemSearch` and `virtualisedLocationSearch` on MUI's `Autocomplete` over
`VirtualisedListbox`, which mounts only the rows in view — the largest structure size offers around
eighty rigs, too many for a `Select` menu that cannot be typed into. Each option says which families it
helps, from `familiesHelpedBy`, because that is the reason to choose one over another once a rig no
longer helps everything; options are a flat list rather than grouped under family headings, because a
virtualised listbox measures rows and cannot see options nested under group headers. A rig already
fitted is always offered even where it would not otherwise be, so a legacy generic rig still shows
after being retired from new selections.

Every editor offering a rig field takes it the same way: the Settings page's Custom Structures form,
the Reprocessing page's structure panel, the dashboard watchlist's structure options, and the Edit Job
setup editor. `Styled Components/Select/rigType.jsx` no longer exists.

## The generic rigs stay, and keep their old meaning

The five rigs the app declares by hand — `T1 - ME - All`, `T2 - ME - All`, `T1 - TE - All`, `T2 - TE -
All`, and the faction rig — still resolve, still display, and still apply to every item, which is how
they have always worked and what every setup already costed against one was built on. They keep their
ids, keep `appliesToAll`, and are retired only from the picker: `offerableOptions(table)` drops an entry
carrying `legacy` (used for a security band) and, for a rig table, an entry no longer meant for a new
choice, while `getRigInfoFromID` keeps resolving it for display and calculation. A stored rig id is
never remapped to a family-specific one — a stored choice of `1` means "a T1 ME rig, family unrecorded",
and nothing here invents which family it must have meant.

## A setup's stored figures are kept in step

[`Functions/JobPlanner/correctSetupFigures.js`](../../../frontend/src/Functions/JobPlanner/correctSetupFigures.js)
walks a job's setups when the job is opened and replaces any stored figure that no longer agrees with
what it is worked out from now, returning which figures on which setups it corrected. It holds one list
of the figures a setup works out from its own choices — today `materialCount` — each with how to
rebuild it and how to tell whether the stored one still agrees; a setup whose figures already agree is
left untouched. It corrects nothing until the published bonus catalogue has arrived, because a figure
rebuilt without it would be wrong in a new way. The job's own recipe (`rawData`) is never corrected
against the current one — a job keeps the blueprint snapshot it was built from for life.

## Where every file lives

| Path | Holds |
|------|-------|
| `Functions/Industry Facilities/rigs.js` | `getRigInfoFromID`, `rigSecurityMultiplier`, `rigSlotBonuses`, `rigSlotLabel`, `rigsCompete` |
| `Functions/Industry Facilities/industryBonuses.js` | The published catalogue reader: `readIndustryBonuses`, `readItemFamilyFacts`, `itemInFamily`, `bonusReachesItem`, `sourceBonusFor`, `rigsFittingSize`, `familiesHelpedBy`, `rigOptionsFor` |
| `Functions/Industry Facilities/structureBonusForItem.js` | `structureBonusForItem` |
| `Functions/Industry Facilities/getStructureInfo.js` | `getStructureInfoFromID`, `getSystemTypeFromID`, `getImplantFromID` |
| `Functions/Static/industryBonuses.js` | Reading the `INDUSTRY_BONUSES` static file |
| `Hooks/Static/useIndustryBonuses.js` | `useIndustryBonuses` |
| `Functions/JobPlanner/correctSetupFigures.js` | Keeping a setup's derived figures in step when its job opens |
| `Styled Components/autocomplete/virtualisedRigSearch.jsx` | The one rig field, shared by every editor |

## Topic-only detail

Where a place may be used, what it fixes about a setup, and the militia a setup is costed against →
[constraints.md](./constraints.md). The saved-structure shape, the field map, and the rig-conflict rule
→ [../settings/custom-structures.md](../settings/custom-structures.md). What the game itself publishes
about a rig or a structure, read from the SDE build, is not repeated here — this file reads the SPA's
own copy of it.
