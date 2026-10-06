# Planning stage panels — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the root masters they defer
to, and — for the surfaces this plan names — [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md)
and [`../../backend/technical-rules.md`](../../backend/technical-rules.md).
Phase 1 (project folder and docs) before any product work.
For the Go surfaces in scope only: `go fix -diff` before Stage A, and again on the packages edited.
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

The Edit Job Planning stage answers three questions clearly — **what does this take**, **what does it
cost**, **what does it return** — with one panel per question, figures priced at the granularity the
server already provides, and the cost of selling counted rather than omitted.

## Starting position

`MaterialCostPanel` is one `ContentPanel` doing four unrelated jobs across roughly 1,300 lines and 24
files:

| Job | Where it lives now | What is wrong |
|-----|-------------------|---------------|
| Product revenue | `currentMaterialHeader.jsx` | The only revenue figure on the stage, inside a panel titled “Costs”, formatted as a material row |
| Material cost | `itemRow.jsx`, `materialTotals.jsx` | Re-renders the material list already drawn by `ResourcePanel` immediately above it |
| Buy vs build | `Child Job Pop Over/` (9 files) | Four ungrouped figures per row; the comparison and every action behind a small info icon |
| Pricing configuration | `materialSourcesPopover.jsx` | Three override levels in a centre-screen popover reached from a kebab menu |

Two further problems are not about layout:

**Selling costs are absent.** The broker fee paid to list an item and the sales tax paid on the sale
are calculated on the Selling stage (`calcBrokersFee`) and ignored on Planning, so every profit figure
the stage shows is optimistic. On the worked example that is 23.4M on 624M of revenue — 3.75%, which is
comparable to the buy-vs-build savings the panel exists to surface. The broker fee is also only
derivable at an NPC station, where it falls out of the character's skill and standings; at a citadel it
is the structure owner's rate and the player has to supply it. Today there is one such rate for every
citadel, and no sales tax rate anywhere.

**The comparison arrives after the decision.** A material's build cost is unknowable until its own
material requirements exist, so the child-build columns are populated only for rows the player has
already committed to. `buildSingleChildJobPreview` already constructs exactly the speculative job that
would answer the question, on popover open, and discards it when the popover closes.

## Target shape

Three panels replace one. Each carries its own pricing control in its header; there is no bar above
the stage.

| Panel | Answers | Absorbs |
|-------|---------|---------|
| **Materials & Sourcing** | What does this take, and should each material be bought or built | Raw Resources; the child-job popover becomes an inline drawer |
| **Cost Breakdown** | What is the cost made of, and how does it compare to previous builds | Extras; the build-vs-buy pricing model toggle |
| **Returns** | What does the build return, by each route out | The duplicated totals columns |

Panel count on the stage is unchanged at eight: Raw Resources and Extras retire, Cost Breakdown and
Returns are new, and Skills is rebuilt.

**The stage does not grade the plan.** Returns presents figures and the relationships between them —
net return, both exit routes, headroom above break-even, the range of previous builds — and states no
verdict. Whether a margin is worth the time depends on the player's capital, their week and the item's
turnover, none of which the app holds. This is a constraint on every stage below, not a Stage F
detail.

## Ordering

The figure work runs first, and for a specific reason rather than convention: **the panels depend on
figures that do not exist yet.** Cost Breakdown cannot draw a sales-tax row until a rate resolves, and
Returns cannot state a net return until the fee estimate does. Doing the panels first would mean
building them twice.

Stage A supplies those figures without storing anything: a sale location resolves through one accessor,
which returned placeholders until the saved-market registry arrived underneath it — § One accessor over
the sale locations.

```
Stage A  sale locations and their rates                 frontend, no stored shape
Stage B  fee + tax estimation shared with Selling       frontend logic, no UI
Stage C  Accounting in the skill catalogue              data
   ────────────────────────────────────────────────  UI work starts here
Stage D  pricing order type surfaced in panel headers
Stage E  Materials & Sourcing absorbs Raw Resources
Stage F  Cost Breakdown and Returns replace the totals
Stage G  speculative child jobs                          behavioural
Stage H  jobs with parent jobs                           behavioural
Stage I  Skills as a model
Stage J  mobile layouts
Stage K  default market character in settings         independent; the accessor it fills exists
Stage L  per-job selling override                      gated on K and F
```

Stages A–C are independent of each other and can land in any order or together. D–F are strictly
ordered. G and H are the two behavioural changes and are the highest-risk work; both are gated on F so
they change a panel that has already settled. I depends on B for its figures. J is last because it
restyles panels that must exist first. K is gated on nothing: the accessor it fills is already in
place and already has a default, so the stage swaps a stand-in for a stored value and every consumer
stays where it is.

## What this project inherits

| Inherited | Where it is decided | What this project assumes |
|-----------|---------------------|---------------------------|
| The account / planner settings split | [shared-planners](../shared-planners/plan.md) | That `planner.Settings` is where a setting a job's costing depends on belongs, and that `CustomStructures` is already on both documents and cloned into a new planner. Saved citadels join that family, so they inherit the placement rather than needing one decided |
| Settings write shape | [document-write-granularity](../document-write-granularity/plan.md) | Nothing. This project writes no settings; the shape it settles applies to the custom-structure work that stores saved citadels |
| Server price figures | live SoT, [backend/](../../backend/contents.md) | That `buy`, `sell`, `buyP95` and `sellP05` are served per hub and stay served. This project reads them and adds no querying |

## Stage A — Sale locations and their rates

**Frontend only. No stored shape, no schema, no backend.**

### Two location kinds, two mechanisms

A broker fee is not one calculation with a fallback. It is two different mechanisms, and
`calcBrokersFee` already implements both — the branch on `STATIONID_RANGE` is the distinction, not an
optimisation.

**An NPC station's rate is derived.** The player supplies nothing. The station's `race_id` and `owner`
come from `getStationData`, and the rate falls out of the character's skill and their standings with
those two entities:

```
3% − 0.3 × Broker Relations − 0.03 × faction standing − 0.02 × corporation standing
```

Both standings are read per character, and the faction one requires knowing which faction owns the
station. This is why a station cannot be treated as "a location with a rate": the rate is a function of
who is selling, and it differs between two characters standing in the same station.

**A citadel's rate is set by its owner.** The owner chooses a percentage and receives all of it; the SCC
takes a further flat 0.5%, which no skill reduces. Standings do not enter into it — there is no faction
and no NPC corporation to hold standing with — and **Broker Relations does not reduce it either**, which
is why `calcBrokersFee` applies the supplied `citadelBrokersFee` verbatim rather than running it through
the skill term.

**The stored rate already includes the SCC's 0.5%, and nothing adds it.** A player supplies the figure
the market window shows them, and that figure is the total charged. Adding the surcharge to a stored
rate would double-count it on every citadel sale. The consequence worth carrying into the
add-a-citadel form: 0.5% is the floor a citadel rate can take, since it is what remains when an owner
charges nothing.

Sales tax is a third case again: it is derived from Accounting alone, at every location, station and
citadel both. It has no station or structure component, which is why it belongs on the character rather
than the location.

| | Broker fee | Sales tax |
|---|---|---|
| **NPC station** | Derived: base, less Broker Relations, less faction and corp standings | Derived: base, less Accounting |
| **Citadel** | The rate the player supplies, which is the total they are quoted | Derived: base, less Accounting |

### The gap

`MARKET_OPTIONS` holds the four NPC hubs we carry price data for, and every one of them takes the
derived path. Everywhere else is a citadel, and the app has exactly one number for all of them:
`defaultCitadelBrokersFee`. Three problems for planning:

- It is **one rate for every citadel**. A player selling from two structures with different fees
  cannot express that.
- It has **no tax counterpart** — though for the reason above, tax does not need a per-location field.
  What it needs is an Accounting-derived rate, which does not exist anywhere today.
- It is **not reachable from Planning**, which has no concept of a sale location beyond the four hubs.

Tracking every citadel's rates is not possible and is not proposed. A citadel's fee is a fact about
someone else's structure; the only way the app can hold it is for the player to tell it.

### What is stored, and where

The rule the tree already follows: **game constants live in the SPA; the player's choices live in the
document.** `CustomStructure` stores `structureType`, `rigType` and `systemType` as ids and resolves
their multipliers from `structureOptions` in `defaultValues.jsx`. Nothing about a structure's bonuses
is persisted, because they are facts about the game, not about the player.

Broker fee and sales tax split the same way:

| | Where it lives | Why |
|---|---|---|
| Base broker rate (3%), skill and standing coefficients (0.3 / 0.03 / 0.02) | **SPA constant** | Facts about the game. They are currently magic numbers inline in `calcBrokersFee`; this stage lifts them into `defaultValues.jsx` beside `structureOptions` as one source of truth |
| Base sales tax rate and its Accounting coefficient | **SPA constant** | Same. A rate every player is subject to is not per-account data |
| A station's `race_id` and `owner` | **Neither — fetched** | Already read through `getStationData` and cached by React Query |
| The character's skills and standings | **Neither — fetched** | Already read through the cached ESI hooks |
| **A citadel the player sells from: which structure it is, its fee, and the hub it prices against** | **Document** | The fee is the one figure the app can neither derive nor look up — a fact about someone else's structure that only the player knows. The structure id identifies which citadel it is. The hub is a `MARKET_OPTIONS` id, stored because the app has no prices of its own for a structure and something has to say which apply |

So the backend surface is **one list**, not a rate table. Nothing that can be computed from a constant
or fetched from ESI is persisted, which also means a game change to a base rate ships as an SPA change
rather than a migration over every account.

### One accessor over the sale locations

Nothing downstream reads the settings document directly. Every consumer goes through
`Functions/MarketOrders/saleLocations.js`, which answers two questions and hides where the answer came
from:

| Function | Answers |
|----------|---------|
| `getSaleCitadels` / `getDefaultSaleStructure` | Which citadels can be sold from, and which market is used when a job names none — the account's selling default, falling back to the trading hub |
| `resolveSaleLocation` | For a market source id or a saved citadel's id, one normalised location |

The accessor was built against two placeholder citadels while nothing was stored. That has since
happened: the saved markets landed with market-locations and market-price-delivery, and the accessor
reads them through `savedCitadels(allMarketSources())` from
`Functions/MarketData/registry/marketSources.js`. The placeholder is gone, and no consumer changed when
it went.

A resolved location has one shape whatever its kind:

```js
{ kind: "npcStation" | "citadel", id, name, feeStationID, brokerFee }
```

`kind` is `SALE_LOCATION_KIND.NPC_STATION` or `.CITADEL`. `feeStationID` is the NPC station whose
owner's standings set the broker fee, `null` at a citadel; `brokerFee` is the citadel owner's rate,
`null` at a station, where the rate is derived from the seller. There is no price hub on it: a citadel
is priced on its own orders, so a caller reads `brokerFee` and never branches on the kind to find where
the prices came from.

### The resolution order

One function answers "what rates apply for this character selling here", and both stages use it:

| Sale location | Broker fee | Sales tax |
|---------------|-----------|-----------|
| One of the four preset hubs | Derived from Broker Relations and standings, as `calcBrokersFee` does today | Base less Accounting |
| A saved citadel | Its stored rate, verbatim | Base less Accounting |
| Signed out | Base 3%, no skill or standing reduction | Base rate, no reduction |

The 100 ISK floor `calcBrokersFee` already applies stays in all cases.

**Standings are per character, not per location — and the character is the seller, not the builder.**
The derived path reads them through `getCachedCharacterStandings` keyed by `CharacterHash`, and the
hash it is given comes from `sellerCharacter.js` rather than from the job's setup. Players routinely
build on one character and trade on another, so a fee derived from the builder would quote an
untrained rate on most accounts.

### The work

- Lift the broker fee rates out of `calcBrokersFee` into `defaultValues.jsx`, beside `structureOptions`,
  as `brokerFeeRates` — base, the Broker Relations, faction and corporation coefficients, and the ISK
  floor — plus `marketSkillIDs` for the skill type ids the fee depends on. They are game constants and
  were magic numbers; this is the one source of truth both stages read.
- Give every consumer one accessor over the sale locations — § One accessor over the sale locations.

- Add `salesTaxRates` beside them — base and the Accounting coefficient — with Accounting's type id in
  `marketSkillIDs`. Nothing calculates sales tax today, so these are new rather than lifted.

**Three further charges are real and out of this project's scope**, recorded so they are not
rediscovered as defects. A broker fee is charged on **buy** orders too, so buying materials through
orders costs more than the price paid — this project models the cost of *selling*, not of purchasing.
**Relisting** an order costs a discounted broker fee, reduced further by Advanced Broker Relations; the
Planning stage estimates a first listing, and a relist is a Selling-stage event. And the round-trip
break-even a trader quotes — two broker fees plus tax — is not a builder's: a build pays one listing fee
and one tax, so Stage F must not borrow the trading figure.

**Sales tax reduces multiplicatively, and the broker fee does not.** Accounting takes a fraction of the
base per level — `base × (1 − 0.11 × level)` — where the broker fee subtracts each coefficient from its
base. The two sit next to each other and read alike, so applying the broker fee's form to tax is the
easy mistake: it gives 6.95% at Accounting V instead of 3.375%. Stage B implements them as two
formulas, not one with different inputs.

**No document, schema or backend change.** Storing saved citadels moves to the custom-structure work;
this stage neither adds a field nor bumps a schema version, so there is nothing to migrate and no
collection to back up before writing. § Handed to the custom-structure work carries the shape and the
migration it will need.

The rate *block* — a station's full working, a citadel's single line, and the picker that chooses
between saved locations on a job — is settled in the design reference and built in Stage F with the
panels that consume the figures.

**Done when:** a caller can resolve a sale location and its rates through one accessor without knowing
whether the row is stored or a placeholder; two placeholder citadels differing in fee, hub and default
prove a consumer reads the chosen row rather than assuming one; the broker fee rates resolve from the
SPA constant with no request and no literal of them survives in `calcBrokersFee`.

## Handed to the custom-structure work

**Landed, and promoted elsewhere.** market-locations and market-price-delivery built what this section
handed on: saved markets as a lane of their own, the Settings page's Market Locations tab with its
editor, and a citadel priced on its own orders. Both projects have promoted; the live description is
[frontend/settings/market-locations.md](../../frontend/settings/market-locations.md), and where it and
this section disagree the live doc is right — most visibly, nothing stores a price hub for a citadel.
This project reads saved citadels through the accessor above and never touches the settings document.

What follows is the proposal as it was handed over, kept because the projects that built it cite it.
It is not a description of what runs.

### The shape it should take

A citadel is not a fifth kind of thing beside the structures the app already stores — it is another
lane of `CustomStructures`, which is already a per-planner list of named, player-defined locations
each carrying its own rate.

```go
// SaleStructure is a citadel a player lists orders from, chosen from the
// structures their characters hold assets in. Its broker fee is set by the
// structure's owner and can be neither derived nor fetched, so the player
// supplies it. PriceHub names which of MARKET_OPTIONS its figures are priced
// against, since the app holds no prices for a structure of its own.
type SaleStructure struct {
    ID          string  `bson:"id" json:"id"`
    StructureID int64   `bson:"structureID" json:"structureID"`
    Name        string  `bson:"name" json:"name"`
    BrokerFee   float64 `bson:"brokerFee" json:"brokerFee"`
    PriceHub    string  `bson:"priceHub" json:"priceHub"`
    Default     bool    `bson:"default" json:"default"`
}

type CustomStructures struct {
    Manufacturing []CustomStructure       `bson:"manufacturing" json:"manufacturing"`
    Reaction      []CustomStructure       `bson:"reaction" json:"reaction"`
    Reprocessing  []ReprocessingStructure `bson:"reprocessing" json:"reprocessing"`
    Invention     []InventionStructure    `bson:"invention" json:"invention"`
    Sale          []SaleStructure         `bson:"sale" json:"sale"`
}
```

**A lane rather than a new field, because the lane machinery already exists.** `CustomStructures` is
on both the account and the planner document and is cloned into a new planner by `SettingsFromAccount`;
the SPA store rebuilds each lane from a class by name; the settings page already frames the family. The
Invention lane was added this same way at schema v0→v1, so the upgrader step has a worked precedent to
copy rather than a pattern to invent.

**The custom-structure work itself is not this project's to do.** Building the lane's editing surface —
the settings frame, the add-a-citadel form, the store rebuild — belongs with the wider custom-structure
work being taken separately. This project builds against a placeholder instead, and the full lane slides
in at the end. § One accessor over the sale locations says how that stayed a change to one file.

**The lane belongs to the planner**, which the family it joins has already decided.
[shared-planners](../shared-planners/plan.md) § Settings split between the planner and the account puts
`CustomStructures` and `DefaultCitadelBrokersFee` both on the planner side, under the rule that a
setting deciding how work is done in a planner belongs to it. The account's copy is the seed a new
planner is built from, not a thing resolved against. So a shared planner offers every member the same
citadels, while the parts of a fee that come from a person — Broker Relations, standings, Accounting —
stay per character and are read through the setup's selected character. Locations are shared; skills
are personal.

**`StructureID` is the in-game structure**, chosen from the locations the player's characters hold
assets in. It is captured now so that a later project can query the structure's own market for the
types priced against it; **nothing in this project queries it.** Storing the id is the whole of the
capability being added here.

It is stored raw, as `int64`. Location ids are already stored in the clear across the tree —
`DefaultStationIDForAssets` and `CustomStructure.SystemID` are both `int64` — and the deterministic
entity-ref machinery covers owner identity (corporation, character, alliance) rather than places.

**No character is stored on the row.** Which characters can reach a structure is a question only the
project that queries its market has to answer, and a `CharacterHash` on a planner-owned row would put a
personal value on a shared one — the defect the settings split exists to prevent.

The lane carries no `SkillsApply` flag and no standings: **a citadel fee is not reduced by Broker
Relations**, so there is nothing to opt in or out of. An earlier draft of this stage had such a flag; it
was wrong, and it would have produced fees the Selling stage disagrees with. It also carries no
`JobType`, which every other lane has: selling is not one of the `jobTypes`, and `customStructureMap`
keys lanes by job type, so the field would hold a meaningless number in every row.

`PriceHub` is a `MARKET_OPTIONS` id, not a copy of anything from it. The app holds no prices for a
structure, so a job selling from one still prices against a hub, and asking once per citadel beats
asking on every job. It also makes the assembly explicit rather than hidden: **prices from one
location, fee from another**, which the rate block states wherever a figure is shown.

A preset hub is not stored — it stays an entry in `MARKET_OPTIONS` and takes the derived path.

### Backing up before the upgrader writes

The upgrade-on-read path rewrites `application_settings` and the planner settings collection, so both
must be copied before the first write, with the copies restorable and a round-trip test — back up,
mutate, revert, compare.

Most of that exists. `services/core/commands` holds a copy / revert / drop framework behind
`eip cli prepareRelease`, `revertRelease` and `dropReleaseBackups`, with a round-trip test, and
`application_settings` is already in its collection list. Two gaps: the planner settings collection is
not, and the list is derived from what a release's *cutover steps* touch — while an upgrade-on-read
change writes through a different path entirely. Extend that framework rather than building a second
backup beside it.

### Choosing the structure

The picker reads the list the app already builds. `getAssetLocationList` walks every character's
assets, resolves nested containers to their parent location, dedupes to unique location ids, resolves
names through `getWorldData` retrying per character because access differs between them, drops what
stays unresolvable, and sorts by name. `jobSettingsFrame` already renders that list as a location
picker for `defaultStationIDForAssets`.

**Structures reach that list through the extended branch, not the direct one.** Only `station` and
`solar_system` are accepted directly; an asset sitting in a citadel comes back as `item`, and
`retrieveAssetLocation` finds no asset row whose `item_id` matches a structure id, so it returns the
asset itself and the structure's `location_id` is what lands in the list. This is worth stating because
reading the direct filter alone suggests structures are dropped, and they are not.

What the list does not do is separate a station from a structure — both are ids in it, told apart only
by range. `resolveLocationKind` in `assetLocationConstants.js` already answers that, and the form calls
it rather than carrying a second copy of the ranges; it also covers what a bare `STATIONID_RANGE`
comparison does not — solar systems, abyssal space, and the asset-safety sentinel.

**The kind alone is not the filter, though.** A structure kind covers customs offices as well as
citadels: they share an id range, and ESI documents customs offices as not resolvable, so nothing
separates them from the id. What separates them is the name — `getAssetLocationList` tries each
character in turn and drops what stays unresolvable through `isNoAccessLocation`, which is exactly the
step that leaves a citadel the player can actually reach. So the form filters on kind **and** keeps the
name resolution; a candidate set taken from the kind alone would offer unnamable customs offices as
sale locations.

One category is excluded and should stay excluded: the `parentLocation.location_type !== "other"` guard
drops asset safety, which is what ESI reports as `other`. That is right for a sale location — nothing is
listed for sale from asset safety — but it is a behaviour decision living in a comparison rather than
anywhere stated, and it is the line to look at if a later surface needs everywhere an account holds
assets rather than everywhere it can sell from.

The player picks a structure, names its fee, and picks the hub it prices against.

The places an account holds things come from `Hooks/EveEsi/useAssetLocations.js`, which pairs the
asset node collection with the shared location-name query — see
[frontend/esi-collections/assets.md](../../frontend/esi-collections/assets.md). Build the form
against that hook rather than walking raw ESI rows.

This is why the stage is not purely backend: **the row cannot be created without the picker**, so the
picker ships with the field. The rate *block* that displays the working stays in Stage F with the
panels that consume it.

A sale structure's name comes from one member's ESI access, so a shared planner shows other members a
structure they may not be able to reach. That is intended — they need to know where the planner sells —
but it sits beside `ShareCitadelNames`, the existing opt-in for contributing citadel names, and should
not land without being noticed.

### Where a structure's prices come from

**Landed.** The proposal was to price a citadel against a hub the player named until the app could read
the structure's own market. The app reads it now: a saved citadel is fetched by the reader, held on the
device and priced on its own orders, as live
[frontend/market-data/contents.md](../../frontend/market-data/contents.md) describes, so the stand-in
was never built. `SaleLocation` carries no `priceHubID`, the rate block says a citadel is "priced on
this citadel's own orders", and `feeStationID` stays the one field that tells the two kinds apart for the
fee — the NPC station whose owner's standings set it, `null` at a citadel.

### ...and where its materials are bought from

**Landed with the same work.** The buying side is a separate choice from the selling side, and the
material pickers now offer saved markets beside the four hubs: `Styled Components/Select/marketLocation.jsx`
validates against `useMarketSources()` rather than `MARKET_OPTIONS`, so a stored citadel id is kept
rather than rewritten to Jita. The rule to keep is unchanged — the panel's market is the default and a
row's override outranks it, on both sides of the job.

## Handed to the market pricing defaults work

**This project did not change the account's market defaults**, and a reader picking this up should not
go looking for them here. Asking how the hub picker built here would behave on the surfaces this
project does not own — the shopping list, the price entry dialogue, item watch, reprocessing — showed
that the single `defaultMarketLocation` / `defaultOrderType` beneath it is answering two questions
with different answers, and that an item's market group never reaches the SPA at all.

That is its own work, with its own project folder:
[market-pricing-defaults/plan.md](../market-pricing-defaults/plan.md). The ladder, the surface
inventory, the buy/sell naming trap and the market group tree all live there, and that plan is the
authority. Nothing in it blocks, or is blocked by, the custom-structure work above — all three land on
the same resolver.

## Stage B — Fee and tax estimation

**Frontend logic. No UI.**

`calcBrokersFee` takes an order-shaped object and returns ISK. Planning needs the same rates against a
planned sale rather than a real order, and against a location that may be one the player defined.

- **Split the rate from the ISK, for the tax as much as the fee.** Extract rate resolution into its own
  function so both stages share one formula rather than the planner growing a second copy.
  `calcBrokersFee` then becomes that function plus a multiplication and the existing floor.

  **The tax is built in that same split shape**, even though nothing calculates it today and there is
  therefore nothing to extract. It would be quicker to write a single Planning-only helper that returns
  a tax figure, and that is the thing to avoid: the Selling stage will need the same rate against a real
  sale, and a helper shaped for one caller has to be taken apart before the second can use it. A rate
  function and an amount function from the start costs nothing now and means Selling adds tax by calling
  what already exists.
- The rate function takes a **sale location** rather than a `location_id`, and branches the way
  `calcBrokersFee` already does: a preset hub derives from `stationID` — `MARKET_OPTIONS` carries one
  per hub — and a saved citadel returns its stored rate verbatim.
- Character inputs stay as they are: skills and standings from the cached ESI reads the Skills panel
  already makes, keyed by `selectedSetup.selectedCharacter`. **Standings are only read on the station
  path**, because a citadel has no faction or NPC corporation to hold standing with.
- Sales tax is derived from Accounting against the stored base rate, at **both** kinds of location. It
  is a character figure, not a location one.

**Fees are sell-side only.** Broker fee and sales tax are what a player pays to **list** an item.
Nothing here estimates a fee for acquiring materials; buy-side fees are out of scope.

**Two exit routes, both at the current price.** Listing a sell order returns the hub sell price less
fee and tax; selling into buy orders returns the hub buy price less tax only. Both are quoted at what
the market is now — the app does not model undercutting, order-book position, or how long a listing
sits.

**A citadel has no price data.** The four hubs are the only places prices are held, so a saved citadel
supplies a *fee rate*, not prices. A job priced at Jita and sold from a player's own structure uses
Jita's prices and the structure's fee, and the panel says so rather than implying the price came from
the structure. This is the one place where a figure is assembled from two locations, and it has to read
that way.

**Signed out:** base rates with no skill or standing reduction, and preset hubs only. The figure is
conservative rather than absent, and no authenticated read is required to produce it.

**Done when:** one rate function per charge serves both stages, each paired with an amount function;
the station path derives from skill and standings and the citadel path does not; tax derives from
Accounting at both kinds of location; the estimate is derivable for a signed-out user; `calcBrokersFee`
is those functions rather than a second copy of the formula; tests cover the station path, the citadel
path, and the signed-out fallback, and agree with the existing `calcBrokersFee` tests.

## Stage C — Accounting in the skill catalogue

**Data.**

`bpSkills.json` carries Broker Relations (3446) but not Accounting (16622). Stage I needs both, and
Stage B needs Accounting to apply a skill reduction to the tax rate. One entry, in the file that is
already the catalogue.

The catalogue is what makes a skill id usable at all: `getSkills` builds its map by walking every entry
in `bpSkills.json` and looking each id up in the ESI response, so a skill absent from the catalogue is
not merely unlisted — it reads as untrained, and its reduction silently never applies. A test asserts
every id in `marketSkillIDs` resolves there, so the pair cannot drift apart.

**Done when:** Accounting resolves by type id through the same lookup as every other skill.

## Stage D — Pricing order type in the panel headers

The listing dropdown already offers `buy`, `sell`, `buyP95` and `sellP05`, and
`useMaterialPricingModel` already resolves them per material through three precedence levels. The
percentiles are computed by the worker, served by the API, labelled by `getListingModeLabel` — and
effectively invisible, because a row prints the resolved choice as 10px caption text with nothing to
say why one mode would beat another.

- The order type becomes a **picker built to sit in a panel header**, and this stage builds the picker
  rather than mounting it. The headers it belongs in — Materials & Sourcing owns the material order type,
  Returns owns the sale hub, Cost Breakdown owns the build-vs-buy model — are created in Stages E and
  F, which mount it through the `action` that `AppShellPanel` already takes.

  It is built before its mount points for the reason the backend work came first: a picker built into
  today's `MaterialCostPanel` would be built onto the old `ContentPanel` shell, in a panel Stages E
  and F delete. Like Stages A–C, this stage ships no visible UI on its own.
- The picker shows the four modes **with what each does to this job's total**, so the trimmed figures
  stop reading as jargon.
- A row whose material has a Price Entry purchase price says **Paid** rather than showing an estimate
  for something already bought, and one bought in part says both — what was paid, and what is left to
  buy.

  The per-row override already names the mode as well as the hub: `materialPriceOverrides` stores
  `marketDisplay` and `orderDisplay`, and the popover sets both. Nothing to widen — what the override
  lacks is a place to live other than a centre-screen popover, which Stage E gives it.

**No stored shape changes.** `layout.localMarketDisplay`, `layout.localOrderDisplay` and
`materialPriceOverrides` already hold exactly a hub id and one of the four listing ids. This stage is
presentation over data that exists.

The pricing order type is the first of two shared inputs; the second is the sale location, which Stage F
renders inside Returns. They are separate because one decides what materials cost and the other what
selling costs, and a job can price at one hub while selling from a structure beside another.

**Done when:** the picker renders the four modes with each one's effect on this job's total; a row's
override names a mode as well as a hub; a row whose material has a Price Entry purchase price reads
**Paid** rather than quoting an estimate; overrides resolve exactly as they do today. Mounting is
Stage E and F's — this stage is done when the picker and its figures are tested and ready to be
placed.

## Stage E — Materials & Sourcing

- Raw Resources retires **from the standard layout**. Its quantity, job-type dot and linked tick fold
  into the merged table's **Qty** column and the row's mark; “Copy resources list” moves to the kebab
  and total volume to the footer.

  The mobile layout still renders it, and keeps doing so until Stage J converts mobile. The file
  therefore stays until then — deleting it is Stage J's, not this stage's.
- Child build unit cost and total collapse into a **Build** column and a **Δ** percentage — the figure
  the current panel makes a reader compute by eye.
- The child-job popover becomes an **expandable row** on an inset surface: multiple rows open at once,
  it survives scrolling, and the actions get room for labels.

### What the replacement must carry before the old panels retire

The new panel is not a replacement until a player can do from it everything the two it replaces let
them do. Found by rechecking the parts built so far against the panels themselves, rather than against
the design — the design says what the new panel shows, not what the old ones let a player reach.

| Affordance | Where it was | State |
|------------|--------------|-------|
| The drawer at all | The info-icon popover | **Carried.** The panel renders one per row and opens it on click |
| Child job totals in the drawer | The popover computed them itself from `currentJob` | **Carried.** `calculateChildJobTotals` is the shared figure, worked out in the drawer because it follows whichever child job is on show |
| The hub and order type a child's own materials price at | Popover children read `marketSelect` / `listingSelect` | **Carried.** The row resolves them and the drawer passes them down |
| The material itself, and its matched child jobs | Row components held them | **Carried.** A row carries them, so a row is enough to open a drawer on |
| The material's own popover | Both old row components | **Carried.** The name opens it as it did |
| Per-material hub and order type override — seeing one | "Manage Material Sources" | **Carried, and better.** The order type picker counts the rows that depart from it, so an override is discoverable without opening a dialogue that lists every material |
| Per-material hub and order type override — clearing them | "Manage Material Sources" | **Carried.** The picker offers to put every overridden row back |
| Per-material hub and order type override — setting one | "Manage Material Sources" | **Carried, and closer to hand.** The row's own drawer holds the market and listing selects, so a player changes the row they are looking at rather than finding it in a list of every material |
| Job type marker, linked-versus-pending | Raw Resources' dot and tick | **Carried.** A dot becomes a tick once a child job is linked, in the job type's colour, amber where something is pending against a material nothing is linked to yet |
| Exempt-from-builds marker | The info icon turned amber | **Carried, and told apart.** The mark is struck out and greyed rather than amber: it was a separate icon in a separate panel, and merging the panels put it on the same glyph as pending, which means the opposite thing |
| Create All Child Jobs | The market panel's kebab | **Deliberately not carried.** Stage G replaces it with "build all where cheaper": the summary strip costs every buildable row in one action, the offer promotes the ones that would save, and a row's own chip settles the rest without expanding it. A bulk create of jobs nobody has costed is the thing that change exists to stop, and `buildAllChildJobs` — the hook behind the old control — is deleted rather than left for it |

**An app-shell panel on this stage must set `height: "auto"`.** `AppShellPanel` is full height by
default, which is meant for panels sharing a grid row. These are stacked, so each takes its own
height, and a panel filling its parent instead renders as a tall empty box that pushes its siblings
down — a blank page that scrolls. Every panel on the stage sets it, including the one app-shell panel
that was there first. Nothing in a jsdom test can see this, because jsdom has no layout: it takes a
browser.

The stage stacked its panels in a `Masonry` at one column until the height thrash it caused was
traced back to it. A masonry packs items of differing heights into **several** columns without leaving
gaps; at one column there is nothing to pack, and the measuring it does to find that out is not free —
it positions every child absolutely and re-lays out the whole column whenever any one of them changes
height. Opening a material's drawer, or a skills what-if row appearing, moved every panel beneath it.
A plain `Stack` gives the same varying heights for nothing, which is what the mobile layout had been
doing all along.

**Two signals merged into one glyph is a loss even when both are carried.** Raw Resources marked a
pending build and the market panel marked an exempt material, each in its own icon in its own panel. One
merged row has one mark, so carrying both means telling them apart — and they mean opposite things, so
giving them the same treatment says neither.

The market panel is **reduced rather than retired**: Materials & Sourcing takes its material rows, and
what remains — the product revenue figure and the totals block with Profit/Loss — is what Returns
absorbs in Stage F. Deleting it here would take both figures off the stage for a stage and a half.

**Done when:** the material list renders once on the standard layout; every row states its own
comparison; the drawer replaces the popover on desktop; no figure leaves the stage; and every row of
the table above is either carried over or recorded here as a deliberate removal with a reason.

## Stage F — Cost Breakdown and Returns

**Four shapes are shared between the panels this stage builds, and building each
once is the point of having a component layer at all.** The design's own note says
the archive figures are "one query, three placements", and the same is true of the
shapes that draw them.

| Shape | Where it appears | State |
|-------|------------------|-------|
| The range bar placing this build among previous ones | Cost Breakdown's header, Returns' context rows | **Built.** `RangeBar` states a position and no verdict |
| The proportion bar showing what the cost is made of | Cost Breakdown | **Built.** `ProportionBar` |
| A disclosure that opens a section | Cost Breakdown's cost-over-time, Returns' ledger | **Built.** `Disclosure` |
| A context row — a relationship between two figures, stated without a verdict | Returns | **Built.** `ContextRow` |

`HeadlineStat` was checked against Returns before Cost Breakdown used it: `PanelHeadline` is the
arrangement both panels open with, and a `size` distinguishes the figure a panel leads on from the
smaller ones standing beside it.


The totals block currently renders the same five rows twice, once per pricing model, marking neither
as the one in effect.

**Cost Breakdown** draws the cost as proportions and subtotals **cost to build** separately from
**cost to sell**, because the fee and tax are only paid on listing — which is also what lets the sell
band disappear entirely in Stage H. Materials and child builds do not overlap:
`estimatedMaterialCost` substitutes a child's own unit cost for the market price rather
than adding to it, and recurses, so a linked material contributes nothing to the market-priced line.
Install cost on this panel is this job's slots only. Archive figures render here as a range bar placing
this build within previous builds, and a whole-build **vs last build** figure beside it. The
per-component column waits on the API serving the split it already stores — § Known limits.

**Returns** leads with the net return and three normalisations of it — per unit, margin, return on
outlay — then both exit routes at equal weight, then break-even and the previous-build range as context
rows, then the ledger behind a disclosure. Colour marks sign only. The net return it leads with is the
route the account says its output leaves by — `applicationSettings.defaultPricing.selling.exit`, read
through `useJobSellingContext` — so a player who sells into buy orders is not led with a listing's
margin and a broker fee they never pay.

**The sale location and its rates render here**, as a block inside Returns. At a preset hub it shows
every subtraction — base, less Broker Relations, less each standing — because those come from the
player's own character and seeing them is what makes the figure trustworthy. At a citadel it is one
line and a sentence saying Broker Relations does not apply, since the absence of working is itself the
information. The block names the character it is quoting, and where the location is a citadel it says
the figures are priced on that citadel's own orders.

**The block chooses the location and the seller, writing to `build.sellerCharacter` and
`build.saleLocationID`** — Stage L. Both are nil on
a job that sells the usual way, and one link puts a job that has departed back on the account's
defaults. The add-a-citadel form is the custom-structure work's throughout.

**Archive figures are one query, three placements.** `useAccountTotalsQuery` already runs on this stage
for the current type id. The Build History panel keeps the cost-over-time chart and the output
destination split; the range bar, the comparison column and the previous-build context row read the
same result. Absent history — a first build, or a signed-out user — each simply states that and drops
the comparison.

**Done when:** one pricing model is in effect at a time and the panel says which; fee and tax appear in
their own band; the archive comparison renders where history exists and is absent without it.

## Stage G — Speculative child jobs

**Behavioural change, one of two.**

`buildSingleChildJobPreview` already builds a real speculative job on popover open, and “Mark For
Creation” commits an object that already exists in memory. This stage builds it for every buildable
row, so the Δ is populated before the player chooses.

- The five buttons and the branching in `buttonSelectionLogic.jsx` collapse into **one chip with two
  states plus an undo**. Build promotes the speculative job; Buy discards it.
- In a group, the speculative job is **seeded from the job it would link to** plus this parent's extra
  quantity, so confirming updates the existing job's runs and links it in one action rather than
  offering “create” and “link” as separate buttons. Costing consults `findMaterialJobInGroup` and takes
  the group's own job as the speculative entry rather than building a second one that makes the same
  thing, so the Δ on the row is the figure confirming would actually use.
- Speculative jobs live in **`speculativeChildJobs`**, a slice of their own beside `temporaryChildJobs`
  and excluded from persistence the same way. An earlier draft of this stage put them in
  `temporaryChildJobs`; that map is written by `MARK_CHILD_JOBS_FOR_ADDITION` and read by
  `resolveMaterialChildJobs`, so an entry in it makes a row `isLinked`, which makes its plan **Build**
  and marks the job modified. Every buildable row would have read as planned-to-build the moment it was
  costed — the exact state § The offer strip cannot fire until Stage G describes, kept rather than
  broken. Two maps is what lets a row be priced and still on Buy.

**Cost, and the mitigation.** A speculative build per buildable material means `buildJob` plus
blueprint and ESI hydration for each, where today there are none. It must not fire on page load: rows
render with Δ pending, and a control on the summary strip costs them on demand. This follows the
existing rule about not auto-fetching expensive data most visitors do not need. It adds no market
querying — a speculative job prices its materials from the same batched server figures as everything
else.

**Depth.** One level by default, with the drawer able to expand deeper on request, and the row stating
that its build price values sub-materials at market.

**Done when:** a buildable row can be compared without committing; promoting and discarding both work;
nothing is built on page load; a signed-out user's behaviour is unchanged from today.

## Stage H — Jobs with parent jobs

**Behavioural change, two of two.**

`activeJob.parentJobs` is populated and `actions.getCurrentParentJobs()` already merges pending edits;
Production Stats already walks the parents to total what they require.

- Revenue, margin, break-even, broker fee and sales tax are **removed** when the job has parents. The
  output is committed and never listed, so quoting a sale price invites a player to read a profit that
  does not exist.
- The headline becomes **cost contributed to the parent**, with the buy-at-market alternative beside
  it — the same two figures the parent's Δ column compares, from the child's side.
- Cost Breakdown keeps the build band and drops the sell band.
- **Partial commitment** is the honest edge case: a job producing more than its parents need has a
  sellable surplus, so show both, with the sale figures scoped to the surplus. Siblings are subtracted
  before the surplus is worked out — where two children feed one parent, the second only owes what the
  first does not already cover, and charging it the whole requirement would report a surplus of nothing.

**Done when:** a job with parents shows no sale figures; a job with a surplus shows sale figures for
the surplus only; a standalone job is unaffected.

## Stage I — Skills as a model

- Three groups: **required to build**, **shortens the job**, **affects selling cost**. A skill may
  appear in more than one, and Industry is usually in the first two.

  The middle group was drafted as "affects build cost" and is not: no skill reduces what a build costs
  in ISK. Materials come from the blueprint's ME and the structure's rigs, and install cost is the
  system index over the job's value. What skills move is **time** — `calculateTimeForSetup` gives every
  required skill 1% a level, and applies Industry, Advanced Industry or Reaction once over the whole
  job. Naming the group for cost would have put a claim on screen that neither the app nor the game
  supports.
- **Broker Relations and Accounting** join the panel, because they are inputs to the fee and tax
  figures Cost Breakdown now shows. Where the sale location is a citadel, Broker Relations is shown as
  **not applied here** rather than hidden — it does not reduce a structure owner's rate, and a skill
  silently vanishing from a panel reads as a bug. Accounting applies at every location.
- **Standings** are worth naming beside the skills on the station path, since they move the fee the
  same way and are read for the same character. Changing the selected character changes the fee.
- A **what-if mode**: a level is tweaked and every dependent figure re-derives — fee, tax, net return,
  break-even. It answers whether a skill is worth training for what this player actually builds.

  It needs no build cost to do it. A market skill moves the charges and nothing else, so the return
  improves by exactly what the charges fall by and break-even falls by that over the units sold. The
  rate is recomputed from the working the fee already came with, standings intact, rather than fetched
  again — the standings are the same character's whatever level is imagined.

**No training times.** Time-to-level depends on attributes and implants, neither of which the app
reads. A short row states levels short; the what-if figures answer the worth question honestly.

**What-if state is local and never persisted.** It belongs in component state, not on the job document,
and must not leak into Cost Breakdown or Returns — otherwise a player returns later and reads a figure
that was never true.

**Signed out:** the *required* group renders from `activeJob.skills` with the levels column absent.
The panel is signed-in only today; this makes the requirement readable without an account.

**Done when:** the three groups render; what-if re-derives the dependent figures; nothing is persisted;
the signed-out path shows requirements.

## Stage J — Mobile layouts

The materials table is the only element that genuinely cannot survive a full-width stack; everything
else is already a vertical arrangement.

- Materials becomes **cards**: name and chip on one line, the four figures on the next.
- Both popovers become **bottom sheets**, which also fixes the current centre-anchored source popover
  being unusable at 360px.
- Figures shorten; labels never truncate. Full values stay available on tap.

**Done when:** every panel is usable at 360px; no label is clipped; the order type picker and the drawer
both open as sheets.

## Stage K — A default market character in application settings

**The character that sells is not the character that builds.** Broker Relations, Accounting and the
faction and corporation standings that reduce a station's fee live on whoever lists the order, and it
is ordinary play to keep a dedicated trading alt while manufacturing runs elsewhere. Reading the fee
from the job's setup therefore does not merely pick a different character — it usually picks one with
no market skills at all, quoting the untrained 3% and 7.5% as though they were the player's and
understating every margin the stage shows. The figure looks plausible, which is what makes it worth a
stage of its own rather than a guess buried in a hook.

`Functions/MarketOrders/sellerCharacter.js` is already the single accessor for who sells, standing in
with the account's main until a choice exists. This stage gives it something real to read, and is a
change to that one file on the reading side — the same shape the sale locations use.

### It follows the reprocessing default exactly

`ReprocessingSettings.DefaultReprocessingCharacter` already solves this shape — a nullable character
hash on application settings, chosen from a picker in the settings page — so this is a second instance
of a settled pattern rather than a new one.

| Piece | Reprocessing | This stage |
|-------|--------------|------------|
| Stored field | `DefaultReprocessingCharacter *string`, `omitempty`, nil by default | `DefaultMarketCharacter *string`, the same |
| Where | `models.ApplicationSettings` | The same document, beside the other market defaults |
| Store default | `null` in `applicationSettings/core.js` | The same |
| Hydration | Falls back to the account's main when absent | The same |
| Serialisation | Written only when set | The same |
| Setter | `setDefaultReprocessingCharacter` in `applicationSettings/preferences.js` | `setDefaultMarketCharacter` |
| Picker | `Styled Components/Select/users` (`AssignUsersSelect`) | The same component |

The one deliberate difference is placement in the settings page. Reprocessing has its own tab because
it configures a calculation with several knobs; a market character is one field belonging with the
market defaults already on **Job Settings** — `defaultMarketLocation`, `defaultOrderType` and
`defaultCitadelBrokersFee` — so it goes there rather than opening a tab holding a single select.

### Account, not planner

`ReprocessingSettings` sits on both `ApplicationSettings` and `planner.Settings`. The market character
goes on the account document **only**, for the reason § Handed to the custom-structure work gives for
keeping a `CharacterHash` off a saved citadel: a character hash is personal, and a planner is shared.
A planner-level seller would quote every member the rates of a character most of them cannot use.

Account-level means each member of a shared planner reads the same job through their own seller's
skills and standings, and sees a fee they would actually pay. That is the intended behaviour, not a
side effect.

### No schema bump

An absent nullable field decodes to nil, which is the value the default already carries, so nothing
needs filling and `documentschema.Upgrader.ApplicationSettings` gains no step. The upgrader exists for
fields that must be *populated* on read; this one is correct empty. `ApplicationSettingsSchemaCurrent`
stays where it is.

### The work

- Add `DefaultMarketCharacter *string` to `models.ApplicationSettings`, beside the other market
  defaults, and leave `DefaultApplicationSettings` returning nil for it.
- Default, hydrate and serialise it in `Zustand/applicationSettings/core.js` the way the reprocessing
  character is, including the fall back to the account's main when nothing is stored.
- Add `setDefaultMarketCharacter` to `Zustand/applicationSettings/preferences.js`.
- Render an `AssignUsersSelect` for it in `Components/Settings/Standard Layout/jobSettingsFrame.jsx`,
  saving through `scheduleDebouncedApplicationSettingsSave` as its neighbours do.
- Have `sellerCharacter.js` read the stored hash, keeping the main as the value when none is set and
  keeping `isDefault` true in that case, so the rate block goes on saying when it is standing in.

**Done when:** a player can name the character their rates are quoted for; the Returns rate block names
that character and stops saying it is standing in; a character removed from the account falls back to
the main rather than quoting a character who is gone; and nothing on a shared planner reads another
member's seller.

## Stage L — A per-job selling override

Most jobs sell the usual way. Some do not: a batch built for a different market, or handed to a
different alt to list. Stage K settles what the usual way is; this stage lets one job say otherwise.

### It does not go on the setup

`JobSetup` is the obvious home — it is the existing per-job place a `CharacterHash` lives — and it is
the wrong one. A setup describes **how the item gets made**: the character running the job, the
structure and its rigs, the runs, the system index. Where the output goes afterwards is a different
moment in the job's life.

The shape makes the point better than the principle does. A job can have several setups — different
characters, structures and run counts all contributing to one job — but the finished output is sold
once, as a batch. A seller on a setup would be per-setup, and there is no answer to which of three
setups' sellers applies to the single stack of items that comes out.

So the override lives on the job's build, beside the setups rather than inside one, as two nullable
fields on `JobBuild` (`services/shared/models/job.go`):

```go
type JobBuild struct {
	...
	SellerCharacter *string `json:"sellerCharacter,omitempty" bson:"sellerCharacter,omitempty"`
	SaleLocationID  *string `json:"saleLocationID,omitempty" bson:"saleLocationID,omitempty"`
	...
}
```

```json
{ "build": { "setup": {}, "materials": {}, "sellerCharacter": "<CharacterHash>", "saleLocationID": "amarr" } }
```

It was first built as a nested plan on the job's selling block, `build.sale.plan`. job-document-drafts'
reshape removed `build.sale` and lifted the two fields onto `build`
(`services/core/commands/reshape_job_document.go`), and the meaning did not change. The SPA holds the
job as plain data: `Functions/Job/jobDocument.js` reads `build.sellerCharacter` and
`build.saleLocationID`, and still falls back to `build.sale.plan` for a document written before the
reshape release has run. Removing that fallback is an item on job-document-drafts' release list.

`SaleLocationID` is a saved citadel's id or a market source id — whatever `resolveSaleLocation`
already accepts — so this stage adds a stored choice and no new resolution.

### Both fields, because it is one decision

A build sold by a different character is usually sold in a different place too, which is what makes
these one override rather than two. The seller and the location are chosen together on the Returns
rate block, which is where a player is looking at the rates when they notice the defaults are wrong
for this job.

### It is an estimate, and nothing downstream depends on it

The override moves one number: the estimated fee and tax, and therefore the estimated return. When the
job actually sells, the Selling stage links **real market orders from ESI**, and those carry their own
character, location and prices. That is what happened, so that is what the job records — the plan-time
choice is superseded rather than reconciled against.

This is why the stage needs no authority rules. A player may plan one thing and do another; the stored
selection never has to agree with the eventual sale, and nothing reads it once real orders exist.

### On a shared planner, each member reads it through their own characters

A stored seller resolves against the characters of whoever is reading. If the named hash is not one of
theirs, their own default applies.

That is not a compromise — it is the only computable answer. Broker fee needs the character's Broker
Relations and their standings with the station's faction and corporation, and those come from an ESI
scope only that character's own account holds, so no member can work out another member's fee at all.
The figure a member wants is the one that applies to them.

**`JobSetup` has the same problem and this stage does not fix it.** `selectedCharacter` is a plain
account-scoped hash from when a planner belonged to one account, so on a shared planner it frequently
names a character the reader does not hold. Setups need a redesign for that, which is
[shared-planners](../shared-planners/plan.md)' ground rather than this project's; it is recorded here
because Stage L adds a second account-scoped hash to a shared document and should not be read as
setting a precedent that the first one is fine.

### No schema bump

`JobBuild` carries two nullable fields. An absent field decodes to nil, which is exactly "no override",
and both are omitted when nil — nothing needs filling, so `documentschema.Upgrader.Job` gains no step
and `JobSchemaCurrent` stays where it is.

### The work

- Add `SellerCharacter` and `SaleLocationID` to `models.JobBuild`, and read and write them in
  `Functions/Job/jobDocument.js`; `setSellingPlan` in `Edit Job Hooks/jobCommands.js` is the command
  that sets them.
- Resolve both through the accessors that already exist: `sellerCharacter.js` takes the job's hash
  ahead of the account default, `resolveSaleLocation` takes the job's location id ahead of it.
- Put the two pickers on the Returns rate block, which until now only states the location — § Stage F
  records that the picker was left out for want of somewhere to write the choice, and this is that
  somewhere.
- Fall back to the reader's own default when the stored hash is not one of their characters.

**Done when:** a job can name a seller and a sale location of its own; clearing either returns it to the
account default; a job that names neither is byte-identical on the wire to one written before this
stage; and a shared planner's member reading a job whose seller they do not hold sees the rates for
their own default seller.

## Stage M — What a child job actually covers

A child job is sized to the parent's requirement when it is created and not again until the parent is
closed — and only then when `enableAutomaticJobRecalculation` is on. Every change to the parent's runs,
efficiency or setup therefore leaves its children producing the wrong amount, and the stage said
nothing: the requirement was costed at the child's per-unit rate whatever the child produced, so a
child making half of what was needed cost exactly as much as one making all of it.

### The cost was an assumption presented as a figure

A material's cost came back as the child's cost per unit and the parent multiplied by
`material.quantity`. Extrapolating like that is right when the job is going to be resized and a
fabrication when it is not, and nothing distinguished the two. The same loop also charged
`unitCost × the whole requirement` **per contributing job**, so a material built by two child jobs cost
twice what it should — `childJobCoverage` settles that at the row, and the walk underneath it now
spreads several children over their combined output rather than charging each in turn.

### Three cases, because the answer depends on what happens next

| The child job is | What happens to it | How the shortfall is costed |
|------------------|--------------------|-----------------------------|
| Not committed yet | Resized to the requirement when it is committed | At the child's own rate. Nothing is assumed — committing makes it true |
| Committed, automatic recalculation **on** | Resized when the parent closes | At the child's own rate, **stated as an assumption** |
| Committed, automatic recalculation **off** | Never resized | The covered part at the child's rate, the rest **bought at market** |

`Functions/Groups/childJobCoverage.js` holds the model: it allocates the requirement across the
contributing jobs once — which is what fixes the sibling double-count — and reports what they cover,
what they fall short by, and which of the three ways the difference was costed.

The uncommitted case is a promise the panel makes, so `finaliseCreatedChildJobs` keeps it: committing a
single child job resizes it to the requirement first. Two cases are deliberately exempt. Several jobs
producing one item divide the requirement between them, so resizing each to the whole of it would
multiply the output. And a job the **group** already runs is linked rather than built, and may already
be feeding another job in the group — sizing it to one row's requirement would take that job's supply
away without either of them being told.

A row that is both short and partly paid covers what is still needed from the child jobs first: the
jobs produce what they produce whatever was bought separately, so the paid units come off the shortfall
rather than off the build.

### Where it surfaces

The drawer states the shortfall in words as a warning, replacing two unlabelled figures a reader had to
diff by eye. Cost Breakdown carries it in the bands: a bought shortfall lands in **Materials bought at
market** and says so, and a build line covering more than its jobs produce says it assumes a resize on
close.

The row carries a **shortfall tag** beside its plan chip, naming the affected jobs in its tooltip, and
takes the same accent stripe a row that is cheaper to build takes. The drawer and Cost Breakdown both
require an action to reach — opening the row, or reading the cost table — and a player with thirty
materials has no reason to open the one that drifted. The fact belongs where the list is scanned; the
detail stays where there is room for it.

**Done when:** a child job that no longer covers its material says so; the cost splits or extrapolates
according to the account's recalculation setting; committing an uncommitted job sizes it to the
requirement; and a material built by two child jobs is costed once.

## Stage N — Where a job sells from, and the figures behind the fee

Three faults in one block, found by reading the rate block against what it claimed.

### The list did not say which kind of location it was offering

Citadels and NPC stations were one flat list. They are not interchangeable: a citadel charges the rate
its owner set, and a station charges one derived from the seller's own skill and standings, so which
kind a row is decides how the fee beneath it was worked out. They are now two groups.

The account default was a **separate entry** above a list that also contained it, so the same location
appeared twice and choosing it pinned the job to it. The default is now the item it resolves to,
marked; choosing it writes nothing, so a job that never departed from the default moves with it.

An NPC station could be chosen and then quietly ignored: `resolveSaleLocation` matched a named id only
against saved citadels, so a station id fell through to the hub argument — the hub the *materials* were
priced against. Picking Amarr while pricing from Jita sold from Jita.

### The faction standing never resolved

A station reports the race that built it — Jita 4-4 is `race_id: 1` — while the standing that reduces
its broker fee is held against that race's faction, Caldari State, 500001. The lookup matched the race
id against the standing list, found nothing, and quoted **every seller at every NPC station** as having
no faction standing. `Hooks/React Query/World/raceFactions.js` resolves race to faction through
`/universe/races/`, whose `alliance_id` field carries the faction id, and the match now also requires
the standing's `from_type`, since a faction and an NPC corporation can hold the same id in different
categories.

The fixtures had encoded the same wrong assumption — `race_id: 500001` — which is why no test caught it.
They now carry the shapes ESI returns.

### A figure that could not be read was reported as zero

`getStandings` turned every failure into `{ data: [] }` — a 403, any 5xx, a network error, a missing
`CharacterID`, even a 304 — and React Query cached it as a **successful empty result**. The block then
stated "no standing with them", which is a claim about the seller the app had no basis for.
`getSkills` did the same with `{}`, reporting "untrained".

Both now throw, and answer a 403 with `data: null` rather than an empty collection. `getSellerSkills`
and `getStationStandings` return an `unknown` flag that the fee terms and the sales tax working carry,
and the block says **could not be read** rather than naming a zero.

The trap worth remembering: `getCachedCharacterSkills` and `getCachedCharacterStandings` hand back an
empty collection **while loading and again after an error**, so the collection cannot be inspected to
tell the three states apart — the query's own `isLoading` and `isError` have to be read. A first
attempt at this fix checked only whether the collection was an array and was inert against both cases
it existed for.

**Not addressed:** the app holds no record of which ESI scopes it needs or whether a character's token
carries them. A token authorised before a scope was added to `EVE_SCOPE` keeps failing that endpoint
until the character is re-linked, and nothing detects or reports it. This block now says a figure could
not be read; it cannot yet say why.

**Done when:** the two kinds of location are distinguishable and separately selectable; the account
default is the marked item rather than a second entry; a station's faction standing resolves; and no
figure the app failed to read is reported as a zero.

### Checked against real sales

The formulas were run against the live snapshot rather than only against fixtures —
[measurements/selling-charges-against-stored-jobs.md](./measurements/selling-charges-against-stored-jobs.md)
carries the numbers. Sales tax is checkable against evidence the app did not produce, since stored
transactions carry what EVE actually charged: the 7.5% base and the 11%-per-level Accounting reduction
reproduce 2025 and 2026 figures exactly, while earlier years show the different bases in force at the
time. Broker fees fit the published formula on 99.1% of orders that were never repriced; a repriced
order cannot be checked at all, because the fee was charged on a value the document no longer holds.

Two things worth carrying forward: the 100 ISK minimum has never applied to a real sale, and the share
of fees showing any standings contribution collapses in 2026 — the shape of standings having stopped
resolving, which is what the faction-lookup fix addresses.

## Stage P — Output, and the parent jobs inside it

**SPA.**

`productionStats.jsx` is the last `ContentPanel` in the left column and the only panel on the stage with
no title. It prints four rows — items per run, per slot, for the selected setup, for the whole job —
which are three multiplications of one number, and then the figure a reader came for: **is this enough
for the jobs above it?** That one is last, is carried only by a red tint on two lines, and renders at
all only when the job is *in a group*. **6,457 planning-stage jobs have parent jobs and are not in a
group**, and on every one of them the requirement is not drawn.

Worse, it is the fourth panel on this stage to answer that question and the only one that answers it
itself. `useJobCommitment` exists because three panels must agree — its own comment says "two of them
deriving it separately is how they come to disagree" — and this panel calls `resolveParentRequirements`
directly. Moving it onto the hook removes the second rule and fixes the blind spot in one change,
because `parentCommitment` keys on *having parents* rather than on being in a group, and shares the
requirement across siblings in a stable order.

The panel becomes **Output**: what the job produces, how much of that is owed, what is free to sell, and
the derivation as one line rather than three rows. `calculateTimeForSetup` returns one slot's duration
for the *selected* setup, so the time figure states the **longest setup** and names the assumption that
slots run side by side.

**The parent jobs come here**, out of the header. `Linked Job Badge` draws a centred heading, an
absolutely positioned `＋` and a 200–300px nested scroll region on every job including the 7,325 with no
parents at all, and its chips carry a name and a `✕` and no figures — though `resolveParentRequirements`
already reads each parent's requirement and `parentCommitment` already allocates against it. Each parent
becomes **one row** in Output's own list: a name, what it needs, whether it is covered, and a muted
unlink. Up to six are shown and the rest fold behind a counting line, so the panel is bounded at seven
lines of parents whether a job has seven or twenty-two. Sizing a job against its parents is a planning
decision, which is why the rows live on this stage; the header keeps a summary line so the fact is never
off screen.

`ParentJobOptions` lists each candidate's setup count and total output — facts about *that* job. What
decides a link is how many of *this* job's item the candidate needs, which the picker already holds: it
finds candidates by testing `job.build.materials[String(itemID)] !== undefined`.

**Wire compatibility:** none. No stored field changes; `parentJobs` keeps its meaning and the link
intents keep theirs.

The counts above, and the distribution the six-row fold is set against, are in
[measurements/parent-jobs-and-stage-locks.md](./measurements/parent-jobs-and-stage-locks.md) with the
queries and the database they ran against.

**Done when:** the panel reads `useJobCommitment` and nothing on the stage derives the commitment twice;
a job with parents states its requirement whether or not it is in a group; the parents are rows in
Output with the fold at six; the picker states what each candidate needs; and `Linked Job Badge`'s
heading, floating `＋` and nested scroll region are gone.

**As built (decided 2026-10-05).** The design's Output extras were built: the longest-setup line names
the slots it assumes — "6 slots side by side — the wait if every one can start at once" — and the
sentence under the headline says "Taking runs off any setup leaves the parents short." when the parents
are covered exactly (without "any setup" on a job with one) and "1,200 owed, 300 spare." when there is spare. The design's ⋮ menu on Output was
**not** built: the design never says what it holds. The header's summary line counts the parents and
names up to three, largest need first, each a link that opens that job through `useOpenJob` — "1,200
for 5 parents (Name, Name, Name, +2 more) — covered exactly · 3 setups". The fold shows seven rows whole
and folds from eight, since a fold of a single row is not worth a press.

## Stage Q — The page frame, and the controls that manage the job

**SPA.**

`editJob.jsx` navigates stages with a vertical MUI `Stepper` whose active `Step` holds the whole stage,
indented behind the rail that draws the connector. **A stepper states a sequence with completion, and
`Functions/Job/editing/jobStepNavigation.js` implements neither**: `canJumpToJobStep` permits any stage from any stage,
refusing only the current one, an out-of-range index, and the final stage when it is locked. Tabs say
what is true — five views of one job — and read the same helpers and set the same `jobStatus`.

Stage labels come from `applicationSettings.jobStatuses` over `JOB_STATUS_CATALOG`'s defaults, so the bar
carries arbitrary text: 34 of 4,822 accounts rename a stage, to labels up to 29 characters against a
median of 8. No tab is labelled by position, because a renamed stage makes "step 3" meaningless.

`isFinalStepLockedForJob` is `includedInGroup && !isReadyToSell` — **19,301 of 31,953 jobs**. Today that
is a disabled bead with no reason given. Stating the reason is what exposes the rest: 16,413 of those
have parents, and `SellGroupJobButton` returns `null` for a job with parents, so the lock cannot be
lifted — which is probably right, since a child's output is committed, and the wording should say so
rather than imply something is unfinished.

**Four navigation controls become one labelled pair.** The step labels, the in-content arrows, and the
two viewport-fixed copies driven by `useIsScrolledOutOfView` all move the same two ways. Sticky tabs
make the floating pair pointless, so they and their refs go — and so does the hook: `editJob.jsx` is
the only caller of `Hooks/GeneralHooks/useIsScrolledOutOfView.js`, so the hook and its test are deleted
rather than kept for a caller nobody has written. The rules section and the topic doc that teach it go at
promote, per [promote/README.md](./promote/README.md) § Live docs this project deletes. What
remains names its destination — *Continue to Purchasing →* — which survives a renamed stage where an
arrow tooltip reading "move to next step" does not.

**The header controls.** Four icon buttons sit in one row: the item tree at `size="small"`, and Delete,
Close and Save identical at `size="medium"`. Three of them leave the page and each does something
different with the reader's changes, and **none of them asks**. `DeleteJobIcon` calls
`deleteJobsFromPlanner` straight out of `onClick`; `CloseJobIcon` abandons every change; the
unsaved-changes dialogue is wired by `useEditJobLeaveConfirm` to job-to-job navigation and lock
hand-over, not to these buttons, and `useWarnBeforeUnload` catches only a browser unload. They become
labelled controls weighted by consequence, with the destructive one outlined and set apart, and a
confirmation that names the job and what its parents lose.

`useJobModified` exists and nothing renders it, so the header states whether there is unsaved work.

**Save closes the job, and a save point is separate work.** `saveOpenJob` calls `closeActiveJob`, which
persists *and* ends the session — and `applyParentChildChanges` runs inside it, so the link intents are
applied at that moment. A Save that keeps the page open needs `closeActiveJob` split into a persist step
and a session-end step. **Decided: this project relabels and does not split.** The control reads
**Save & close**, which is what its tooltip already says. A save that keeps the page open must still
apply the link intents whole or not at all, which is edit-session work rather than frame work, and it
is not scoped here.

**Ordering:** independent of every other stage. `EditJobStepContentSelector` switches on `jobStatus`
alone and no stage panel imports anything from `editJob.jsx`, so this can land before, after or beside
the panel work. The delete confirmation is worth taking first and alone: it is a few lines, it needs
nothing else, and until it lands a mis-aimed click destroys a job with no way back.

**Wire compatibility:** none. `jobStatus` is still the stage and tabs still set it through
`setJobStatus`. The one field the frame could shed is `layout.esiJobTab`, which belongs to
[building-stage-panels](../building-stage-panels/plan.md) § Stage A.

The lock counts and the stage-name lengths are in
[measurements/parent-jobs-and-stage-locks.md](./measurements/parent-jobs-and-stage-locks.md).

**Done when:** the stepper is a tab bar reading the same navigation helpers; the locked final tab states
why it is locked for that job; the floating arrows are gone and one labelled control names its
destination; `useIsScrolledOutOfView.js` and `useIsScrolledOutOfView.test.jsx` are deleted, with no
caller left anywhere; the header controls are labelled and weighted, Save reads Save & close, Delete
confirms, Close asks when there is unsaved work, and the header states whether there is any.

**As built (decided 2026-10-05).** The header weights follow the design: Item tree and Close outlined,
Delete outlined in the error colour, Save & close filled when there is something to save, and Continue
filled at the foot of the stage. The locked final tab's reason counts the parents — "Its output is
committed to its 3 parent jobs, so it is not sold on its own." Back and Continue sit inside their own
error boundary, and Close is disabled while it is leaving.

## Stage R — Setups

**SPA.**

Two panels describe one thing. `Setup Panel/jobSetups.jsx` is **Build Setup**, a `ContentPanel` of
cards in the wide column; `Edit Setup Panel/editJobSetup.jsx` is an untitled `ContentPanel` in the
narrow column that edits whichever card `layout.setupToEdit` names. A reader picks a card in one column
and edits it in the other, and the selection is shown only as a mark on the card.

The cards repeat structure, system, rig, tax and character on every tile, and that is the wrong thing to
repeat. Of the 2,723 jobs in the snapshot with more than one setup, 2,554 — 94% — build every setup at
the same facility; what differs between two setups is nearly always the run count, which the card gives
two words on one line among six. The archive holds jobs with 9, 18 and 30 setups, so the list has to
survive well past the five the live documents reach.

The two become one **Setups** panel on the app-shell surface, in the wide column:

- **The facility is stated once, above the list.** It is derived, not stored: the setups are compared
  on structure, system, security, both rig slots and tax, and where they agree the line states it once
  and those fields leave every row. Where they do not, the line states the majority — "Three of four
  build at" — and the setup that departs says so on its own row, with what it changes. The name is
  resolved the way `JobSetupInfoFrame.jsx` on the Purchasing stage already does it: the player's
  `CustomStructure.name` where the setup names one, otherwise the size class from `structureID`, with
  the system beside it.
- **Each setup is a row, and the run count leads**, because it is what tells the rows apart: runs ×
  slots, then the character, ME, TE and the time a slot takes, then the items it contributes and its
  install cost. A footer totals the items and the install cost.
- **Install cost per setup is a column.** `calculateInstallCostfromSetup` is on the card today with the
  per-job figure behind a tooltip. A setup at another structure costing 666,512 less for the same nine
  runs is the thing a player would act on, and comparing hover states is not comparing.
- **A row opens in place.** The editor sits under the row it edits rather than in the other column, so
  the selection needs no mark of its own. *As built, it has one* — see § Left open by the design. Its fields are the ones `editJobSetup.jsx` carries today, grouped as
  three decisions rather than a flat grid in declaration order: **how much** (runs, job slots, ME, TE),
  **where** (the saved structure, then size, security, **Rig 1 and Rig 2**, system, facility tax, the
  militia fields where they apply, and the system-index override), and **who** (the character). Where a
  saved structure answers the facility, those fields are shown as facts rather than asked —
  `setupShowsManualStructureFields` is already the condition. The design predates the second rig
  picker and the militia fields; both are carried, with `useRigSlots` keeping the two-slot and conflict
  rules it holds today.
- **Add is a header action.** Today it is an `IconButton` positioned absolutely over the panel's corner,
  overlapping the title at narrow widths; `AppShellPanel` already takes an `action` opposite the title.
- **Delete is a quiet row control.** Today it is a kebab item, "Delete Active Setup", which acts on a
  selection the menu does not show and refuses with a snackbar when one setup is left. It becomes a
  muted ✕ on the row, and on the last remaining setup it is **not rendered** rather than present and
  refusing.

**Identical rows are not grouped, deliberately.** The Purchasing and Building designs group identical
rows, because there a setup is a readout. Here each row is the editable object itself, and a grouped row
makes it ambiguous what an edit writes to; the grouping key would also have to include the character,
which is exactly what tells two 714-run setups apart. Sameness is handled by lifting what is shared into
the facility line instead.

**Mobile.** The row's figures move under the run count, and the ✕ moves into the opened editor rather
than sitting under a thumb. On a phone the editor opens as a sheet titled by the setup it edits, with
Delete at the foot, away from the handle.

**Left open by the design**, to settle while building: whether one setup or several can be open at
once; whether the facility line is pressable to change every setup's facility at once, a bulk edit the
app has nowhere else; and whether a setup at a structure the rest of the job does not use deserves more
than its line, given 169 jobs in the snapshot are in that state. **All three settled on 2026-10-05:**

- **One open at a time.** Opening another row folds the first editor away. The open row is the panel's
  own state, kept apart from the selected setup (`layout.setupToEdit`), which the stage's other panels
  read; folding an editor away leaves the selection where it was. So the selection does need a mark
  after all: the selected row carries the shared open-row tint (`ExpandableRow`'s `openRowBackground`),
  because a setup can be selected while its editor is shut.
- **The facility line is a statement, not a bulk edit.** Nothing in the app edits every setup at once,
  and this panel does not add one.
- **A setup elsewhere gets its own departure line and the missing-structure notice, nothing more.**

**As built, beyond the bullets above.** The design's help text was built. How much notes the blueprint's
run limit — "200 runs is the most this blueprint takes in one slot.", from `job.maxProductionLimit`.
Where explains the system index — "Off, the index for Rens is used — 4.12% right now. On, you type the
figure the game shows you." / "On — 3.50%, as you typed it. Clearing the box goes back to the figure for
Rens." Who names the time a slot takes. The fields are labelled *Runs*, *Job slots*, *Use my own system
index* and *Your system index (%)*. The Where fields run structure, size, security, Rig 1, Rig 2,
system, tax, as above, and a saved structure's facts include its system. The facility line's counts are
words through `numberWord` — "All three build at", "Two of three build at" — and it repeats the size
only when a saved structure names the facility. Each row's install cost and the footer total are one
figure, `setupInstallCost` in `Functions/Installation Costs/installCosts.js`, which
`sumSetupInstallCostEstimates` totals.

**Wire compatibility:** none. Setups keep every field they have, and `layout.setupToEdit` keeps its
meaning — the selected setup, the one the stage's other panels read. Which row's editor is expanded is
the panel's own state and is not stored. No prepareRelease step.

**Done when:** one Setups panel on `AppShellPanel` with `paperSx={{ height: "auto" }}` replaces Build
Setup and the untitled editor on both layouts, and `Edit Setup Panel/` is deleted; the facility is
stated once with departures marked on their own rows; install cost is a column; a row opens its editor
in place with the fields grouped as how much, where and who, both rig pickers and the militia fields
included; Add is a header action; Delete is a row control absent on the last setup; identical rows are
not grouped; and `jobSetupCard.test.jsx`, `jobSetups.render.test.jsx`, `editJobMutators.setups.test.jsx`
and `planningLayouts.test.jsx` cover the new panel rather than the cards and the kebab item.
*`jobSetupCard.test.jsx` and `jobSetups.render.test.jsx` were deleted with the cards; their coverage
moved to `Setups/setupsPanel.test.jsx`, beside the panel.*

## Stage S — Blueprint Library

**SPA.**

`Blueprint Options/blueprintPanel.jsx` is a `ContentPanel` titled **Blueprint Library** holding a grid
of tiles. Every tile is a control drawn as a display: pressing one runs `applySetupChange` with
`updateMEValue` and `updateTEValue` on the setup being edited, with nothing on the tile saying so but a
tooltip, no confirmation and no way back. The two states a blueprint can be in — in use, about to run
out — are a three-pixel stripe in `yellow[800]` and `red[600]`, imported from the palette as literals
with black text fixed on top, so they are the same two swatches in both themes; a legend at the foot of
the panel teaches them. The grid scrolls inside a box of `{ xs: "370px", sm: "220px", md: "370px" }`,
tallest on a phone, where a scroll region inside a scrolling page swallows the flick.

The panel moves to the app-shell surface as **rows rather than tiles**:

- **Each row is a sentence**: ME and TE, then *Original* or *Copy · 6 runs left of 20*, and who holds it.
  That replaces the tooltip explaining what a parenthesised number means.
- **Status is a word, and the colour reinforces it.** *Running a job* and *Runs out* take the theme's
  `warning` and `error` rather than palette literals, so they follow the theme and neither depends on
  hue alone. **The legend is retired**: with the word on the row there is nothing left to teach.
- **Use is a named button.** Pressing it applies the blueprint's ME and TE to the open setup and says
  what changed — *Setup now at ME 10 · TE 20, from the copy with 50 runs left* — with an **Undo**
  beside it. That is the pattern the buildable chip in Materials & Sourcing already uses for the same
  shape of action, and the command already names its step, "use a blueprint you own".
- **The blueprint the setup is already on is marked** — *In this setup*. Nothing records which blueprint
  supplied the current ME and TE, but matching the setup's pair against the list is enough to mark it;
  where several match, the first is marked and the row says so. It answers whether one was already
  applied, which today has no answer.
- **No fixed-height scroller.** The list shows what fits and folds the rest behind a disclosure that
  counts them — *Show 2 more* — so it scrolls with the page. The design's "with lower research" was
  dropped: the list is originals first, so a researched copy can sit below a bare original. The header
  counts the blueprints no job is running on.
- **Reactions are titled Formula Library.** `reactionLayout.jsx` already groups by holder and counts
  stacks, because a formula carries no ME or TE, has no copies and restacks after use. Under a title
  calling it a blueprint, that correct behaviour reads as a missing feature; the rows stay counts with
  no Use control, and the title is what makes the absence read as right.

**Mobile.** Three rows and the fold, scrolling with the page, where the grid needed a 370px scroller to
show the same three.

**Wire compatibility:** none. Use writes the same `updateMEValue` and `updateTEValue` through
`applySetupChange` to the setup `layout.setupToEdit` names, which keeps its meaning. No stored field is
added — the mark is derived from the setup's pair. No prepareRelease step.

**Done when:** the panel is rows on `AppShellPanel` on both layouts; status reads as a word in the
theme's `warning` and `error`, and no `yellow[800]` or `red[600]` literal or legend remains; Use is a
named button whose confirmation carries an undo; the blueprint matching the setup's ME and TE is marked;
the list folds behind a counting disclosure rather than scrolling inside a fixed height; reactions are
titled Formula Library and offer no Use; and `manufacturingLayout.test.jsx` and `reactionLayout.test.jsx`
cover the rows. *Both were deleted with `Blueprint Options/`; the rows are covered by
`Blueprint Library/blueprintLibraryPanel.test.jsx`, and the running and running-out rule by
`Functions/Blueprints/blueprintJobState.test.js`.*

**As built (decided 2026-10-05).** The fold shows seven rows whole and folds from eight — four whole
and folding from five on a phone — since a fold of a single row is not worth a press. The header counts
the blueprints free to use, or for a reaction every formula held, and is hidden at nought. Loading and
errors come from both the blueprint collection and the industry jobs.

## Owed to the shared-planners release

**Invention entry ids were minted from the clock and are now uuids.** Two entries minted in the same
millisecond took the same id, and a row is removed by matching on it, so removing one removed both.
`models.InventionEntry` decodes either shape — a number is read as its own digits — so a document
written before the change still loads, and both kinds sit in one job without anything having to know.

**Existing rows want switching, and that rides the shared-planners window** rather than a migration of
its own: 184 archived jobs and 12 live job documents in the live snapshot carry numeric ids. Recorded
in [shared-planners](../shared-planners/plan.md) § What the other projects owe, because that project
owns the release that already stops traffic to rewrite documents.

## Wire compatibility

| Surface | Change | Compatibility |
|---------|--------|---------------|
| Stored document shapes | `build.sellerCharacter`, `build.saleLocationID` (Stage L) | **Additive.** Two nullable fields on `JobBuild`, both omitted when nil, so a job that names neither carries neither and no schema bump or migration is needed. Their move from `build.sale.plan` rode job-document-drafts' reshape, which is that project's migration, not this one's |
| Stored document shapes | `ApplicationSettings.DefaultMarketCharacter` | **Additive.** A nullable field; absent reads as not chosen, which is its default, so no schema bump and no migration — Stage K. Saved citadels remain the custom-structure work's, which owns that lane, its schema bump and its migration — § Handed to the custom-structure work |
| Stored document shapes | `InventionEntry.ID` (Stage N) | **Additive.** The field turns from an integer to a uuid string. `models.InventionEntry` decodes either shape, so a document written before the change loads unchanged and both kinds sit in one job; the id is compared only for equality on both sides. No schema bump. Rewriting the existing rows rides the shared-planners release — § Owed to the shared-planners release |
| Base rates and coefficients | Moved into `defaultValues.jsx` | **No wire surface.** SPA constants; a game change ships as a release, not a migration |
| `defaultCitadelBrokersFee` | Unchanged | **Compatible.** Kept for the Selling stage, and left alone here |
| `/api/v1/market-prices` | None | Unchanged. All four figures are already served |
| `layout.*` price overrides | None | Stage D is presentation over the existing shape |
| Job document — speculative children | None | Speculative jobs live in `speculativeChildJobs`, their own store slice, which is not persisted. They are kept apart from `temporaryChildJobs` because a job in that slice reads as linked, which would put the row on Build and take the offer away before it was accepted |

## Design reference

The visual design these stages build to — every panel on the app shell surface in both themes, the
stage in context, the mobile layouts, and the reasoning behind each — is the design proposal published
for this work: <https://claude.ai/code/artifact/9520969e-6359-4d76-8030-bdd7330f6c93>

It is a **design reference, not SoT**: where it and this plan disagree, the plan wins, and both are
superseded by live docs on promote. Sections worth reading before building the stage they cover:

| Section | Covers |
|---------|--------|
| §3–§6 | The four panels, each in light and dark on the app shell surface |
| §7a | The pricing order type picker and the four server price modes |
| §7b | The sale location: the station-vs-citadel rate block, the picker, the add-a-citadel form |
| §8, §9 | The two behavioural changes, drawn as before-and-after flows |
| §10 | Mobile layouts for every panel |

It also records two **rejected drafts** of the Returns panel — one that mixed a toggle, a ledger and
the exit routes, and one that led with a graded verdict word — both worth reading before rebuilding it,
so neither failure mode is repeated.

### A second design covers the rest of the stage, and the frame around it

The proposal above covers the panels **this project rebuilt**. A later proposal covers the ones it did
not, and the page frame both sit inside: <https://claude.ai/artifact/HtfuYNi9Te5xzEWwSsXg2w>

| It covers | Which this project |
|-----------|--------------------|
| Production Stats, rebuilt as **Output** | **§ Stage P** |
| **Parent jobs**, as rows inside Output rather than the header block | **§ Stage P** |
| The **page frame** — the vertical `Stepper` becoming tabs, the four navigation controls and the header icons | **§ Stage Q** |
| Build Setup and the untitled setup editor, merged into one **Setups** panel whose rows open in place | **§ Stage R** |
| Blueprint Library — rows rather than tiles, the colour legend retired | **§ Stage S** |

A third design draws on both: buying minerals as ore, in the reprocessing canvas — see § Handed on:
minerals bought as ore.

**Where the two disagree about a panel this project already built, this plan and the first proposal
win**, because that panel shipped. The later proposal only represents those panels; it does not
re-specify them. For Stages P, Q, R and S it is the reference, the same way the first proposal is for
Stages A–O. It was drawn before the Setup editor gained its second rig picker and its militia fields;
§ Stage R carries both, and where the design and § Stage R disagree, the plan wins.

**Every row of it is this project's.** The Setups panel and the Blueprint Library were first recorded as
outside this project, with a row of their own in the section task map pointing at the design. They are
now Stages R and S, so the separate row is gone and this project's row covers them; nothing in the
design is left without an owner when this folder is deleted.

The **stepper-to-tabs** change appears in the first proposal as well, and the question of whether it had
to land before the stage work could start was raised while this project was open and left unanswered.
It is answered now, and the answer is why taking it on here costs the landed stages nothing: the frame
touches `editJob.jsx` and `Linked Job Badge.jsx`, no stage panel imports either, so § Stage Q is
order-independent from every other stage in this plan.

### The offer strip fires once a row is costed

"Building N of M saves X" was built, tested and unreachable until Stage G, because a row only had a
build price once children were linked, and being linked made its plan **Build**.

A row only has a build price once child jobs are linked to it, and being linked makes its plan **Build**
— so no row is ever both priced to build and planned to buy, which is the state the offer looks for.
The two conditions are mutually exclusive by construction rather than by accident, and a test says so
next to the rule.

Stage G is what breaks the tie: a speculative job gives every buildable row a build price without
committing to it, so a row can be costed and still be on Buy. `onApplyBuildable` is declared on the
panel and implemented then, against the set `summariseSourcing` already computes.

Stage G breaks the tie with `speculativeChildJobs`: a row costed from one carries a build price and
stays on Buy, so it can be compared without being committed to. The strip renders nothing when there
is nothing to offer, which is still its designed behaviour — it is simply reachable now.

### Design fidelity

Checked against §3–§6 of the design reference. Each stage was landed on behaviour first — the figures
right, the words right, the states handled — and the **visual apparatus** that makes those figures
readable at a glance was missed on all four panels. It has since been built; what follows records what
each panel was owed and what was done about it.

**Materials & Sourcing (Stage E).** *Done.* The Δ column, plan chips, row accent stripe, footer and
order type select were already there; the **item icon** and the **Source column** have been added. The
source names the hub and which of the four server price modes the row used, and says **Price Entry**
where the figure came from a real purchase — the plan chip already says "Paid", and one row does not
need to say it twice.

**Cost Breakdown (Stage F).** The largest gap, and the panel is currently a table where the design is a
picture with a table under it.

- ~~The **stacked proportion bar** above the table~~ — mounted, with a tooltip per segment.
- ~~**Colour dots** on each component row~~ — added. Both read `costParts.js`, so a segment and its row
  cannot drift apart.
- ~~The range bar's **span**, **end ticks**, **labels row** and **note line**~~ — added to `RangeBar`,
  which now states a range rather than only a position. The scale is **wider than the range**, as the
  design draws it: mapping the range onto the whole track left the span covering everything, the end
  ticks on the ends, and a build cheaper or dearer than every previous one clamped onto an end, where
  it was indistinguishable from one that exactly matched the cheapest or dearest. That is the case the
  *outside* note exists for, and the bar could not show it.

  Its **size and placement** now match too. The design gives the range `flex: 1` with a 210px floor, so
  it fills whatever the headline leaves; it was capped at 260px inside a wrapper that did not grow, so
  it sat narrow against the right edge whatever the panel's width. `PanelHeadline`'s aside slot grows
  and right-aligns, which leaves an aside made of fixed tiles — Returns' three — where it was.

  The design's success colouring of the current-build marker is still declined: `RangeBar` states a
  position and no verdict, because a run of builds made in a poor market would make a bad benchmark
  read as a good one.
- ~~The **dashed "no archived builds yet" box**~~ — added. It replaces rendering nothing, because a
  first build is information: the estimate has nothing to be checked against.
- The **cost-over-time disclosure** was added here and then removed: Build History already draws that
  chart from the same query, and two copies on one stage is two places to look at one set of figures.
  `costOverTime.jsx` and `Disclosure`'s `onOpen` stay — Build History uses both.
- ~~The **build-where-cheaper / buy-everything toggle**~~ — added to the header. It is display-only:
  held in component state, never written to the job. A material already paid for is untouched by either
  model, being a record rather than an estimate. § Open questions still asks whether the model should
  reach the rest of the app.
- ~~**Extras** as a component row~~ — it now survives the zero filter and carries the invitation until
  there is a figure to state instead.
- The per-component **vs last build** column stays absent for the reason § Known limits gives — the
  design assumed the totals read already carried it, and it does not.

**Returns (Stage F).** *Done.* The headline sits on its own inset surface, the routes are captioned and
each names the price it was struck from and what comes off it, and break-even carries the headroom that
makes it worth stating — `calculateReturns` now returns both `unitPrice`/`deducts` per route and a
`headroom` against today's price.

The sale location is **stated** in the header rather than offered as the design's select: a job cannot
name its own location until Stage L gives the choice somewhere to be written, and a picker that cannot
save is a control in name only. It becomes a select there.

**Skills (Stage I).** *Done.* Level pips replace the bare "2 / 4" — a reader scanning a list of skills
is comparing shapes rather than reading arithmetic, and the shortfall is visible before the figures
are. Rows carry a wash and a left accent per state, and the group header states how much of the
requirement is met. An impact row says what a shortfall actually blocks, since "2 / 4" leaves the
consequence to the reader.

The pips are also the control: clicking one asks what that level would be worth, and clicking the level
already trained puts the question back. A level being tried is drawn in the primary colour rather than
success — it is not a state the character is in, and colouring a hypothetical green would read as
achieved. The panel header carries a **What-if** chip and **Reset** while anything is being tried, and
superseded figures stay struck through beside the ones replacing them, because the delta is the answer
and reading it off two panels is not.

What-if now covers the required skills too, not only the market ones, so raising a blocked skill
answers whether the job becomes runnable. The levels live in the panel's own state and reach no store,
no document and no other panel.

**Pricing order type (§7a).** *Done.* The four modes with their totals and explanations were already built.
Two things were missing and are now in: the **hub select** beside the order type — the design pairs them,
both decide what a row's buy figure is, and only the order type could be changed from the panel — and the
**age of the figures**. The server refreshes on a period measured in hours, and a price from this
morning looks exactly as authoritative as one from a minute ago; `priceAge` reports the stalest price
behind the total, because a total is only as fresh as the oldest figure in it.

**§7b, §8 and §9** were checked and need nothing. The rate block already carries what §7b draws — the
location, the fee with its working, the tax against Accounting, and the character the rates are quoted
for. §8 and §9 are Stages G and H, built as the plan describes.

**Mobile (§10).** The table is the only thing that could not survive a 360px stack, so it becomes
cards and everything else keeps its shape. Two details came from re-reading §10 after the first build:
figures **shorten** rather than wrap, with the full value on tap — shortening costs a reader nothing
they cannot get back, where truncating a label costs them the label — and the order type picker opens as a
**bottom sheet**, which is where the design says mobile gains most: four full-width rows each stating
what that order type does to the total, instead of an anchored menu opening against the edge of the screen.

The material drawer stays an inline collapse rather than becoming a sheet. The design asked for a sheet
because the thing it replaced was a popover anchored to a click target and unusable at 360px; the
drawer already opens under its own row, so the problem the sheet solved is not there to solve.

### Two seams the panels are held together by

Both exist because a panel split lets figures that must agree drift apart, and both were written after
a drift was found rather than in anticipation of one.

`Hooks/Planner/useJobEconomics.js` is the figures Cost Breakdown and Returns share — a cost stated on
one and subtracted on the other is the same number because there is only one of it.

`Hooks/Planner/useJobSellingContext.js` is who sells the output and from where. Three panels quote a
broker fee, a sales tax or a market skill level, and each resolves the pair from three places at once:
the job's own plan, the account default, and the hub the layout prices against. Skills resolved it
separately and quoted one character's Accounting against a fee Returns had struck for another.

`Hooks/React Query/Character/useSellingRateInputs.js` is the skills and standings behind every rate,
and it is the one seam shared with the **Selling** stage rather than between panels. The rates are read
from caches that never start a fetch, so each stage decided for itself whose reads to begin: Planning
asked for its seller, while Selling asked for the account's main and then costed each order against
whoever placed it — so an order from an alt was costed against a cache nobody had filled, and that fee
is stored on the job rather than re-derived. Its `ensureSellingRateInputs` half covers the case a
subscription cannot: a figure written to the job the moment an order is linked, for a character no
panel on the page has asked about.

### Where the shared helpers ended up

Stage J retired the mobile panel, which is what left the four shared helpers with one consumer each and
so with a home to go to. `Material Prices/` and `Resources Panel/` are both gone.

`marketPriceHelpers` became `Functions/MarketData/prices/marketPriceForType.js` — it is a store lookup rather
than a component helper, and three panel folders read it. The other three went to
`Materials And Sourcing/Helpers/`, where every consumer now lives.

### Known limits

**The per-component "vs last build" column needs a read the API does not serve, so the comparison is
one whole-build figure.** The split itself is recorded: `models.ArchivedJobCostTotals` carries
materials, install, invention and extras on every archived job, and those rows are what
`statistics.BuildHistory` reduces. What reaches the SPA is the reduction —
`GET /api/v1/statistics/{owner}/totals` serves a `ProductionTotalsRow`, whose `BuildHistoryMarks` are
whole-build cost per unit only. Comparing this build's material line against the last build's material
line therefore needs the last non-revoked `ArchivedJobStats` row's cost parts exposed, which is a
change to that endpoint and so belongs to the statistics work rather than to a frontend project. Until
then Cost Breakdown states the comparison once, against the whole build.

**How often the sourcing memo re-runs needs a profile.** It was recorded as re-running on every
dispatch, because the Edit Job reducer's `actions` object read `state` and could not be memoised. That
cause is gone: the reducer was replaced by `Edit Job Hooks/jobDraftStore.js` and `useJobDraft`, and
`useMaterialsSourcing.js` now reads the draft through selectors. What a read can establish is that its
memo keys on the whole of `job.build` — deliberately, since the rows are made of nearly all of it — so
any edit under `build`, a setup's runs or the selling plan included, rebuilds the rows, and an edit
outside it does not. Whether that is a cost anyone can feel has not been measured; the walk it repeats
was measured at well under a millisecond on the largest real job.

## A price that is missing is not a price of nothing

A hub holding no orders for a type reports `0`, and a real order can never be `0` — EVE will not
accept one. The client read that zero as a price, so two panels stated conclusions derived from an
absence.

**Returns** priced a capital nobody was trading at −155 billion with a −100% return on outlay, which
is what a missing sell price looks like rather than what the build is worth. `calculateReturns` marks
each route `hasNoOrders` when its own side is empty, and the panel names the market instead of
stating the figures. Per route, because the two sides are priced apart: a capital commonly has bids
and no listings, and the side that can be priced still says what it is worth. Break-even survives —
what the build cost is still true — but the headroom beside it does not, having no current price to
measure against.

**The materials list** was worse, because the damage was in a total rather than on a row.
`bought += (row.buyPrice ?? 0) * remaining` counted an unpriced material for nothing, so the whole
job read as cheaper than it is with nothing saying why. The cost line now counts what it left out,
and the row carries a `No orders` tag where its price would be. A row priced from a real purchase is
left alone: it has no market figure by design, and saying the market holds nothing would answer a
question nobody asked.

## Buildable rows are priced without being asked

Stage G gated costing behind an alert — *"N of M buildable materials have no build price yet"* — on
the grounds that a speculative build is real work most visitors do not need doing. Tracing it says
otherwise: recipes come from the cached static file, `buildJob`'s per-item loop is CPU over data
already fetched, and hydration batches into two requests whatever the row count. Speculative jobs
live in the page reducer, so nothing is written and nothing is created server-side until the player
confirms.

Two batched requests that change nothing is not worth asking permission for, and the alert could not
be dismissed by any route except doing the work. The panel now prices every uncosted buildable row as
it opens, from an effect so the table paints first and the Build column fills in behind a placeholder.

Two guards. Nothing runs on a job held by someone else, since a reader cannot act on what it would
say. And a ref makes it once per panel: the pricing cannot answer for every row, and without that the
effect would see the same unpriced rows and ask again on every render that followed.

The placeholder is narrow on purpose — only a row that is buildable and has no price yet. A material
nothing can build still shows a dash, which is the distinction the old panel could not make.

## Stage status

| Stage | Surface | Status |
|-------|---------|--------|
| Phase 1 — project folder and docs | docs | **Done** |
| A — sale locations and their rates | SPA | **Done.** The accessor reads saved citadels from the market source registry; storing them landed with market-locations, not here |
| B — fee and tax estimation | frontend logic | **Done** |
| C — Accounting in skill catalogue | data | **Done** |
| D — pricing order type in panel headers | SPA | **Done** — picker built; Stages E and F mount it |
| E — Materials & Sourcing | SPA | **Done** for the standard layout. Mobile still renders Raw Resources until Stage J; the market panel is reduced to the figures Stage F absorbs |
| F — Cost Breakdown and Returns | SPA | **Done** for the standard layout. Both panels mounted, Extras absorbed into Cost Breakdown, and the totals panel retired from it. Mobile keeps the old panel until Stage J |
| G — speculative child jobs | SPA, behavioural | **Done.** Rows are priced as the panel opens rather than on demand, stay on Buy, the offer that switches them works, group jobs seed their own rows, and the five buttons are one chip with an undo |
| O — a missing price is stated, not counted as zero | SPA, behavioural | **Done.** Returns names the market holding no orders; the materials list tags the row and the cost line counts what it left out |
| H — jobs with parent jobs | SPA, behavioural | **Done.** Committed output carries no sale figures and no charges; a surplus is priced on its own; Contribution replaces Returns where nothing is sellable |
| I — Skills as a model | SPA | **Done.** Three groups, the selling one read from the seller's own skills, Broker Relations kept and marked at a citadel, the signed-out path states requirements, and what-if re-derives the charges without touching the panels |
| J — mobile layouts | SPA | **Done.** Mobile mounts the same panels as the standard layout; the materials table becomes cards below `sm`, figures shorten with the full value on tap, and the order type picker opens as a bottom sheet. Raw Resources and the totals panel are deleted |
| K — default market character in settings | SPA + document field | **Done.** `DefaultMarketCharacter` on application settings, the picker on Job Settings, and `sellerCharacter.js` reading it. Nil until chosen, standing in with the account's main and saying so |
| L — per-job selling override | SPA + job document field | **Done.** `build.sellerCharacter` and `build.saleLocationID` on `JobBuild` hold the seller and the sale location, both omitted on a job that uses the account's defaults; the pickers are on the Returns rate block |
| M — what a child job actually covers | SPA | **Done.** The requirement is allocated across the contributing jobs rather than charged to each; a shortfall is bought, extrapolated or resized away depending on what is going to happen to the job, and the drawer and Cost Breakdown both say which |
| N — the sale location list and its standings | SPA | **Done.** Citadels and NPC stations are separated, the account default is the marked item rather than a second entry, and a station's faction standing resolves through the race-to-faction map instead of matching a race id against the standing list |
| P — Output, and the parent jobs inside it | SPA | **Done.** Output reads `useJobCommitment`, which now carries the group shortfall and a row per parent; a job with parents states its requirement in or out of a group; the parents are rows folding past six; the picker states each candidate's need; the header keeps one summary line |
| Q — the page frame and its controls | SPA | **Done.** Tabs over the same navigation rules, the shut final tab saying why, one labelled pair, labelled header controls with Delete confirming and Close asking, and the unsaved state shown; `useIsScrolledOutOfView` deleted |
| R — Setups | SPA | **Done.** One Setups panel: the shared facility stated once and departures naming what they change, rows led by runs with install cost beside them, the editor opening under its row (a sheet on a phone) grouped as how much, where and who, Add in the header and Delete on the row, absent on the last |
| S — Blueprint Library | SPA | **Done.** Rows with their status in words from the theme and no legend, a named Use with an Undo, the blueprint the setup is on marked, a counting fold instead of a fixed-height scroller, and Formula Library for reactions |

## Start here

**Every stage, A–S, is done.** The three panels this project first owned run on both layouts, the old market and Raw Resources panels are deleted, the selling charges are
counted, Output has replaced Production Stats with the parent jobs inside it, the page frame is tabs
with labelled controls, and Setups and the Blueprint Library are on the app-shell surface — so no panel
on the stage is left on the old `ContentPanel` shell. [`overlay.md`](./overlay.md) carries how each landed part works now, in the shape it
takes when it is folded into live SoT under [`../../frontend/`](../../frontend/contents.md).
[`review.md`](./review.md) records what the code bore out on 2026-10-05 and the decisions taken on it.

**The project is ready to promote, once, with James's go-ahead.** Everything is checked against the code
and the tests; nothing has yet been looked at in a browser, so the open-row tint, the gap between the
stage's two columns and the header line's wrapping want a look before the go-ahead. The whole stage and its frame fold
into live SoT together in one pass: [`promote/README.md`](./promote/README.md) lists every draft, the
live docs it replaces or deletes, and the rules and components sections it adds.

Three things deliberately did not land here, and a reader picking this up should not go looking for
them:

- **Storing saved citadels** went to the custom-structure work, and landed there: market-locations and
  market-price-delivery built the saved-market lane and its editor, and both have promoted — live
  [frontend/settings/market-locations.md](../../frontend/settings/market-locations.md). This project
  stores nothing and reads sale locations through `Functions/MarketOrders/saleLocations.js`, which reads
  that registry. § Handed to the custom-structure work keeps the proposal as it was handed over.
- **The per-component "vs last build" comparison** needs a statistics endpoint change and belongs to
  that work. See § Known limits.
- **The account's market defaults** were not changed here. Splitting the one default into separate
  buying and selling defaults, and keying defaults to market groups, came out of this project's hub
  picker and were their own work, since promoted — see
  [market-pricing-defaults/plan.md](../market-pricing-defaults/plan.md).

**Minerals bought as ore** is designed on this stage and belongs to no project yet; it is recorded
here only so the seams it uses are known. It does not block promotion — § Handed on: minerals bought
as ore.

The open questions below are still open, and none of them blocks promotion.

## Handed on: minerals bought as ore

**Designed on this stage, scoped nowhere yet, and nothing here waits on it.** Buying a job's minerals as
ore is worked out in [reprocessing-rebuild](../reprocessing-rebuild/plan.md) § Not in the sequence and
drawn on this stage's built panels inside the frame Stages P and Q plan, in the reprocessing canvas
(<https://claude.ai/artifact/5HovmoD6arBetuQ18GFuiE>, "Reprocessing elsewhere in the app"). It needs
that project's engine and solver first, so it is built after this project promotes. The section task
map [`../contents.md`](../contents.md) carries a row for it pointing at that plan, which survives this
folder being deleted.

What it adds to the panels this project built, so whoever builds it knows which seams it uses:

| Panel | What appears | The seam it uses |
|-------|--------------|------------------|
| Materials & Sourcing | One more line in the offer box, and only when ore would save something | The offer strip Stage G made reachable |
| Materials & Sourcing | Minerals ore can produce stay ordinary rows, sorted with the rest, with an **Ore** plan chip (**Ice** for ice products), their cost as ore and the source *Ore · below*. Components, PI materials and buildable rows keep Buy / Build | The plan chip and the Source column from § Design fidelity |
| Materials & Sourcing | The ore is **never a row**. A panel of its own beneath the list, **collapsed by default** to one line — "Ore · for N minerals", delivered cost against the minerals' own, **Show the plan ▾**, and "Buy the minerals" in its ⋮ menu. Opened, it holds the editable ore prices, where the ore is reprocessed, how mineral costs are shared, and a chart of which ore supplies each mineral | New, beneath the table |
| Cost Breakdown | A *Minerals bought as ore* line among the materials, the reprocessing tax inside it | The proportion bar's parts |
| Cost Breakdown | Hauling the ore as an **estimated** extra in the Hauling Service category — worked out from the plan, never stored, marked *estimate* until the reader records what they paid, with Record it / Not needed beside it | The Extras section Stage F absorbed, which today holds recorded costs only |
| Skills | A fourth group, *Reprocessing the ore*, while ore is in use | Stage I's groups |

**Two ores behave differently and never appear as a plan's ore.** Prismaticite gives one random
mineral per batch, so nothing guarantees it covers a need and the solver never chooses it; an
Unrefined mineral gives one known mineral in a varying amount and is planned at its guaranteed
minimum, with the expected extra reported as leftovers. Unrefined minerals are also made by reaction
jobs (the `Unrefined … Formula` blueprints), which this stage already plans like any reaction. See
[reprocessing-rebuild](../reprocessing-rebuild/plan.md) § E2 and § Not in the sequence.

The estimated extra is the one change to a figure this project owns: Cost Breakdown's extras line
counts an estimate for a category with nothing recorded, and a category's recorded total replaces its
estimate. **Returns counts it too**: hauling is an expense the build has to pay, so the net return,
break-even and every figure derived from the cost include the estimate. It does not arrive there by
itself — Returns reads the job's recorded extras, and the estimate is never stored — so the work that
builds this adds it to the cost Returns is handed, from the same figure Cost Breakdown shows. Once the
reader records the hauling, the recorded extra replaces the estimate in both. The archive reads recorded
costs only, so an estimate never reaches it.

## Open questions

These are named rather than decided, because each changes what gets built:

- **Does the pricing-model toggle set the model the rest of the app costs against, or only what Cost
  Breakdown displays?** Display-only is cheaper and safer; app-wide makes the toggle meaningful but
  touches every consumer of the job's cost.
- **How deep do speculative child jobs recurse?** One level is proposed; deeper is more accurate and
  unbounded.
- **Does a Price Entry purchase price override the order type automatically, or only when the row is told
  to?** Automatic is what a player probably expects; explicit is predictable.
- **Where is a saved citadel edited from — Returns, or application settings?** Settings is where the
  form is built, since it is where the rest of the `CustomStructures` family is managed and where the
  asset-location picker already exists. Whether the rate block inside Returns also reaches it — the
  place a player notices a rate is wrong — is the part still open.

