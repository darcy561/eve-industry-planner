# Market pricing defaults — overlay

What changed and how each part works **after** the change. Live docs remain the truth wherever this
file has no entry. Fill a section as its slice lands; do not pre-write behaviour that has not shipped.

Promote target on go-ahead: [frontend/](../../frontend/contents.md) and
[backend/](../../backend/contents.md).

## Stage A — The account's defaults

### A1 — The stored fields

`ApplicationSettings.DefaultPricing` holds a `PricingSide` for each of `Buying` and `Selling`, each
naming a `Market` and a `Basis`. A basis is a listing type, so a side that buys carries `Basis:
"sell"` — the ask is what buying costs. A new account starts both sides on Jita sell orders.

The SPA mirrors the shape at `applicationSettings.defaultPricing` and persists it. Where the server
sends no pair, `mergePricingDefaults` seeds **both** sides from the single `defaultMarketLocation` /
`defaultOrderType`: an account that has only ever named one market has said nothing about which side
of a job it meant, so neither side may claim it over the other. A side the server sends partially
keeps what it sent and seeds the other.

`Upgrader.ApplicationSettings` seeds an unfilled side from the account's single `DefaultMarketLocation`
/ `DefaultOrderType`, falling back to Jita sell orders when it has neither. It runs on every read, so
nothing downstream sees an unfilled side. The seed is gated on an empty `Market` rather than on the
schema version, because an unversioned document is stamped with the current version earlier in the
same function and a version test would never fire for the rows that need filling.

Still open: the once-per-account backfill, which rides the shared-planners release window rather than
a schema step, and what stops writing the single pair.

### A2 — Asking for a side

`resolvePricingSide({jobPricing, accountPricing, side})` in `Functions/MarketData/pricingSide.js` is
the whole ladder below a material's own override: the job's choice, then the account's, then the
global default. Market and basis resolve independently, so a job naming a market without a basis keeps
the account's basis rather than losing it, and an empty value is not a choice at any rung.
`useEffectiveMarketHubFromLayout(layout, side)` wraps it with the store read.

`PRICING_SIDE.BUYING` / `.SELLING` name the side of the **job**, never the side of the order book. The
argument is required, so a surface cannot fall through to a default side by omission.

A job's own override is `layout.localPricing` — `JobLayout.LocalPricing`, a nil-able
`*PricingDefaults`, so a job that has chosen nothing writes nothing. `JobLayout` decodes by hand in
both BSON and JSON, and a field added to the struct alone is dropped silently, so the new field is
assigned in both and both round trips are covered by tests.

Nothing seeds a job server-side: `Upgrader.Job` only clamps the version and runs in the offline drain.
The SPA's `Job` constructor seeds a job stored before the split, beside the `marketLocation` alias
already there — both sides from the one pair, for the same reason the account's seed does.

Which side each surface asked for: Materials & Sourcing, Purchasing's material cards and the
Purchasing data panel buy; `useJobSellingContext` sells.

`setJobPricingSide(jobPricing, side, key, value)` is how a control changes one field of one side. It
answers null once the last choice is cleared, so a job that has chosen nothing carries no override.
The hub and basis controls on both panels read and write through it, and
`useStripRedundantJobMarketHubOverrides` judges each side against its own account default rather than
clearing both at once.

**A read path on the new field and a write path on the old one freezes the override.** The reducer
rebuilds the job from the previous instance on every layout edit, so once a side had been seeded, a
control still writing the legacy field would be ignored from the second pick onward — the panel's hub
selector would go dead for the rest of the session. The controls therefore moved in the same step as
the resolver, and the sequential-edit case is covered rather than left to a single-construction test.

### A3 — Which side each surface asks for

Every surface names its own side where it asks, so moving one is a single token:

| Surface | Side | Why |
|---------|------|-----|
| Materials & Sourcing, Purchasing's cards and data panel, the per-row override | buying | materials are bought |
| Shopping list totals | buying | what is still to buy |
| Price entry dialogue | buying | seeds a figure about to be paid |
| A group's output card | selling | what the jobs produce is worth |
| Reprocessing | selling | values the minerals an input would yield |
| `useJobSellingContext` | selling | the sale being planned |
| Watchlist rows | **both** | materials are bought, the item itself is valued at what it fetches |
| Market and price-history links | the figure's own | `locationID`/`regionID` from the caller, and only where it has none does the side decide |

The watchlist is the case that shows why the two are separate: one row prices its materials on one
side and the item on the other, which the single default could not express. It takes the selling
**market** only — the column states what listing the item would fetch, so the sell price is the figure
it wants whatever basis the account prices on.

**A link's side must match the figure it sits beside.** A group's output card and the Selling stage's
market costs panel both show a selling figure, so their market and price-history buttons take
`PRICING_SIDE.SELLING`; left on the default they would have opened the buying market next to a selling
price. Every other caller passes an explicit `locationID` or `regionID`, which outranks the side.

**An unrecognised id answers with nothing rather than throwing.** `findMarketData` builds its empty
default from the four hubs, so a market it does not carry misses. Thirteen reads in `ItemRow.jsx`,
three in `ItemRowExpanded.jsx` and one in `shoppingList.js` indexed that result twice with no guard
and raised a `TypeError`; they are guarded now. In `ItemRow` the item's own worth is derived once in
`buildCosts` rather than re-indexed at ten render sites.

`calculateMaterialCostFromChildJobs` took its hub and basis as arguments named for the account
defaults. Both callers already passed a resolved pair, so only the names moved — `marketSelect` and
`listingSelect`, matching what is handed in.

### A4 — Setting the defaults

Job Settings and the first-login setup both offer a market and a basis for each side, built from
`PRICING_SIDES` in `Functions/MarketData/pricingSide.js` so the two screens cannot drift apart.

The controls are labelled **Materials** and **Output** rather than buying and selling. A basis is
itself called buy or sell, so "buying market" sitting beside a basis of "Sell Orders" reads as a
contradiction when that is the normal, correct case — naming the thing being priced avoids putting the
two axes in the same phrase.

`updatePricingDefault(side, key, value)` replaced `updateDefaultMarket` and `updateDefaultOrders`;
nothing writes the single pair now.

Both screens are covered control by control — all four of market and basis on each side — rather than
by one write path standing in for the rest. A control wired to the right side but the wrong field
renders and saves exactly like a correct one, so only naming each corner catches it.

## Stage B — Market group defaults

### B1 — Publishing an item's market group

`FullItem` gained `market_group_id`, taken from `EVEType.MarketSectionID`. **Read that carefully:**
`EVEType.MarketGroupID` is the SDE's *inventory* group, which is what `CategoryID` is looked up by. The
two are crossed on the struct, both are small integers and both resolve to a real group, so a swap
would look right everywhere — a test asserts them apart on one type for that reason.

A new `marketGroups.json` names each group and says what contains it, published like the other static
data: an entry in `staticDataFileDefs`, a handler, a route, and its own metric. `ParentID` is 0 at a
root, which is the only signal a walk gets to stop; a group whose parent is missing from the source is
kept as a root rather than pointed at nothing, because a name is still worth having.

`CACHED_DATA_FILES` in the SPA answers to `staticDataFileDefs`, and a key that matches nothing the
server serves throws on first use. It carried `INVENTION_DATA`, which matched no server key and was
reached for by nothing; it is `INVENTION_MODIFIERS` now, beside the new `MARKET_GROUPS`.

The two lists are a contract across two languages with nothing between them, which is how that key
survived. `TestSPAAndServerAgreeOnTheStaticDataKeys` in `shared/core/sde` reads the SPA's list from the
repo and fails if either side names something the other does not, so the next drift is caught at the
point it is written rather than the first time something reaches for it.

### B2 — The walk

`resolveGroupDefault({marketGroupID, marketGroups, groupDefaults})` climbs from an item's own market
group towards a root, and answers market and basis separately: each stops at the first ancestor naming
it, so a nearer group narrows what it names and leaves the rest to whatever answers next. An empty
value is not a choice here either, so a group naming `""` is climbed past rather than treated as an
answer.

Group defaults are stored per side, inside `PricingSide.Groups` keyed by market group id — a group
cannot answer the side it was not set on. A job's own override is `JobPricing`, which has no group
table at all: groups are an account rung beneath the job, so a job carrying one would answer a question
it does not own. `PricingChoice` is the market-and-basis pair both are built from.

Neither the upgrader's seed nor the SPA's merge may replace a whole side to fill part of it: a side can
carry groups before it names a market, and what is persisted is the merged copy.

**The walk is capped.** EVE's tree is a few levels deep, so anything longer has met a cycle the
published file should not contain; a cap is what keeps that from hanging a page that runs this once
per material on every row. Removing it does not fail a test — it hangs the suite, which is the
behaviour the cycle case is there to pin.

The tree it walks is measured at [measurements/market-group-tree.md](./measurements/market-group-tree.md):
2,039 groups, 19 roots, five hops at the deepest. Nothing in the real data states a zero parent or
names a parent it does not carry, so those two guards are defensive rather than load-bearing — and the
cap sits far above the real depth on purpose, so a legitimate deepening of EVE's tree is not silently
truncated.

Still to wire: the SPA reading the published tree, and the settings surface for choosing a group.

### B3 — Where the walk sits in the ladder

The rung is consulted from `getEffectiveMaterialPriceHub`, which is the one place a material row's
hub and basis are decided. It sits between a row's own override and the panel default, and it is
answered per axis like every other rung: a group naming a market and no basis narrows one and leaves
the other.

**The panel default had to stop being a single value for this to work.** `resolvePricingSide` collapses
job override, account default and global into one answer, and a group default has to beat two of those
three and lose to the first. Handed `"jita"` there is no way to tell which rung said it, so a group
would have overruled a job the player had explicitly set. `resolvePricingSideRungs` answers the same
ladder and reports **which rung answered each axis** alongside the value; `resolvePricingSide` is now a
thin call onto it, so the two can never disagree about the ladder. `PRICING_RUNG` names the three rungs
that function itself walks — the row override above it and the group walk below are applied by whoever
holds the data for them, and are never returned from it.

`useEffectiveMarketHubFromLayout` returns the rungs too. A caller with nothing to insert underneath
reads the two values and ignores the rest, which is every caller except Materials & Sourcing.

**Costing the four bases suspends the basis rung.** `materialCostByBasis` asks what the job would cost
on each basis in turn, so a group default naming a basis would answer all four identically and flatten
the comparison into one figure repeated four times. That axis is marked `SUPPRESSED` rather than being
given the job's rung: the basis is not a rung question for that call at all, and borrowing the job's
would read as a choice the player never made. The group's *market* still applies to every candidate,
because the market is not the axis being varied.

**The walk answers only where it was told what it is displacing.** `beneathTheJob` fires for the
account and global rungs and yields for everything else, including a rung that was not named at all —
a caller holding the walk's data also holds the rungs, because the panel resolver returns both, so an
absent one means a caller that does not know about the rung rather than an account default waiting to
be displaced. Yielding loses the feature for that caller; guessing would overrule a job the player set.

**Rung 1's "empty" is not the ladder's.** Every rung below the row override treats `""` as no choice,
but the override is read with `??`, so an empty string stored there answers and the group rung beneath
it never fires. It is not reachable from the panel — `normalizeOverrideEntry` clears to `null` and
drops an entry once both axes are null — so this is an inconsistency in the rule rather than a defect
with a symptom. It is pinned by a test so the asymmetry is not silently "tidied" into `||`, which would
change what a stored empty override means.

**The rung stays optional.** `groupPricing` is absent wherever the walk cannot answer — no tree loaded,
or an account with no group defaults, which is the common case — and the ladder then reads exactly as it
did before the rung existed rather than answering from half the data.

### B4 — Reading the tree in the SPA

`marketGroups.json` is registered as a static data file like every other: a `getMarketGroups` reader in
`getCachedData`, and an entry in `useCachedData`'s `READERS`. Nothing else about static data changed —
`refreshStaticDataCache` already downloads every key the server publishes, so the file was reaching the
browser before anything read it.

**The rung needs a synchronous read, so the tree is held outside React Query.**
`Functions/MarketData/marketGroupData.js` holds the tree and the item list, primed once from
`useFetchStaticDataFiles` beside the existing refresh. Reading is then a plain lookup that reports
absence. This is not a second cache of the files — it is a synchronous view onto the same Cache API
payloads, which the rung cannot do without: the walk runs per material on every row of every job, and
`shoppingList.calculateTotalValue` prices from a class method where no hook can be called.

A React Query read was tried first and rejected. Calling `useCachedData` from `useMaterialsSourcing`
gives the panel hook a `QueryClientProvider` requirement, which broke every test rendering it through
`renderHook` — a pricing hook acquiring a transport dependency to read two static files is the wrong
trade.

**One builder answers "can the rung fire", for both callers.** `groupPricingFor` holds that rule;
`useMaterialGroupPricing` is a `useMemo` over it, and the shopping list calls it directly. Two copies
would let the panel and the list disagree about whether a group default applies to the same material.

**The shopping list resolves the rung per item.** It carries no job and no per-item override, so the
walk is the only rung above the account default there — but it is still per item, so it moved inside
the loop rather than being resolved once for the list.

**An item's market group is a field on the item list.** `FullItem.market_group_id` is read from the
list every consumer already holds, rather than copied into a second structure.

### B5 — The selling side names a route out

The selling default names an **exit route** — listing on the market, or selling into buy orders —
rather than a pricing basis. A basis says which side of the book a figure comes from; it cannot say
whether a broker fee is charged, and those are the same question. Listing pays fee and tax; selling
into bids pays tax only, because nothing is listed.

`PricingSide` gains `Exit`, on the selling side only, and the selling side stops carrying a `Basis`:
two stored answers to one question are free to disagree. `basisForExit` is the single place that turns
a route into a side of the book, and `resolvePricingSide` consults it when the selling side has no
basis of its own — a job that named one still outranks it, because a job that named a basis has
answered for itself.

**Returns stops assuming the listing.** `returnsPanel` hardcoded `EXIT_ROUTE.LISTED` as the figure it
leads with, for everyone. It now leads with the account's route, carried there through
`useJobSellingContext` beside the seller and the sale location — the same hook, because the route
decides both which figure leads and whether the broker fee that hook's seller is quoted for applies at
all. Both routes are still stated; only which one is the headline changed.

**The seed reads the route from the basis an account already had.** Returns led with the listing for
everyone, so an account that named the bid side was reading a listing's fee against a bid's price.
Taking its stored basis at its word repairs that where it was set and leaves everyone else on the route
they were already shown. Both the Go upgrader and the SPA merge do this, and neither consults a
previously held route: that would outrank an answer the server has just given.

**The ledger states the broker fee only on the route that pays it.** `calculateReturns` already charged
the fee to the listing and not to the buy-order sale, but the panel's own breakdown deducted it from
both — invisible while the headline was hardcoded to the listing, and wrong the moment an account could
choose the other. A player selling into bids would have seen a fee deducted above a net figure that
never had it taken off, so the two halves of the same panel disagreed.

**The blank state names no route, and that is what makes a chosen one stick.** The legacy single
default is still written on every save and so arrives with merges that are not about pricing at all. A
route derived from it each time would quietly undo the player's choice — the setting would appear to
save and then revert on the next unrelated write. The merge therefore keeps a route it already holds,
which it can only treat as a choice because nothing seeds one: a seeded route is indistinguishable from
a chosen one, and a legacy account's first load still has to read its route from the basis it stored.
Readers supply `EXIT_ROUTE.LISTED` where none is held, which is where that default belongs.

The precedence, in full: a route the server sent; then the basis it sent beside it, because a document
stored before routes existed is still the server answering; then the route already held; then the
legacy single default.

`EXIT_ROUTE` is not redefined. It already existed in `returns.js`, which is what charges a fee against
one route and not the other, so that is where it stays and the resolver imports it.

### B6.1 — The published tree walks both ways

`MarketGroup` carries `children` and `has_types` alongside `name` and `parent_id`.

The SPA browses the tree so a player can choose a group to price against, and the file gave it only
upward links — so finding what sits inside a group meant inverting two thousand entries on first open,
every session, to recover an answer that never changes. The worker holds the map in order already, so
it says so once.

**`has_types` comes from the published item list, not the SDE's flag.** The question a reader has is
whether a group holds anything the app knows about; the source answers a different question, about
types the item list may never carry. `GenerateMarketGroupsOutput` takes the item list and runs after it
in `conversionStage`.

Children are sorted by id: the same source has to produce the same bytes, or a published file cannot be
compared between builds.

Both fields are `omitempty` on a file read as a map, so this is additive in both directions — an older
SPA ignores them, and a newer one tolerates their absence until the next SDE build publishes them.

### B6.2–B6.4 — Reading the tree, writing one group, and showing both

**The walks take a tree rather than finding one.** `childrenIn` and `ancestorPathIn` are the real
functions; `childrenOf` and `ancestorPath` read the module's own copy and call them. React reads this
file through the query cache while the pricing rung reads the copy `marketGroupData` holds, and the two
are primed separately — so a hook that consulted one to decide the other had arrived would be a race,
showing paths that come and go. A caller holding a tree passes it.

**`setGroupPricing` is the merge, and `updateGroupPricingDefault` is the store's use of it.** A side's
own market, basis and route sit beside its group table, so a write to one group has to leave them
alone — the reason this is not `updatePricingDefault` with a `groups` key. Clearing a group's last
field drops the entry; clearing the last entry drops `groups` from the side entirely, because an empty
table would be persisted and read back as a table answering nothing.

**The panel is built from the app-shell kit**, on a Settings page that has not been migrated to it:
`AppShellPanel` holds it, `FigureCaption` heads each side, `InsetSurface` holds the rows, and each row
is a `FigureRow` — label, sublabel, value is exactly a group, its path and what it prices against, and
a hand-rolled version of that row was the first thing this slice got wrong.

**A row states where its group sits.** "Minerals" alone does not say whether it is the one the reader
meant, and a default set on a container covers everything beneath it. A group the published tree no
longer carries is still shown, by id, because a reader has to see a choice to clear it.

### B6.5 — A group is recognised by one of its items

Market group rows carry a picture. A group's own icon in EVE's data names a file inside the game
client, which nothing can serve, so a group borrows one of its own items instead: `IconTypeID` is the
lowest type id it holds, and a container with none of its own takes the first from the branch beneath
it. Minerals shows Tritanium.

The lowest id rather than any id, so the same source always picks the same item and a rebuilt file can
still be compared with the last one.

`MarketGroupIcon` sits beside `OwnerAvatar`, which is where EVE imagery already lives, and is built on
MUI `Avatar` so a failed load falls through to a glyph rather than a broken image. Where a whole
branch is obsolete there is no item to borrow and the glyph is all there is — 28 groups of 1,108
across the branches this app prices, every one of them obsolete.

### B6.7 — The selling side resolves a group default, and a sale is priced from it

`useJobSellingContext` consults the group rung for the job's output type, so an account pricing
minerals somewhere reaches a job that makes one. The ladder there is the sale location's hub, then the
group, then the side's own market — the order every other surface already holds.

**The output was being priced from the buying side.** The market reaching `useJobEconomics` came from
`useMaterialsSourcing`, which resolves the buying side, so a sale was quoted against the market the
materials come from whenever no sale location named a hub. The selling context was already in that
hook; it now reads the market from there, and the prop is gone rather than left unread.

That was invisible because a sale location outranks the market and `getSaleStructures` always returns
one. The case has its own test file, since reaching it means mocking the placeholder away and eleven
other cases depend on it.

## Consolidation

Work the stages left behind, folded back together once the surface had settled.

### Market links resolve their target in one place

The four price-link components — `Typography/marketData`, `IconButton/marketData` and the two
`marketHistory` twins — each carried a verbatim copy of the same fallback: no market given, so resolve
the account's default for the side being priced, then look the id up in `MARKET_OPTIONS`. Comment
included. That rule now lives once, in `Functions/MarketData/marketLinkTarget.js`, which the four call.

It matters beyond tidiness because [market-price-delivery](../market-price-delivery/contents.md) retires
`MARKET_OPTIONS` for a source registry admitting reader-saved markets. That change had four landing
sites here and now has one.

Two things changed in the folding, both deliberate:

- **A link follows the account's default.** The copies read the store through `getState()` during
  render, so a link kept pointing at whatever the market was when the component first rendered. The
  helper takes `accountPricing` from a subscribed read instead.
- **A market id given as a string is looked up once.** The copies tested "nothing given" before testing
  "given as a string", so a string id fell through the default branch first and was resolved twice.

### The watchlist resolves both sides once

A watched item is costed on both sides at once — its materials are bought, the item itself is valued at
what it would fetch — which makes the watchlist the only surface reading both account defaults.
`ItemRow` and `ItemRowExpanded` each held an identical copy of that pair, comments and all, and
`itemWatchContainer` re-derived the buying basis a third time for a column header.
`useWatchlistPricing` now holds it, and all three read through it.

### One unguarded price read

`addMaterialCosts.jsx` indexed `materialPrice[market][basis]` with no guard, the shape § A3 guarded in
three other files. It was not reachable to throw — every rung feeding it draws from `MARKET_OPTIONS`,
which `findMarketData`'s empty default always carries — but a market group id is not drawn from that
list, so wiring the group rung into that component would have made it the fourth throw site.
