# Market price delivery — plan

**Status:** Phase 1 complete. **Stages A, B and C landed.** Every price in the SPA now comes from the
query cache, `worldData.marketData` is retired, the old `/api/v1/market-prices` endpoint is deleted,
and a market's own clock now decides what survives rather than an age guess. Next is Stage D, the
price cache's persistent tier.
**Code in scope:** [`frontend/src/`](../../../frontend/src/) — `Functions/MarketData/`,
`Functions/EveESI/World/`, `Functions/Endpoints/Public/`, `Functions/Shared/getMissingESIData.js`,
`Hooks/React Query/World/`, `Zustand/worldDataSlice/`, `Styled Components/Select/`,
`global-config-app.js`, and the surfaces listed in § Stage A and § The pipeline prices travel today;
[`services/api/v1endpoints/marketPricesQuery.go`](../../../services/api/v1endpoints/marketPricesQuery.go),
[`services/shared/redis/marketorders.go`](../../../services/shared/redis/marketorders.go),
[`services/shared/core/esi/locations.go`](../../../services/shared/core/esi/locations.go).
**Live SoT (until promote):** [frontend/](../../frontend/contents.md), [backend/](../../backend/contents.md)

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

**`go fix` in scope:** clean for `./shared/redis/...`, `./shared/core/esi/...`,
`./worker/tasks/esi/...` and `./core/scheduler/esi/...`. A scan of `./api/v1endpoints/...` reports
suggestions in `authenticate.go`, `refresh.go`, `session_types.go` and `statistics/live_scope_test.go`
— struct-literal consolidation and the `omitempty`/`omitzero` pair that `go fix` itself marks a
behaviour change. None is in a file this project touches, so all are left alone deliberately; JSON
tag semantics belong to
[go-127-adoption](../go-127-adoption/contents.md). Named here so a later scan coming back non-empty is
not mistaken for new debt.

## Why this project exists

The price path is the oldest thing in the application that has never been replaced. It asks a
question it does not need the answer to, answers a question it cannot actually know, and assumes a
world with exactly four markets in it.

**It asks too widely.** A caller wants one material's price at one market. The endpoint returns every
hub and every basis for that type, so a Planning stage reading four figures per material is sent
sixteen. On a full 500-type request that is **208 KB where 43 KB would do** — the measurements are in
[measurements.md](./measurements.md).

**It guesses at freshness.** The browser decides a price is stale when the single `lastUpdated` on
the blob is more than four hours old. That timestamp is the *minimum* across the four hubs, so a hub
nobody is looking at drags a type into a refetch — while the server knows exactly when each hub's
book was last walked and never says.

**It has no idea a market could be anything else.** `GLOBAL_CONFIG.MARKET_OPTIONS` and
`esicore.DefaultMarketLocations` are two hand-maintained copies of the same four hubs, and a market id
is assumed throughout to be one of them. The custom-structure work is about to make that false.

## What the present design costs

One request, end to end:

| Step | What happens today |
|------|--------------------|
| Ask | `POST /api/v1/market-prices`, up to 500 type ids, no market or basis named |
| Server read | A loop per type: one `GET` for the adjusted price, one `MGET` across the four hub regions. 500 types is about 1,000 sequential Redis round trips, none pipelined |
| Answer | Per type: four hubs × four bases, plus `adjustedPrice`, `lastUpdated` and `typeID`, flattened by a custom `MarshalJSON` so a hub id and a metadata field are both top-level keys |
| Hold | Merged whole into `worldData.marketData`, keyed by type id, in memory for the session |
| Re-ask | When the blob's single `lastUpdated` is over four hours old |

The server half beneath that — the hourly region walk, the ETag and page cache, the station filter,
the percentile trim — is sound and is not in scope.

## The pipeline prices travel today

Before any of it is replaced, this is the path a price takes, because it is what Stage B and Stage D
have to move and it is longer than the read sites suggest.

| Step | File |
|------|------|
| A flow collects the material ids of the jobs it is about to work on | `Functions/Shared/getMissingESIData.js` |
| Which of those ids to actually ask for is decided from the store and the age guess | `Functions/MarketData/findMarketData.js`, `refreshPeriod.js` |
| The request is made and batched to the 500-id cap | `Functions/Endpoints/Public/marketPrices.js` |
| The answer is written into the store by the caller, not by the fetch | `worldData.actions.addMarketData` |
| A price is read back synchronously | `findMarketData`, `getMarketPriceForType` |

`getMissingESIData` is the imperative entry point, called from nine places, none of them a render —
`buildNextMaterialsTree`, `massBuildMaterials`, `addNewJobsToPlanner`, `importFitFromClipboard`,
`instantiateGroupTemplate`, `childJobBuildPipeline` (which is also how `finaliseCreatedChildJobs`
reaches it), `useEditJobInitialState`, `importNewJob` and `groupFrame`. Each of them writes the result
into the store itself. That is the shape § Where a price is read from replaces with one cache and two ways of asking
it; a design that only accounted for the hook would leave every one of those flows behind.

## What a market source is

**The four default hubs are the only markets the server will ever serve.** They are shared
infrastructure: every account prices against them, so one hourly walk pays for all of them. A market
a single player added is that player's own concern, fetched by their browser and kept on their
device — whether it is a citadel or an NPC station in a region the server does not track. "Public" is
not the deciding word; *whose market it is* is.

Three kinds of source, and the price layer must answer for all of them behind one shape:

| Kind | Orders come from | Fetched by | Derived by | Held in | Clock |
|------|------------------|-----------|-----------|---------|-------|
| **Default hub** (4) | The region book, walked whole, filtered to the hub station | Server, hourly | Server | World-data store, session-scoped | One per hub |
| **Custom NPC station** | `/markets/{region_id}/orders` with `type_id`, filtered to the station | Browser | Browser | IndexedDB | One per source **and type** |
| **Custom citadel** | `/markets/structures/{structure_id}`, the whole book | Browser, with the reader's own token | Browser | IndexedDB | One per source |

**A custom citadel is how a private market is reached** — the two are one kind, not two. A reader who
wants a private market adds the citadel that market runs in, and it is queried with that reader's own
ESI token, which is what grants the access. There is no separate private-source kind beside it, and
nothing about a private market needs a different row, tier or clock from any other citadel.

### The two custom kinds are not one problem

They share a storage tier and nothing else. From the ESI specification (checked against the published
schema, not from memory — see [measurements.md](./measurements.md) § ESI market routes):

- `/markets/{region_id}/orders` is **public** and takes a **`type_id` filter**. A custom NPC station
  is therefore cheap and incremental: ask for the types the planner actually needs, filter the result
  to the station's `location_id`. The SPA already has exactly this call in
  [`Functions/EveESI/World/getMarketData.js`](../../../frontend/src/Functions/EveESI/World/getMarketData.js),
  ETag support included.
- `/markets/structures/{structure_id}` is **authenticated** and has **no type filter**. A citadel's
  price for one type can only be had by walking its entire order book. That is a large, all-or-nothing
  fetch, which is what makes IndexedDB load-bearing here rather than a convenience: a book walked once
  must not be walked again next session.

Two consequences worth settling before any code:

- **A new ESI scope.** `esi-markets.structure_markets.v1` is not among the scopes the SPA requests
  today. Adding it re-authorises every linked character, which is an operational event, not a code
  change.
- **Which character can read the book.** Nothing records which character holds docking access at a
  structure, so the book is attempted per character in turn and one character's refusal is not the
  account's answer. This is the same rule the SPA already follows for resolving structure *names*, and
  the same implementation shape should serve both.

### Keeping a reader-saved source current

A hub's book is re-walked on a schedule so its prices do not drift. A reader-saved source has to be
kept current the same way and for the same reason — a figure a player plans against must not be a
figure that happened to be fetched once — but the browser is what does the walking, and the two
custom kinds pace differently.

**ESI's own cache expiry is the clock**, not a period the SPA picks. Each response says when the data
behind it changes, and a source is due when that moment passes. A period of our own would either ask
too often, spending the reader's ESI allowance on a book that has not moved, or too rarely, and quote
a stale figure with no way of knowing it.

**Several NPC stations in one region cost one request.** `/markets/{region_id}/orders` answers for the
whole region, so a reader with three stations in Domain asks once per type and splits the answer
across them by `location_id`. The unit of a request is therefore the **region**, while the unit of a
row stays the source. Grouping happens in the loader, so no call site has to know two of its sources
share a region.

**A citadel is refreshed whole, on its own cadence.** Its book has no type filter, so a walk fills
every type it holds at once and a want for one type is answered for all of them. That makes a
demand-driven walk the worst way to do it — the first material a panel prices would pay for the
entire book — so the book is walked on its expiry and the rows are already there when a panel asks.

**The walk needs a live token, and that is the same problem the name path already solved.** A
structure's market is read with a linked character's token, exactly as a structure's name is, and
nothing records which character can reach it.
[`nameLoader`](../../../frontend/src/Functions/EveESI/World/nameLoader.js) already asks each linked
character in turn, refuses to let one character's refusal settle the account's answer, skips a
character whose token never carried the scope, and keeps a transient failure from being cached as an
answer. Two implementations of that would drift, and would then disagree about whether an account can
see a structure it can see.

**So the walk is extracted before it is reused, and that extraction is the work.** The machinery sits
in `settleStructureName`, which is private to the module, reads from its own batching queue, and ends
in `communityNameOrRefusal` — a name-specific fallback a market has no equivalent of. Taking it as it
stands is not possible; what lands is a parameterised per-character walk in shared code — the request
to make and what counts as a refusal passed in, no fallback of its own — with **both** name
resolution and the market walk calling it. Name resolution keeps the community fallback by supplying
it, not by the primitive knowing about it.

### Where a price is read from

Prices must be readable from one place whatever kind of source they came from, and the SPA already
has the pattern for this: the name cache, where **every unit is its own React Query entry and a
loader behind it turns a tick's worth of wants into whatever shape each transport takes**
([frontend/esi-collections/location-names.md](../../frontend/esi-collections/location-names.md) is
its live SoT). Prices have the same shape of problem — many small units, wanted by many views at
once, answerable from more than one transport — so they take the same answer.

- **One cache entry per type at one source**, so a price resolved for one panel is present for the
  next without being asked for again, and a source that fails fails against that source rather than
  leaving a hole in one view's set.
- **One loader beneath it**, which is where the three transports differ and the only place that
  difference lives: the tick's wants grouped by source, hub wants issued as one API query, station
  wants grouped by region and split back out by `location_id`, citadel wants served from a book
  walked on its own clock.
- **One accessor above it**, so a caller asks for a type at a source and never learns which kind it
  was.

**Reading and asking are separate, and the accessor is the reading half.** It answers from what the
cache already holds and reports absence rather than waiting — which is what every caller already
copes with, because `findMarketData` returns a zero-filled shape today. That is what keeps the
synchronous readers working: `Classes/shoppingList.js` reads a price inside a row build, and
`materialCostByBasis` takes a `getPrice` callback it calls in a reduce. Neither can await, and
neither has to.

Asking is the other half, and has the two entry points the name cache has: the hook for a view that
wants prices while it renders, and an imperative `fetchPrices(queryClient, wants)` for a flow already
running outside render — which is what `getMissingESIData` becomes. Both share the one cache, so a
price either path resolves is present for the other.

`worldData.marketData` stops being the price store, and **Zustand keeps nothing of this at all.** An
earlier draft had it holding the source registry; Stage A found that putting a constant in state made
store initialisation depend on app config, so the registry is composed by `allMarketSources()` instead
— see [overlay.md](./overlay.md) § The registry is not in the world-data store.

The read-through beneath the cache, which is `worldData.universeIDs`'s role in the name design,
becomes **IndexedDB** for the sources that need to survive a reload.

### One price, whoever derived it

A row is `{ buy, sell, buyP95, sellP05 }` for one type at one source, and a caller asking for the
price of a type at a source must not need to know which kind the source is, who fetched it, or where
it is held. One accessor answers; the tier is a property of the source, resolved beneath it.

This puts a real hazard in the open: the derivation — best bid, best ask, nearest-rank percentile with
the under-five-orders fallback to the best price — lives today in `buildMarketPriceEntry` in Go, and a
browser deriving a custom source's row has to produce the same figures from the same orders. That is a
second implementation of one rule, which is exactly what the one-source-of-truth bar exists to stop.
It cannot be avoided by moving work to the server, because the whole point of a custom source is that
the server does not fetch it. How the two are held in agreement is an open decision below.

## Freshness belongs to the source

A default hub's order book is walked as a whole, hourly, and every price it produces shares that one
moment. The server publishes each hub's clock; the browser holds, per hub, the clock its rows came
from, and asks for a type when the row is **missing** or the **hub's clock has moved**. The four-hour
age guess goes.

The unit differs by kind, because the fetch does — the Clock column of the table in § What a market
source is carries which. What paces a reader-saved source, and what it costs, is § Keeping a
reader-saved source current.

The practical effect on the hubs: a second job opened on the same materials within the hour asks for
nothing at all, where today it re-downloads every price whose blob happened to cross the four-hour
line.

**The clock arrives with the rows, and there is nothing to poll.** Every stored price already carries
the moment its region was walked — `MarketPriceEntry.LastUpdated`, written from the same timestamp as
the region's own refresh mark, in the same pass of `refreshRegionMarketOrders`. So a row states its own
age, and a browser holding rows can decide whether to ask again without a round trip to find out.

That retires a question this plan previously asked twice. An earlier draft had the hub clocks coming
from a status read of their own, while § The unit of a price had `refreshedAt` inside the price
response — two answers to one question, and the endpoint version was the one free to disagree with the
rows it described.

**And with the clock gone, there is nothing left for a source endpoint to serve.** What remained was
four rows of `{id, name, regionID, stationID}` that move only when a deploy moves them — a request on
every boot, an asynchronous dependency for readers that are synchronous today, and a route to keep,
in exchange for static configuration. It was built, and removed before it was committed.

**The two copies are held together by a test instead.** This repository already answers "two sides
must agree about a shape" without a runtime call: a fixture generated from the Go side, committed, and
asserted by a test on both — `testing/fixtures/session-responses/surface.json`, written by
`session_response_surface_test.go` and read by `sessionResponse.parity.test.js`. A drift fails CI
rather than reaching a client, which is the failure this was ever about: someone adds a fifth hub
server-side and the SPA does not know.

So the SPA keeps a constant, `esicore.DefaultMarketLocations` stays the source of truth, and a parity
test fails when they disagree. The SPA's full source registry is that constant plus whatever sources
the reader has saved — available at module load, as it is today.

**If the list ever stops being static** — server-controlled at runtime, or differing per account — that
is when it earns a transport. Nothing in this project makes it so: reader-saved sources arrive on the
planner document (§ Stage F), not from the server's list.

**The refresh cadence is ESI's, not a number this app picks.** `recordNextRefresh` takes the page's own
`max-age`, and the scheduler ticks every fifteen minutes publishing only the regions ESI says can have
changed. In practice that lands around hourly, but nothing should hard-code an interval: the row's
timestamp is the honest signal, and a fixed guess is how the four-hour rule went wrong in the first
place.

## The unit of a price

**One type at one source.** A row carries the four bases and nothing else; the source carries the
clock.

```
POST /api/v1/market-prices/query
{ "sources": ["jita"], "typeIDs": [34, 35, 36], "adjusted": true }

{
  "sources": { "jita": { "refreshedAt": 1757000000000,
                         "prices": { "34": { "buy": …, "sell": …, "buyP95": …, "sellP05": … } } } },
  "adjusted": { "refreshedAt": 1756900000000, "prices": { "34": 4.9 } }
}
```

The endpoint only ever answers for the four server-held hubs; a request naming a custom source is a
client-side mistake and is rejected rather than silently empty. Three things follow from the shape:

- **The caller names the sources**, so a surface pricing against one market carries one market's
  figures. Rows where the market holds no order for a type are absent rather than a block of zeroes.
- **All four bases stay together in a row.** Narrowing to one would save a further tenth and break the
  basis picker: [`materialCostByBasis`](../../../frontend/src/Functions/MarketData/materialPricing.js)
  prices the whole job on all four so a player choosing one sees its effect rather than its name.
- **The adjusted price is its own block.** It is source-independent and refreshes daily, so repeating
  it inside each row would tie a figure that has not moved to the clock of one that has. It is asked
  for by flag — only installation cost estimation reads it — and carries its own clock.

The response is a plain nested object, which retires the custom `MarshalJSON` and the ambiguity of a
top-level key being either a hub or a metadata field. The handler reads through one pipelined Redis
round trip per source rather than a loop per type.

## Two tiers of storage

Both tiers are the same cache. What differs is whether anything survives beneath it when the tab
closes.

| Tier | What it holds | What is beneath the cache | Why |
|------|---------------|---------------------------|-----|
| Session | Rows and clocks for the four default hubs, adjusted prices | Nothing — a reload asks the API again | Server-cached and cheap to ask for again |
| Persistent | Rows and clocks for every reader-saved source, public station and private citadel alike | IndexedDB, read through on a cache miss and written on resolve | Fetched at the reader's own expense — a citadel book walk especially — and never re-derivable for free |

A source declares its tier in one place and nothing above the loader branches on it. The SPA holds
nothing in IndexedDB today, so the persistent tier is new ground.

## Wire compatibility

| Surface | Change | Note |
|---------|--------|------|
| `POST /api/v1/market-prices` → `/query` | **Breaking** | Request becomes a market-to-types map plus its own adjusted-price list, in place of a flat type list; response is reshaped and the flattened top-level hub keys go. The endpoint is public and unauthenticated, but the SPA is its only consumer and the two ship together, so the shape is cut over rather than versioned |
| `worldData.marketData` | **Breaking, SPA-internal** | Retired. Prices move to a React Query entry per type and source, read through one accessor. Nothing replaces it in the store: the source registry is composed outside it (Stage A), so `worldData` loses market data entirely |
| ESI scopes | **Migrate-required** | Citadel sources need `esi-markets.structure_markets.v1`, which the SPA does not request today. Every linked character must re-authorise. Scopes are operator configuration, not in-repo, so this is a deployment step and needs its own call-out at Stage E |
| Stored documents | **Additive** | Saved market locations are saved sale locations, a `CustomStructures` lane on the planner document. An additive field plus an upgrader step, with the Invention lane's v0→v1 addition as a worked precedent. The price *data* is IndexedDB and touches no server shape |
| IndexedDB store | **Additive** | New, versioned from the first write |

## Stage A — The source registry

The SPA's four hard-coded markets become a registry that admits more than four. The hubs stay a
constant — they are static configuration, and a test is what stops them drifting from the server's —
but nothing above the registry may assume the set is those four, or that a source is one of them.

1. ~~A parity test holds the SPA's hub list and `esicore.DefaultMarketLocations` in agreement, on the
   pattern of the session-response surface.~~ Done — `testing/fixtures/market-hubs/hubs.json`, written
   by `shared/core/esi/locations_parity_test.go` and read by `global-config-app.parity.test.js`. See
   [overlay.md](./overlay.md) § A1. **No endpoint**: the list is static configuration, and the clock it
   would once have carried now arrives with the prices.
2. ~~The SPA holds a source registry: the hubs the server prices, each marked as server-held, with
   room for reader-saved sources to join them.~~ Done — **not in the world-data store**, as this item
   first said. Putting a constant in state made store initialisation depend on app config and broke
   two tests that mock it partially; `allMarketSources()` composes the registry instead, which is the
   same single seam without the coupling. See [overlay.md](./overlay.md) § The registry is not in the
   world-data store.
3. ~~Retire `GLOBAL_CONFIG.MARKET_OPTIONS` and move its readers onto the registry.~~ Done — the
   constant now has exactly one reader, the registry that builds from it. **Eight consumers,
   not the thirteen this plan first counted** — [market-pricing-defaults](../market-pricing-defaults/contents.md)
   consolidated five of them away while this project waited:

   | Reader | |
   |--------|--|
   | `Functions/MarketData/marketLinkTarget.js` | **New, and the reason the count fell.** The market data and market history icon and typography components each resolved their own link target; they now all call this |
   | `Zustand/worldDataSlice/marketData.js` | |
   | `Styled Components/Select/marketLocation.jsx` | |
   | `Styled Components/LineGraph/priceHistory.jsx` | |
   | `Returns/saleLocationRates.jsx` | |
   | `Materials And Sourcing/Helpers/marketLabelHelpers.js` | |
   | `Market Costs Panel/marketCostsPanel.jsx` | |
   | `Functions/MarketOrders/saleLocations.js` | |

   `basicMineralOutput.jsx` is off the list for the same reason, and `marketPriceForType.js` and both
   `marketHistory` components now name `MARKET_OPTIONS` only in stale JSDoc rather than in code —
   worth correcting as they are passed, not worth a visit of its own.
4. ~~`DEFAULT_MARKET_OPTION` stays in config: it is a default *choice*, not a copy of the list.~~ Done.

**Done when** the SPA holds no hand-maintained market list, every surface reads sources from the
registry, and no surface assumes a source is one of four.

## Stage B — The price row and the narrowed query

1. ~~Reshape the endpoint to `/query` with the sources and types a caller wants, and the nested
   response above. Reject a source the server does not hold.~~ Done, as
   `api/v1endpoints/marketPricesQuery.go`. The old `/market-prices` and its custom `MarshalJSON` were
   deleted once the SPA had moved, in the same change, along with the `PricesByType` Redis reader
   that only it used. Removing a public endpoint is breaking, and safe only because its one caller
   moved with it.
2. ~~Pipeline the handler's Redis reads — one round trip per source, one for adjusted prices.~~ Done,
   on `PricesAtLocation` and a new generic `Entries` for the cached dataset. The adjusted block was
   written as a loop first and corrected: it is the same per-type round trip this stage exists to
   remove, sitting next to the reads that had already been fixed.
3. ~~Put every read behind the single accessor that `getMarketPriceForType` is already most of.~~
   Done. It has grown to cover everything callers reached into the store for —
   `getAdjustedPriceForType` and `getPriceRefreshedAt` beside it — and all three read the cache.

   **The rekey is dropped**: the store goes rather than changing shape first — see § The store is not
   rekeyed — it goes.
3b. ~~The query cache beneath the accessor: an entry per type at one source, and the loader that turns
   a tick's wants into requests, following the name cache's shape (§ Where a price is read from).~~
   Done, as `priceCache.js` over `priceLoader.js`. Moved here from Stage D.
4. ~~Move the pipeline in § The pipeline prices travel today onto the new shape.~~ Done.
   `findMarketData`, `refreshPeriod.js`, the old endpoint client and the whole `marketData` store
   slice are deleted; `getMissingESIData` resolves prices into the cache and returns only the system
   indexes its callers still pass on.
5. ~~Move every call site onto naming the source it wants.~~ Done, and **one module answers that
   question for all of them**: `priceResolution.js` owns `sideDefaults` + `resolveFor`, so the path
   deciding what to fetch and the path reading it back cannot resolve different markets. Consolidating
   them exposed a live defect — the fetch path was skipping the job's own choice of market while every
   reader honoured it — which is the failure the shared module exists to prevent.
6. ~~Delete `Functions/MarketData/refreshMarketData.js` and `Functions/MarketData/requestChunks.js`,
   which nothing imports.~~ Done. The near-identical `requestChunks.js` under `Functions/System
   Indexes/` is **live** and was left alone.

**Done when** a request carries the sources it wants, the response carries only those, no caller reads
a price without naming a source, the handler no longer loops per type, and the old endpoint is gone.
**All met.**

### The store is not rekeyed — it goes

**Settled: `worldData.marketData` is retired here rather than reshaped first.** An earlier draft of
item 3 rekeyed it to type-and-source, and Stage D then deleted it — two stages of life for a shape
nothing was meant to keep, and the rekey is not small, because it is the moment every reader either
goes through the accessor or breaks.

So **Stage D items 1 and 2 move into this stage**: the query cache entry per type and source, and the
accessor over it. Stage D keeps the persistent tier alone. Neither moved item needs IndexedDB — the
session tier is "behaves as today: lost on reload", which is a plain query cache, and the library
choice that is still an open decision belongs to the persistent tier only.

Two things follow. The store is retired **once**, rather than reshaped and then retired. And
§ It retires the alternative price table lands a stage earlier than planned, which is the more
valuable half: eleven files stop threading a price table beside the one they are reading from.

The accessor half of item 3 is already done and is what makes this cheap — every price in the SPA is
read through `getMarketPriceForType`, so what is beneath it can change in one place.

## Stage C — Freshness from the source's clock

1. ~~The browser records, per source, the clock the rows it holds came from — per source and type for a
   source fetched per type. **It comes from the price response**, which carries each source's
   `refreshedAt` beside that source's rows; nothing is polled to learn it, and no request exists whose
   purpose is to report it.~~ Done, as `sourceClocks.js`, written by the loader from every answer —
   see [overlay.md](./overlay.md) § C1, § C2.
2. ~~A fetch is decided by missing rows or a moved clock; `doesMarketItemRequireRefresh` stops being the
   rule for prices.~~ Done. `PRICE_STALE_TIME` is `Infinity` and a moved clock **removes** the market's
   rows — invalidating them is not enough once nothing is stale by age. Reaching a surface that is
   already open needed more than the cache: see [overlay.md](./overlay.md) § C4, § C5.
3. ~~`DEFAULT_ITEM_REFRESH_PERIOD` and `Functions/MarketData/refreshPeriod.js` are deleted.~~ Done
   early, in Stage B: both were orphaned the moment `findMarketData.js` went, and leaving a staleness
   rule in the tree that nothing consults is worse than deleting it a stage ahead of its item. The
   System Indexes `refreshPeriod.js` is a different file and is untouched.

**Done when** no price is asked for twice while its source's clock has not moved, and no price
survives a walk that produced a new figure.

## Stage D — The price cache and its two tiers

1. ~~A React Query entry per type at one source, with the loader beneath it.~~ **Moved to Stage B**
   as item 3b — see § The store is not rekeyed — it goes.
2. ~~One accessor above it, retiring `worldData.marketData`.~~ **Moved to Stage B.** The accessor
   itself already exists; what moved is retiring the store beneath it.
3. The session tier behaves as today: lost on reload — which is what the cache Stage B builds already
   does, so this stage inherits it rather than building it.
4. The persistent tier reads through IndexedDB beneath the cache, versioned, with a documented path
   for a schema change and for eviction. Store and shape settled — see § How the persistent tier is
   stored. It enters at one seam, the `queryFn` inside `fetchPrices`, and must record a source's clock
   as it reads that source's rows back.
5. Stage E is the persistent tier's first consumer, so this stage lands with it close behind rather
   than waiting for a second tenant to prove it.

**Done when** every price in the SPA is read through one accessor, no caller knows which kind of
source answered, hub prices still vanish on reload, a row written to the persistent tier survives one,
and no caller passes a price table alongside the one it is reading from.

### It retires the alternative price table

The clearest present-tense reason for this stage is not IndexedDB. It is that **a fetch does not land
anywhere a reader can see**, so every caller carries the result by hand:

```js
const prices = await getMarketData(ids);      // fetch into a local object
shoppingList.calculateTotalValue(prices);     // use them now…
addMarketData(prices);                        // …and only then write them down
```

That middle argument is `alternativePriceLocation` — also called `additionalMaterialPrices`,
`newMarketPrices` and `alternativeLocation` — and it is threaded through **eleven files**:
`shoppingList`, `job`, `jobSetup`, `materialCostFromChildJobs`, `installCosts`, three Reprocessing
modules, and bottoming out in `findMarketData`, which takes it as a second lookup table to try before
its own state. **Twelve call sites** then write the same object into the store afterwards.

A cache where resolving the fetch *is* the write removes all of it: the loader resolves, the accessor
reads, and there is no interval in which a caller holds prices the reader cannot see.

**Three silent failures go with it.** A caller that forgets to pass the table reads zeroes and states
a wrong total; one that forgets `addMarketData` refetches for the life of the session; and two flows
wanting the same type both fetch it, because `getMarketData` filters against a store neither has
written yet. None of the three announces itself.

**The same workaround exists for system indexes** — `findSystemIndex` takes the same second table, and
`findSystemIndexValue` threads it. Out of scope here, but it is the same shape and the same cause, so
whatever this stage settles is the answer there too.

**What it costs.** The non-React readers — `shoppingList`, `Job` and `jobSetup` are classes,
`fromMinerals` is a plain function — cannot call a hook, so the accessor needs a module-level handle
on the query client. The name cache already solved exactly this; take its answer rather than inventing
a second one.

## Stage E — Sources the browser fetches

1. Derivation in the SPA: best bid, best ask, nearest-rank percentile with the under-five fallback,
   producing the same row shape the server produces, held in agreement with the Go implementation by
   whatever § Open decisions settles on.
2. **Custom NPC station:** per-type region orders filtered to the station's `location_id`, built on
   the existing `getMarketData` call and its ETag handling. Rows and per-type clocks to the persistent
   tier.
   Several stations in one region share one request per type, split back out by `location_id`.
3. **Custom citadel:** the whole-book walk on the reader's own token, through `nameLoader`'s
   per-character machinery **extended** rather than copied — it already asks each linked character in
   turn, keeps one refusal from settling the account's answer, skips a character whose token lacks the
   scope, and refuses to cache a transient failure as an answer. One clock for the whole source.
4. Each source refreshed on its own ESI expiry rather than on demand, so a panel pricing its first
   material does not pay for a book walk. **Its home exists:**
   `Functions/MarketData/priceRefreshSchedule.js`, started from `index.jsx` and owned by no component
   — see [overlay.md](./overlay.md) § C2. Add each source's expiry there rather than building a second
   mechanism beside the fetching.
5. The accessor from Stage D answers for these sources without its callers changing.

This stage builds against the placeholder accessor that already exists for saved locations —
`Functions/MarketOrders/saleLocations.js` returns placeholder rows today — so Stage F slides the real
list in behind it.

**Done when** a price at a reader-saved source reads through the same accessor as a hub price,
survives a reload, stays current without being asked for, and costs one request per region rather
than one per station.

## Stage F — Custom market locations

The stored list of markets a reader has added, and the surface for adding one.

**A market source and a selling point are the same saved row.** A reader adds a location once, as a
selling point in the `CustomStructures` family, and that same row is the market its prices are read
from. So the source registry is the four server hubs plus the reader's saved sale locations, and there
is no second list of markets beside them.
[`Functions/MarketOrders/saleLocations.js`](../../../frontend/src/Functions/MarketOrders/saleLocations.js)
already normalises a hub and a saved structure into one shape through `resolveSaleLocation`, and is
where a source resolves — not a parallel accessor.

1. Build the lane from the shape [planning-stage-panels](../planning-stage-panels/plan.md) § Handed to
   the custom-structure work worked out, widened to carry a saved **NPC station** as well as a
   structure. `resolveSaleLocation` already treats a named station as a choice of its own; today the
   only stations it can name are the four hubs, because `MARKET_OPTIONS` is the whole list of them.
   A station's broker fee stays derived from the seller's standings, and a structure's stays the rate
   its owner set — that difference is `SALE_LOCATION_KIND` and is not this project's to change.
2. No character is stored on a row. Which characters can reach a structure is answered by asking them,
   not by recording an answer that goes stale when a character is linked or loses access.
3. The surface for adding, editing and removing one, built from the shared component library.
4. Replace the placeholder rows in `saleLocations.js` with the stored list — a change to that one
   file, which is what the placeholder was shaped to allow.

**This project is the custom-structure work, for markets.**
[planning-stage-panels](../planning-stage-panels/plan.md) and
[market-pricing-defaults](../market-pricing-defaults/contents.md) both hand saved citadels to an
unnamed "custom-structure work"; for anything to do with pricing against one, that work is this stage.
The other `CustomStructures` lanes are not affected and stay wherever they are taken up.

`CustomStructures` already carries per-planner lanes of named, player-defined locations, and that
handover worked the sale lane's shape out — including that the structure id is stored precisely so a
later project can query the structure's own market, which is this one.

That section's `SaleStructure.PriceHub` exists because the app holds no prices for a structure, so a
job selling from one prices against a hub instead. Once this project can price a structure directly,
that field becomes a fallback for a structure whose own market is empty or unreachable rather than the
only answer — a change to what it means, which belongs in this stage rather than being left implied.

**Done when** a reader can add an NPC station or a citadel as a market, price against it anywhere a
hub can be priced against, and the placeholder is gone.

## What Stage D and E actually need

Checked against the tree on 2026-09-14, because the stage text was written before Stages B and C
landed and several of its items have since been done elsewhere.

**Stage D is nearly empty.** Items 1, 2 and 3 landed in Stage B or are inherited from it; what is
left is item 4, the persistent tier, and item 5's sequencing note. The stage's most vivid section —
retiring the alternative price table threaded through eleven files — **is already done**: no
`addMarketData` or `findMarketData` reference survives anywhere in the SPA. The seven remaining
`alternativeLocation` references are all `findSystemIndex`, which this project scopes out.

**Stage D has no consumer until Stage E.** Only reader-saved sources go in the persistent tier; the
four hubs stay session-only by design (§ Two tiers of storage). Building D first means building a
store with nothing to put in it, and guessing at what it must hold — per-type clocks for a station,
one clock for a citadel — before Stage E has settled either. **Take D and E together, E leading.**

**Stage E's two hard parts are in better shape than the stage text assumes.**

- The per-character citadel walk item 3 wants *extended rather than copied* already exists as
  `settleStructureName` in `Functions/EveESI/World/nameLoader.js`. It asks each linked character in
  turn, keeps one refusal from settling the account's answer, skips a character whose token lacks the
  scope, and refuses to cache a transient failure as an answer — which is the whole contract item 3
  describes.
- The Go derivation item 1 must reproduce is `percentilePrice` in
  `services/worker/tasks/esi/refreshRegionMarketOrders.go`: roughly fifteen lines, nearest-rank
  `ceil(p × N)` clamped into the sorted slice, with a fallback below `minOrdersForPercentile`. Small
  enough to port exactly, which makes the fixture in § Open decisions cheap to honour rather than a
  project of its own.

**Stage F's seam is intact.** `saleLocations.js` still returns the two placeholder citadels,
unexported and deliberately disagreeing on every field that changes a figure, so replacing them with
the stored list stays a change to that one file.

## How the persistent tier is stored

**Decided: read-through, on `idb-keyval`.** IndexedDB sits *beneath* the cache — a miss falls through
to disk before reaching the network, and a resolve writes both. This is what § Where a price is read
from describes, and the alternative was TanStack's own persister, which sits *beside* the cache and
dumps it to disk on change.

Both were examined at the installed `@tanstack/query-core` 5.102.8, and the persister was built as a
throwaway spike against a real IndexedDB before being backed out. What it proved:

- **The persister's tier split works.** `shouldDehydrateQuery` filters per query and the callback sees
  the whole `Query`, so it can read the source id from the key. Seeded two hubs and one citadel;
  only the citadel row was written, and a fresh client restored it without the hubs.
- **`gcTime` decided it.** `Removable` defaults it to `3e5` — five minutes — so an unobserved entry is
  collected before it is ever persisted. The persister therefore needs `gcTime` raised to at least its
  `maxAge`, which means holding **every** price in memory for that long, hub rows included. That is
  the opposite of what the two tiers are for. Under read-through an evicted entry simply falls through
  to disk next time, so memory stays a true cache.
- **Lazy beats eager here.** Read-through loads the rows a panel asks for; the persister restores the
  whole persisted set at startup, before the first render.
- **It keeps Stage C's machinery intact.** `fetchPrices`, the loader and the clock-moved listener carry
  real invariants now — `ensureQueryData` at `staleTime: Infinity`, removal rather than invalidation,
  and waking the wrapper query. Read-through enters at one seam, the `queryFn` inside `fetchPrices`.

**The precedent this design cites no longer exists.** § Where a price is read from says the
read-through is what `worldData.universeIDs` is to the name design. `universeIDs` is gone, and the
name cache persists nothing at all — resolved names are session-scoped by deliberate decision. So
read-through is the better fit on its merits, not because it is the proven pattern here; nothing in
this repository has a persistent tier yet.

### What persistence must do about the clock

**Rows survive a reload; the clock record does not.** Clocks live in a module-level `Map` in
`sourceClocks.js`, so a reload starts with none — proven in the spike, and true of either storage
design. A source with restored rows and no clock is invisible to `clockedSources()`, so the probe
skips it and those rows are never checked again, which is the reverse of what Stage C is for.

**So restoring rows must restore the clock with them.** Every row already carries the `refreshedAt`
it arrived with, so the clock can be derived from what is read back rather than stored a second time —
one fact, not two that can disagree. Whatever reads a source's rows from disk records that source's
clock as it does so.

This is the same defect shape as rows seeded in tests without a clock, which `tests/seedPrices.js`
already had to fix. A third occurrence would say the row and its clock should not be separable at all.

### Dependencies

`idb-keyval` **6.3.0** (Jul 2026) is the store: `get` / `set` / `del`, and nothing else is needed
because the read-through addresses entries by key. Dexie **4.4.6** is more actively maintained and
would earn its place only if something needed querying by index, which this does not. `idb` **8.0.3**
last shipped May 2025 and is the least current of the three. `fake-indexeddb` is the dev dependency
that lets a test exercise any of it, since jsdom has no IndexedDB.

## Left out on purpose

**The Market Data and Price History dialogues** read region order books and history straight from ESI
in the browser, paginating client-side against the reader's own ESI allowance — while the server
already holds the four hubs' region pages in Redis behind `regionPageKey`. Serving the hub case from
the server would remove a second transport for the same data. It is excluded from this project's scope
by decision, and recorded here because the argument does not go away. Note that Stage E gives the
browser a legitimate version of this path for custom sources, where there is no server copy to serve.

## Non-goals

- Changing how the server builds the four hubs' books, or the meaning of the four bases.
- Deciding which market or basis a figure is priced against — [market-pricing-defaults](../market-pricing-defaults/contents.md).
- Serving any reader-saved market from the server, private or public.

## Open decisions

| Question | Notes |
|----------|-------|
| **How the Go and JavaScript derivations are held in agreement.** Options: a fixture file in the repo (order books in, expected rows out) that a test on each side reads, so a change to one without the other fails; or generating the JavaScript from the Go; or accepting drift and testing each alone | The fixture is the cheapest thing that actually catches a divergence, and the repo already keeps shared fixtures for the SPA. Decide before Stage E writes a line of derivation |
| ~~Persistent storage — TanStack's own persister, Dexie, or `idb`~~ | **Decided: read-through on `idb-keyval`**, the persister spiked against a real IndexedDB and backed out. `gcTime` decided it — see § How the persistent tier is stored, which also carries what persistence must do about the clock |
| When the `esi-markets.structure_markets.v1` scope is added — with Stage E, or earlier so the re-authorisation rides a release that is already asking for one | Adding a scope re-authorises every character; it should not be its own event if it can avoid being one |
| Whether a citadel book walk is bounded, and what happens to a reader who saves a structure with a very large book | Unknown until measured. Stage E |

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | Done |
| Stage A — The source registry | **Done.** A parity test holds the SPA's hub list and `esicore.DefaultMarketLocations` together with no endpoint; `allMarketSources()` is the registry every consumer reads, and `MARKET_OPTIONS` has one reader left. The registry is not in the world-data store — see [overlay.md](./overlay.md) § A1, § A2-A4 |
| Stage B — The price row and the narrowed query | **Done.** Every price is read from the query cache through one accessor; `worldData.marketData` and the alternative price table are retired; every surface resolves its market through `priceResolution.js`, so the fetch and the read cannot disagree; the old `/market-prices`, its `MarshalJSON` and the `PricesByType` reader are deleted — see [overlay.md](./overlay.md) § B1-B5 |
| Stage C — Freshness from the source's clock | **Done.** A market's own clock decides what survives: `sourceClocks.js` holds it, every price answer records it, and a moved one removes that market's rows and wakes the query holding each open surface. The age guess is gone — `PRICE_STALE_TIME` is `Infinity`. A fifteen-minute probe asks one held type per market so nothing polls for a clock. SPA-only; the wire did not move — see [overlay.md](./overlay.md) § C1-C5 |
| Stage D — The price cache and its two tiers | Not started |
| Stage E — Sources the browser fetches | Not started |
| Stage F — Custom market locations | Not started |

## Start here

**Stage D.** Stages A, B and C are done — the registry is read everywhere, every price travels through
the narrowed query into one cache entry per type per market, and each market's own clock decides what
survives ([overlay.md](./overlay.md) § A1-A4, § B1-B5, § C1-C5). What is left of Stage D is the
persistent tier alone; its items 1 and 2 moved into Stage B and have landed.

**Read [overlay.md](./overlay.md) § C5 before touching the cache.** A priced surface subscribes to no
row entry — it reads figures synchronously while rendering — so anything that changes what is held
must also wake `useMarketPricesQuery`, and that query only notifies on fields its caller actually
reads. A change to the cache that does not account for this is invisible in unit tests and visible to
a reader as figures that never update.

**Stage E is the persistent tier's first consumer**, so expect it close behind rather than a stage
finished in isolation — § Stage D item 5 says the same, and § What Stage D and E actually need
recommends taking the two together with E leading, having checked each stage's items against the
tree. Read that section before planning either: most of Stage D is already done.

**What the wait bought.** The one project this one depends on,
[market-pricing-defaults](../market-pricing-defaults/contents.md), is finished bar a deploy, and it
left this project less to do rather than more:

- **Stage A was smaller.** Five of the thirteen `MARKET_OPTIONS` readers had been consolidated away,
  four of them behind the single `marketLinkTarget.js` — see § Stage A item 3.
- **Stage B item 5 has its answer.** The resolver it names is built, so "name the source you want" is
  a call the code can already make rather than a thing to invent alongside.
- **Stage B item 3 inherits guards.** The unguarded `findMarketData(typeID)[market][basis]` reads were
  guarded by that project, because the split made an unrecognised id reachable. Those guards sit on the
  function this stage rekeys and puts behind one accessor, so expect to reshape them rather than
  preserve them — that project's plan says the same from its side.

**One name to know before reading its code.** That project renamed the SPA's pricing vocabulary: a
market is `marketLocation` and a pricing basis is `listingType`, everywhere except where a name is a
stored document key. The `marketDisplay` / `orderDisplay` still in the tree are `MaterialPriceOverride`
keys and are not the in-memory vocabulary.
