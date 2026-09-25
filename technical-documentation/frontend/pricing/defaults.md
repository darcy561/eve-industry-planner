# Where a price resolves by default (`Functions/MarketData/defaults/pricingSide.js`, `priceResolution.js`)

Live SoT for which market and order type a figure is priced against when nothing nearer has said —
the resolution ladder, the account's two sides, and the market group defaults beneath them.

## Two axes, both called buy and sell

**Which side of the job** — materials are *bought*, output is *sold* — and **which side of the order
book** a figure comes from are different questions, and both are named buy/sell. `PRICING_SIDE.BUYING`
/ `.SELLING` name the first, never the second; `orderType` (`buy`, `sell`, `buyP95`, `sellP05`) is
named as ESI names it. The two disagree on purpose: materials are normally priced from the **sell**
side, because the ask is what buying costs, so a correctly configured account holds
`buying.orderType = "sell"` — a controls a reader sees as **Materials** and **Output**, never as
"buying" and "selling", so the order type sitting beside them never reads as a contradiction.

**A caller names its side; nothing infers one from context.** `resolvePricingSide` and every hook
built on it take the side as a required argument, so moving a surface from one side to the other is
changing one token. Watchlist rows are the one case with no single side: a row's materials are bought
and the item itself is valued at what it fetches, so it resolves both.

## The ladder

A market id resolves through one ladder, nearer rungs outranking further ones, on both sides of the
job independently:

1. **The material's own override** — a per-type entry on the job (`layout.materialPriceOverrides`,
   the ladder's top rung — see [price-entry.md](./price-entry.md) for where a reader sets one).
2. **The job's own choice for the side** — `build.localPricing`.
3. **The nearest market group carrying a default** — walked from the item's own market group towards
   the root of the tree.
4. **The account's default for the side asked.**
5. **The global default** — `GLOBAL_CONFIG.DEFAULT_MARKET_OPTION` / `DEFAULT_ORDER_TYPE`.

Market and order type resolve **independently** at every rung: a rung naming a market without an
order type narrows one axis and leaves the other to whatever answers next, and an empty value is
never a choice. `resolveGroupDefault` and `resolvePricingSideRungs` both hold this rule; a material
row can therefore name a hub without naming an order type and keep whichever the account or the job
already answered.

`resolvePricingSideRungs` answers rungs 2, 4 and 5 in one call and reports **which rung answered each
axis** alongside the value, because the group walk sitting between rungs 2 and 4 has to know what it
would be displacing — handed a bare `"jita"` there is no way to tell whether a job or the account said
it, and a group default would silently overrule a job the reader had explicitly set.
`resolvePricingSide` is a thin wrapper over it for a caller with nothing to insert underneath.

`getEffectiveMaterialPriceHub` is the one place rungs 1 and 3 apply, on top of an already-resolved
rung 2/4/5 answer:

```
override?.marketDisplay ?? group.marketLocation (if outranked) ?? defaultMarketLocation
override?.orderDisplay  ?? group.orderType       (if outranked) ?? defaultOrderType
```

A group's answer only applies where it is outranking the account's default or the global one — a rung
the caller never named is treated as unknown rather than guessed at, so a group can never overrule a
job.

**One place answers this for every caller outside render.** `priceResolution.js`'s `sideDefaults` and
`resolveFor` are what a fetch and a read both go through, because a fetch that resolved one market
while the render read another would warm a cache entry nothing looks at. `useEffectiveMarketHub`
(`Hooks/Planner/useEffectiveMarketHub.js`) and `useMaterialGroupPricing` are the React path onto the
same pieces, re-rendering when a rung moves; both end in the same `getEffectiveMaterialPriceHub`.

## The account's two sides

`applicationSettings.defaultPricing` holds a side each for `buying` and `selling`, read through
`useUsersStore((s) => s.applicationSettings.defaultPricing)`. A new account starts both sides on Jita
sell orders, with the selling side's exit route set to a listing.

**The selling side names an exit route, not an order type.** `defaultPricing.selling.exit` is one of
`EXIT_ROUTE.LISTED` / `EXIT_ROUTE.IMMEDIATE` (`Functions/Job/returns.js`), and
`orderTypeForExit` (`pricingSide.js`) is the single place that turns a route into a side of the book —
listing prices from the ask and pays a broker fee, selling into bids prices from the bid and pays tax
only. A route answers two questions an order type alone cannot: which side of the book a figure comes
from, **and** whether a broker fee applies. Wherever the selling side's order type is read, it is
`selling.orderType || orderTypeForExit(selling.exit)` — reading `.orderType` alone answers `undefined`
for an account that has only ever named a route.

**A job's own order type still outranks a route.** `resolvePricingSideRungs` tries the job's stored
order type before falling back to the account's route, because a job that named an order type
explicitly has answered for itself.

`PricedAgainst` (`Components/Settings/Standard Layout/Market Locations/pricedAgainst.jsx`) is where a
reader sets both sides — a market and, per side, either an order type or an exit route. It is reached
from the Settings page's Market Locations tab and mounted again, unchanged, by first login; see
[../settings/market-locations.md](../settings/market-locations.md) for the tab it sits in.

## A job's own choice

`build.localPricing` is a job's own override, shaped the same way as the account's — a side each,
naming a market and an order type — and nil-able: a job that has chosen nothing carries no override at
all rather than an empty pair. `setJobPricingSide(jobPricing, side, key, value)` is how a control
changes one field of one side, and it returns `null` once the last choice on either side is cleared.

**An override is dropped the moment it matches what the account already says.**
`useStripRedundantJobMarketHubOverrides` compares a job's stored choice on each side against the
ladder resolved with no job in it, and clears whichever field agrees — judging each side against its
**own** account default, never both at once. A stored choice must not outrank a default the reader
later changes: if a job's override survived only because it once matched the account, changing the
account default afterwards would leave the job silently pinned to the old value under a control that
looks like it is still following the account. The comparison reads the selling side's default through
the same route-derived order type as everywhere else, so an account naming only a route is not read as
naming nothing and stripped of a reader's deliberate choice.

## Which side each surface asks for

| Surface | Side | Why |
|---------|------|-----|
| Materials & Sourcing, Purchasing's cards and data panel, the per-row override | buying | materials are bought |
| Shopping list totals | buying | what is still to buy |
| Price entry dialogue | buying | seeds a figure about to be paid |
| A group's output card | selling | what the jobs produce is worth |
| Reprocessing | selling | values the minerals an input would yield |
| Selling context (fees, tax, Returns) | selling | the sale being planned |
| Watchlist rows | **both** | materials are bought, the item itself is valued at what it fetches |
| Market and price-history links | the figure's own, else the side | a caller's own `locationID`/`regionID` outranks the side |

The selling context — seller, sale location, market, exit route — is resolved once, in
`useJobSellingContext`, because every panel quoting a broker fee, a tax or a market skill level needs
the same pair and resolving it separately is how a fee struck for one character was once quoted against
another. It reads the market from its own selling-side resolution rather than from a buying-side hook
passed in beside it — pricing a sale from the market its materials came from is the wrong market by
construction.

## Market group defaults

An account's group table (`defaultPricing[side].groups`, keyed by market group id) prices everything
beneath a group the reader has set, walked from an item's own market group towards the tree's root by
`resolveGroupDefault`. A nearer group outranks a further one, market and order type answered
separately, exactly as every other rung. The walk is capped at 32 hops — EVE's tree is a handful of
levels deep, so a walk running longer has met a cycle the published data should not contain.

**A group's table lives on its side.** `defaultPricing.selling.groups` names routes and no order
type, matching the side it sits inside; `defaultPricing.buying.groups` names order types and no route.
A group can never answer the side it was not set on.

**The tree and each item's market group are held outside React Query**, in
`Functions/MarketData/defaults/marketGroupData.js`, because the walk runs per material on every row of every
job — including from `shoppingList.calculateTotalValue`, a class method with no hook available.
`primeMarketGroupData()` awaits the tree once, from the same static-data refresh every other cached
file uses; every read after that is a synchronous lookup reporting absence rather than blocking.
`groupPricingFor` is the one function answering "can the rung fire" for both the panel and the
shopping list, so the two can never disagree about whether a group default applies to a given item.

**Setting a group default** is `Components/Settings/Standard Layout/Job Settings/marketGroupPricing.jsx`
and its picker, on the Settings page's Job Settings tab — see
[../settings/job-settings.md](../settings/job-settings.md).

## The vocabulary

Every in-memory name in the SPA is `marketLocation` (which market) or `orderType` (which side of the
book), including the rung each is answered from (`marketLocationRung` / `orderTypeRung`). Nothing
converts between two spellings of the same axis inside the SPA.

**`marketDisplay` and `orderDisplay` are not in-memory names — they are `MaterialPriceOverride`'s
stored field names**, on `layout.materialPriceOverrides[typeID]`, written as literal string keys by
the material row's override panel. `getEffectiveMaterialPriceHub` is where the boundary is visible:
it reads `override?.marketDisplay` and returns `marketLocation` — the document's name on the right,
the app's on the left. Renaming those two stored keys would be a `jobs` document migration for a
rename with no behaviour behind it, so they stay as they are; do not read `marketDisplay` /
`orderDisplay` anywhere else as though it were a second in-memory vocabulary.

The stored account and job documents agree with the SPA on the other axis: `PricingChoice` stores
`market` and `orderType` (see [../../backend/shared/pricing-defaults.md](../../backend/shared/pricing-defaults.md)),
so the only conversion left on that axis is `market` → `marketLocation`, at the store boundary.

`ORDER_TYPES` (`Context/defaultValues.jsx`) is the four options a reader chooses among — `buy`,
`sell`, `buyP95`, `sellP05` — never the chosen value; `MarketLocationSelect` / `OrderTypeSelect` /
`ExitRouteSelect` (`Styled Components/Select/{marketLocation,orderType,exitRoute}.jsx`) are the
controls named for the two axes.

## Resolving a market link, and pricing a watchlist row

`resolveMarketLinkTarget` (`Functions/MarketData/registry/marketLinkTarget.js`) is where every price-link
component — the market data and price history buttons — resolves a link with no market of its own to
point at: it reads the account's default for the side the figure beside it is on, so a link beside a
selling figure never opens the buying market. A caller's own `locationID` or `regionID` always
outranks the side.

`useWatchlistPricing` resolves both account sides once and hands each watched row a `buyingPrice` and
a `sellWorth` reader rather than each row resolving its own pair — see
[../dashboard/watchlist.md](../dashboard/watchlist.md).

## Topic-only detail

The account's stored shape, the schema upgrader's seed, and wire compatibility for removing a stored
field → [../../backend/shared/pricing-defaults.md](../../backend/shared/pricing-defaults.md).
