# Reprocessing rebuild — overlay

How reprocessing works **while this project is in flight**. Live docs remain the truth wherever this
file is silent; where it speaks, it wins for the in-flight work.

Each stage fills its section as it lands — what changed, and how that part works now. A section with
nothing under it means the stage has not landed and live behaviour is unchanged.

## The yield formula

*A1 settled; A2, A3 and A4 not yet.* The rounding rule is live's, held to live by a parity corpus — see
§ The engine. Gas decompression, the reprocessing tax and erratic ore await the in-game checks.

## The reprocessing static file

*Stage B landed in full.*

**What changed.** `reprocessingData.json` was one object keyed by type id. It is now
`{ "items": { … }, "materialVolumes": { … } }`:

- `items` is the item map as before, each entry gaining `volume` — the volume of one unit, from the
  SDE type, omitted when the SDE gives none.
- `materialVolumes` gives the volume of one unit of every material an item yields, keyed by type id,
  stated once rather than on every ore that yields it. A material the SDE gives no volume is left out.
  Empty, it is written `{}`.

**What goes in, and how it is labelled, is read from the SDE.** An item is a published type with a
market group and materials that either carries the `reprocessingSkillType` dogma attribute (790) or
sits in the Gas Clouds Materials branch. Its skill is that attribute; compressed gas, which has none,
takes Gas Decompression Efficiency. Its kind is read from its outputs first — several possible minerals
is **erratic** (6), one is an **unrefined mineral** (5) — and otherwise from the first of Standard Ores,
Moon Ores, Ice Ores or Gas Clouds Materials found walking its whole market ancestry.

**Random outputs are written as ranges.** An item the SDE gives `randomizedMaterials` carries them,
each mineral as `{ quantityMin, quantityMax }` per batch, and `"materials": {}`.

Against SDE build 3326071 the file holds 464 items — ore 285, moon ore 120, ice 24, gas 25, unrefined
minerals 8, erratic 2 — every one with a volume, and 62 material volumes. Against the hand-typed maps it
replaces: Tyranite and both Prismaticites take their real skills rather than Scrapmetal Processing, the
eight Unrefined minerals join, and Hiemal Tricarboxyl Vapor, which has no reprocessing skill, leaves.

**How it is read.** The worker builds it in `GenerateReprocessingDataOutput` as
`conversion.ReprocessingData`; the recipe diff stage's type-id collector reads `items`. In the SPA,
`Functions/Static/reprocessing.js` keeps the whole file, `readReprocessingItems()` still answers the
item map, the selection and by-name views read `items`, and `volumeOf(typeID)` answers an item's own
volume or a material's, `undefined` before the file arrives or for a type with none. Ore selection
admits ore, moon ore and ice only; erratic ore and unrefined minerals match a pasted name but yield
nothing on the current page until C2b. `reprocessingItemTypes.unrefinedOre` is now `unrefinedMineral`,
with `erratic` beside it, and `TestSPAAndServerAgreeOnTheReprocessingKinds` holds the two numberings
together.

**When it reaches a reader.** Published by the release's "rebuild the current SDE version" step, which
the worker runs from the task stream once it is back up, republishing the current build under a new
version label so clients re-download it. Until a worker has rebuilt it — on a dev environment, or a
release whose rebuild step failed for want of NATS — the SPA reads the old flat file as empty;
`tasks forceSdeRebuild` rebuilds it by hand.

## The engine

*Stage C landed in full.*

**One setup, resolved once.** `reprocessingSetupFrom(structure, skills)` in
`Functions/Reprocessing/engine/reprocessingSetup.js` takes a structure document and a skills map keyed by skill
type id, and returns a frozen setup: for every reprocessing kind, the rig bonus, the rig's security
multiplier and the structure's bonus; the implant's value; its own copy of the skills; and the
structure's tax as a percentage. Given nothing, it is an NPC station with no skills.

`yieldFor(setup, item)` answers an item's yield percentage from that setup, by its kind and its
`reprocessingSkill`, through `reprocessFromItemType`; a kind the setup does not hold yields 0. The ids of
Reprocessing and Reprocessing Efficiency are exported from the same module and are the only copy.

`ReprocessingItem.reprocessMaterials(setup)` reads its yield from `yieldFor`, and the page's two
calculations build one setup per run. Figures are unchanged: the parity corpus against the live model
passes through the setup.

**What ore can produce is read from the file.** A material is producible when an ore, moon ore or ice
item lists it among its fixed outputs: `producibleByReprocessing(typeID)` answers it and
`producibleTypeIDs()` lists them, both views of the reprocessing file, false and empty before it
arrives. From minerals reads a pasted list against that set, so it accepts exactly the 37 materials ore
gives today — Neo-Jadarite and Eleutrium included — and no longer accepts Unrefined Isogen.

**Parsing hands back what it could not read.** `parseReprocessingInput` and `parseInputMineralString`
each return `{ items, unread }`: `unread` is every line, trimmed, that named nothing the parser reads or
carried no quantity, in the order pasted. Both directions' calculations pass it on beside their
results; nothing on the current page shows it yet.

**`reprocess(items, setup)` is the core.** It takes `[{ typeID, quantity }]`, adding a type named twice
together, and returns a new object without touching its input: per item the batches, the units kept
back under a batch, the yield and every output as a total for the run; every output combined; and each
type the reprocessing file does not hold, as `notReprocessable`. Ore and gas go through one path.
Outputs come from `reprocessedQuantity`, the single rounding rule: each batch rounded for ore, moon ore
and ice and the run rounded for gas — live's rule, which a parity corpus holds the engine to against
live's own code across 145,800 cases.

**Random outputs come back as ranges.** For an item with random outputs, `reprocess` gives each mineral
its expected units — batches, times the one-in-k chance of that mineral, times its middle amount at the
yield — as `outputs`, and its range as `outputRanges`: from none to every batch giving it at its most,
or for an unrefined mineral, every batch at its least to every batch at its most. A combined output a
random item adds to carries a range too. `randomOutputValue(item, priceOf)` turns such an item into
money: the expected value, the range eight in ten runs land in, the least and most a run can be worth,
and `shareAbove(value)` for how often a run beats a figure — exact mean and spread with a normal
approximation from 30 batches, a seeded 20,000-run simulation below, so a short run is right and every
render agrees. Erratic ore reprocesses as ore — formula, structure bonus and rigs — until the in-game
check (plan § A4) says otherwise.

**The current page runs on the engine.** To minerals takes its totals from `reprocess`, and From
minerals plans with `oreToBuy`. The `ReprocessingItem` instances the old output panels render stay until
Stage G replaces them; the class works out its yield and outputs through the same `yieldFor` and
`reprocessedQuantity`, and a test holds the two to the same figures until the class retires.

## What the page values

*D1 and D3 landed; D2 not yet.*

**Every figure comes from one place.** `valueReprocessing(result, priceOf, rates)` and
`valueOrePlan(result, needs, priceOf, options)` in `Functions/Reprocessing/valuation/valuation.js` turn a
`reprocess` result, a price reader and the rates into every figure either direction shows; nothing is
worked out in a component.

To minerals: per item and in total, the outputs' market value less selling fees and the reprocessing
tax, plus the units kept back under a batch sold as they are, against the whole paste sold as it is
after the same fees — with the difference, its percentage and the difference without tax; the value
shared by output, largest first; each output's cost as the ore it came from, the reprocessed units'
cost shared by output value; and the volume to haul both ways. An item with random outputs is valued
at its expected run, with its range carried through fees and tax and into the totals.

From minerals: for the planned ore, each ore's cost, volume and shipping (per m³, or a fixed amount
charged once); the ore delivered, tax included; the needed minerals bought outright and shipped the
same way; what the ore leaves over beyond the need, at market and after fees; and the ore delivered net
of those leftovers.

The reprocessing tax is charged on the outputs' market value until the tax check (plan § A3) says
which value the game uses. A price of 0 — a market with no orders — counts as nothing (`isPriced`, the one copy of that rule) and
is named in `unpriced`; a type with no volume is named in `withoutVolume`.

**Selling fees are quoted for a seller.** `useReprocessingSellingFees(marketID, sellerHash,
typedRates)` gives the broker fee, the sales tax and their sum as `feePercent`, the figure valuation
charges. Signed in, it is the seller's own rates at the market the page prices against, through the
same `useSellingRates` the Selling stage uses; the seller is a character of its own, apart from the one
whose skills set the yield. Signed out, nothing asks for a character: the fees are what the reader
typed, or every market skill at its highest with no standings — 4.875% at a station, the owner's rate
plus the tax at a citadel.

## Ore selection

*Stage E landed.*

**`oreToBuy(needs, setup, options, priceOf)` chooses the ore.** It takes any list of materials; the
ones ore can produce are planned and the rest come back as `notProducible`. Candidates are every
selectable ore at the setup's yield, unrefined minerals at the least they are sure to give, and — with
`buyOutright` — each needed mineral bought as it is. Left out: the reader's never-choose list, ore with
no price, compressed ore when `compressedOre` is `"avoid"`, and erratic ore always. Each candidate costs
its price plus shipping per m³ times its volume; a fixed shipping amount is added afterwards by
`valueOrePlan` and does not move the choice. The solver (`yalps`) finds the cheapest fractional plan;
each choice is rounded up to whole batches and trimmed, dearest first, while every need stays covered.
The result names, for each ore, the need it was chosen for — of the needs it gives, the one the whole
plan covers with the least to spare — and carries the fractional optimum as `bound`.

`compressedOre: "prefer"` makes compressed ore look 5% cheaper to the solver only, enough to swing a
close choice over its usual premium; every figure reported uses the real price. Compressed ore is
recognised by "Compressed" in its name.

**The current page reads the plan through `fromMineralsAnswer`**, handed the minerals the paste read,
the prices as `priceOf` and the reprocessing settings in force — compressed ore, buying outright, the
ores never chosen and shipping. It turns each chosen ore into the `ReprocessingItem` the page draws: its
planned units, its price, and its run's outputs from `reprocess` divided by its batches, which the page
multiplies back. Minerals bought outright and the shipping charge are in the plan but not yet drawn.

## Reprocessing settings

*Stage F landed.*

**The planner holds how ore is chosen; the account holds whose skills set the yield.** A planner's
`reprocessingSettings` is `{ compressedOre, countLeftoversAsSold, buyOutright, shipping: { mode, amount },
neverChoose }`: `compressedOre` is `prefer`, `allow` or `avoid`, `shipping.mode` is `perVolume` or
`fixed`, the two switches and the amount are left out of the document when off or zero, and `neverChoose`
is a list of type ids, empty rather than absent. A new planner starts on `prefer`, per m³ at zero, both
switches off and nothing excluded. The account's `reprocessingSettings` carries
`defaultReprocessingCharacter` and nothing else, since a character is resolved per reader.

**A member changes them through the planner settings endpoint**, which refuses an unknown choice or
mode, a negative or non-finite amount, a missing list, an id that is not positive, and a list over
2,000. The SPA reads a stored choice or mode it does not know as the default.

**The page reads and writes the active planner's copy.** Once the planner's settings are held, every
change on the page is written to them and saved; there is no separate save. Signed out there is no
planner, and the page keeps its own copy, starting on the defaults.

**The release moves each account's choices onto its planner.** `backfillPlannerSettings` reads the
account's retired fields from the release's copy and gives the planner `prefer` or `allow` and whether
leftovers count as sold, unless the planner already holds settings of its own, then clears the five
retired fields from the account.

## The page

*G1–G3 landed; G4–G8 not yet.*

**The page opens once its data is in.** Its route primes the reprocessing file and the item list before
the page shows, so the router's pending screen covers the wait and nothing on the page loads them.

**Two columns, and two directions that each keep their paste.** The side column holds the direction —
To minerals or From minerals, as two cards — the paste for that direction and the setup; the main
column holds the prices and what the paste comes to. Switching direction leaves each paste as it was.

**Figures follow the reader's choices as they make them.** The page keeps only what the reader chose;
what it comes to is worked out each time it draws. Changing the structure, a rig, a skill, the market or
a From minerals setting changes the figures at once. A changed paste waits for Reprocess, so a half-typed
line is never read.

**The paste says what it read.** Its label sits above the box, and its button waits for something to be
pasted. The box grows from five rows to twelve and then scrolls, so a long paste never stretches the
page. A chip counts the items or minerals read and another the lines it could not read, which are
listed as pasted. A line naming a real item the direction cannot use is listed apart and left out: in To
minerals, an item that does not reprocess, as "Not ore, ice or gas: left out" with a chip counting the
lines; in From minerals, an item no ore yields, as "No ore yields this; buy it as it is".

**The setup lists the skills the input uses.** Its fields are a compact grid — structure and system
security, two rigs, implant and reprocessing tax, then the character — without the descriptions Settings
gives them. The skills sit under a caption that opens itself once something is read: Reprocessing and
Reprocessing Efficiency always, then the processing skill of each item pasted, or of each ore chosen;
"Show all reprocessing skills" lists the rest. Levels start at the chosen character's trained ones, read
from every skill the character's read returns rather than only those the file names; a
level the reader changes stays changed until another character is chosen. The yield is stated for ore,
moon ore and ice before anything is read, and for any other kind pasted, with the tax beneath; a kind
whose items' skills differ shows the span, and a skill below V is named. In From minerals the setup opens
on a short summary, with its controls a click away.

**Items keep the order they were pasted in**, and the headline's footer names the market and order side
the figures are read at. Signed out, fees are worked out at every market skill V.

**The page holds its static files through a hook.** It reads the reprocessing file and the item list
through `useHeldStaticFile`, so when a new SDE build drops either — as the build check on load does for
a browser that has not seen the build — the page loads it again and redraws, rather than reading
nothing.

**Ore selection is the planner's.** Shipping, buying outright, compressed ore, counting leftovers and the
ores never chosen are read from and written to the active planner's settings; signed out they live on
the page.

**To minerals answers in three panels.** The headline sets what the items come to reprocessed, after
fees and tax, against selling them as they are, with the difference and the volume to haul; its header
holds the market, the order side — each option showing what reprocessing comes to on it — and the
seller. What you get shows the share of value by output and a table of outputs by market group, ending
in market value, fees, tax, units kept back and the net, and copies the outputs as a list. Item by item charts each
item's difference and lists every item; a row opens to show what each output gives per 100 units (or
per unit) and in total, and what that output costs as this ore.

**Amounts are stated in units, not batches.** "Batch" is not the player's word for raw ore, which has to
reach a full 100 before it reprocesses, so the page counts no batches. An item's caption
says how many it is reprocessed at a time where that is more than one ("Ore · reprocessed 100 at a
time"), an item short of that amount is marked "Under 100 units", the units below a full amount are
"kept back", and the drawer reads "Per 100 units" and "From 64,200 units". The wording comes from
`portionWording.js`, and the engine's result carries each item's `batchSize` for it. Compressed ore
reprocesses 100 at a time like raw ore and gives the same per 100; the legacy Batch Compressed ore
reprocesses one unit alone, giving what 100 raw units give, so it carries no "at a time" note.

**Erratic ore and unrefined minerals read as ranges.** Their figures are expected values marked ~,
each with the likely range where 8 in 10 outcomes land. The headline adds how many runs in 100 come out
ahead of selling as they are, a bar of possible, likely and expected against the as-is figure, and a
line naming the odds assumed: every 100 units of erratic ore collapse into one mineral, each equally
likely. Its row says "One mineral per 100 units", and the drawer's spread bars end at three times the
expected units. A row's
drawer lists each mineral's spread over the run, and What you get adds a Likely column.

## Shared components this project adds

*Landed with the G2 reviews and G3; `useHeldStaticFile` and `staticFile`'s `subscribe` promote into `frontend/static-data/staticFile.md`; promote the rest into `frontend/components/forms.md`, `surfaces.md`, `figures.md` and the tables and charts topics, and move `frontend/settings/custom-structures.md`'s and `testing/frontend/settings.md`'s structure-field paths to the shared module.*

**`SegmentedChoice`** (`Styled Components/Select/SegmentedChoice.jsx`) is one of a few options as a row of
joined buttons, built on MUI's `ToggleButtonGroup`. One option is always in force, so pressing the chosen
one again keeps it; an option may carry a tooltip, which describes the button rather than renaming it.
The group is named by `label`, or by a visible caption through `labelledBy`, and `stretch` shares the
width between the buttons. Used by the From minerals shipping and compressed ore choices, the
Reprocessing view, Planning's pricing model and the Accounts page's token storage.

**`EvenColumns`** (`Styled Components/Paper/EvenColumns.jsx`) lays its children out in even columns that
stack into one on a phone — fields side by side, or a pair of cards to choose between. It passes its own
attributes through, so it can be a named group. Used by the Reprocessing setup's fields and skills, the
direction cards, and Planning's exit routes.

**`ChipRow`** (`Styled Components/Chip/ChipRow.jsx`) is a row of chips that wraps onto further lines, a
named group when given a label. Used by the paste panel's read chips and the ores never chosen.

**The structure fields are shared.** Settings' field registry moved to
`Styled Components/Structure/structureFields.jsx` — `STRUCTURE_FIELDS`, `fieldsFor` and
`StructureField`, each field a `FormField` in app-shell styling, rig fields included now — and
`useStructureFieldContext` builds what they render from: the app-shell select and text field styling,
rig slots, the options a place allows and the fields it fixes, and a handler per field that hands the
change to the caller. Settings' structure form and the Reprocessing setup both render
`fieldsFor(fieldsForKind(kind))` through it, and both apply a change through `changeStructure`
(`Functions/Custom Structures/structureChanges.js`): what a place stops deciding goes back to blank, then
what the new place fixes is applied — so choosing an NPC station clears the rigs and sets its tax on
either screen. A reprocessing structure is described the same way in both.

**Skills read as `SkillLevelRow`s.** Planning's skill row became `Styled Components/Skills/SkillLevelRow`
— name and what the skill does, then `SkillLevelPips` (moved beside it) and the level as a figure — and
Planning passes its state stripe through `sx`. The Reprocessing setup lists its skills with it: the pips
try a level over the character's trained one, clicking the tried level puts it back, and the figure
reads "3 → 5" while a level is being tried.

**Table parts.** `tableParts` adds `BandRow` (a caption across the table), `ExpandToggle`
(`Styled Components/IconButton/ExpandToggle.jsx`, opens a
row's drawer, its label saying which), `DrawerRow` (the drawer, mounted only while open) and
`SummaryRow` (a total or a quieter line adjusting it, each value under its column and toned when asked). Settings'
markets table uses `ExpandToggle`, and so does `Disclosure` drawn as a `heading`. A drawer contains its
own width and scrolls on its own, so it never widens the table.

**`ItemName`** (`Styled Components/Item/ItemName.jsx`) names an item in a row: icon, name with the item's
market actions, and an optional caption beneath.

**Order side with totals.** `orderTypeOptions` (`Functions/MarketData/defaults/orderTypeOptions.js`)
builds `PricingOrderTypeSelect`'s options from a total per order type, for Planning's material cost and
this page's reprocessed value alike; the picker's `higherIsBetter` colours a higher total as the better
one, and `totalsCaption` says what the totals are.

**Shared parts extended for the page.** `staticFile` takes subscribers and `useHeldStaticFile`
(`Hooks/Static/`) reads one through `useSyncExternalStore`, loading it again when it is found dropped.
`Disclosure` takes `heading`: a caption with a chevron button rather than a link. `SelectableCard` takes
`stacked`: its input beside the title and the body beneath, for a narrow card. `StructureField` takes
`compact`: the field's short name (`shortTitle`), no description and no helper caption. `ItemName`'s
caption wraps.

**`SpreadBar`** (`Styled Components/Charts/bars/SpreadBar.jsx`) shows where a figure that varies could
land: possible as a muted track, the likely span solid, the expected value marked, and figures it is
set against marked beside it, with a compact form for a table row. **`ChartLegend`**
(`Styled Components/Charts/ChartLegend.jsx`) is a chart's plain key, a block or thin upright for each
thing drawn; `ProportionBar`'s legend uses it.

**`RankedBarChart`** takes `markZero`, a line at zero for bars that run either way. **`itemListText`**
(`Functions/Clipboard/itemListText.js`) writes items and quantities as the lines EVE reads from a paste.

**The pickers carry app-shell styling.** `CustomStructureSelect` and `AssignUsersSelect` take the same
styling props as the other selects and are given `getAppShellMarketSelectProps`; the market and order
type pickers, the paste and the shipping amount use the app-shell outlined styling; the results' wait
is `PanelFallBack`.

## Comparing setups

*Stage H. Not landed.*

## Where these sell

*Stage I. Not landed.*

## Assets on the page

*Stage J. Not landed.*

## Copying

*Stage K. Not landed.*

## Modules and scrap metal

*Stage M. Not landed.*
