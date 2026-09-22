# Market price delivery — overlay

What changed and how each part works **after** the change. Live docs remain the truth wherever this
file has no entry. Fill a section as its slice lands; do not pre-write behaviour that has not shipped.

Promote target on go-ahead: [frontend/](../../frontend/contents.md) and
[backend/](../../backend/contents.md).

## Stage A — The source registry

### A1 — The two hub lists are held together by a test

`models.DefaultMarketLocations` is the source of truth for which markets this server prices.
`testing/fixtures/market-hubs/hubs.json` is derived from it by
`shared/models/market_hubs_parity_test.go`, committed, and read by
`frontend/src/global-config-app.parity.test.js`, which checks the SPA's `MARKET_OPTIONS` against it.
Either side moving without the other fails a test rather than reaching a reader.

**No endpoint.** The list is static configuration — four rows that move when a deploy moves them — so
it is not worth a request on every boot, and it stays a constant the SPA can read at module load.
[plan.md](./plan.md) § Freshness belongs to the source carries why, including the clock that was once
the reason to serve it.

**The fixture is keyed by id, not ordered.** The server lists Jita first; the SPA lists the four
alphabetically, because that is the order a reader picks from. Keying by id says order is not part of
the agreement, rather than forcing one side to carry the other's.

**It is written in the SPA's field names** — `regionID`, `stationID` — rather than the wire's
`region_id` / `station_id`. The file exists to be read by the SPA, so the comparison on that side is a
direct one with nothing to translate and nothing to get wrong while translating.

**Each assertion was checked against the drift it is there to catch**, because a fixture whose two
sides agree proves nothing until one is broken: a wrong station id fails the field check, a hub
dropped from the SPA fails the set check, and a fifth hub added to Go without regenerating fails the
Go side with a message naming the file and the command.

Two assertions beyond parity, because the fixture cannot carry them: every hub has a region to walk
and a station to filter to, and `DEFAULT_MARKET_OPTION` names one of the markets rather than a fifth.

### A2-A4 — The registry, and what reads it

`Functions/MarketData/marketSources.js` owns the registry. `allMarketSources()` is what every caller
reads; `sourceIn` and `sourceNameIn` are the questions asked of it, and `SOURCE_KIND` marks which
kind a source is. `Hooks/Static/useMarketSources.js` wraps it for components and offers
`readMarketSources()` for callers outside render — the same hook-plus-imperative pair
`marketGroupData.js` and its hooks already use.

`GLOBAL_CONFIG.MARKET_OPTIONS` now has exactly one reader: the registry that builds from it.
`DEFAULT_MARKET_OPTION` stays in config, because it is a default *choice* rather than a copy of the
list.

| Reads it through | Which |
|------------------|-------|
| `useMarketSources()` | `marketLocation.jsx`, `priceHistory.jsx`, `marketCostsPanel.jsx` |
| `readMarketSources()` | `marketLabelHelpers.js`, `marketLinkTarget.js`, `saleLocations.js`, `saleLocationRates.jsx` |

Nothing reads `allMarketSources()` directly any more. Its one such caller built `findMarketData`'s
zero-filled row, and went with the store in § B4.

**`marketLabelHelpers` reads per call rather than mapping once.** It built its id-to-name map at module
load, which would name only the markets that existed when the module was imported.

### The registry is not in the world-data store, and that is a departure

[plan.md](./plan.md) § Stage A item 2 says the registry lives in the world-data store. It was built
that way first and backed out, because two tests failed immediately: `stateDefault()` read
`GLOBAL_CONFIG.MARKET_OPTIONS`, and tests that mock `global-config-app` partially — there are two —
threw on store initialisation.

The failure was worth listening to rather than patching. **Store initialisation had come to depend on
app config in order to hold a constant that never changes.** Patching the two mocks would have left the
next partial mock to find it again, and a defensive `?? []` would have blanked every market surface
instead of throwing.

So `allMarketSources()` composes the registry instead, and the store holds no market list. That keeps
what item 2 was for — one accessor for every consumer, and one seam for reader-saved sources to join —
without copying a constant into state. Reader-saved sources arrive in `allMarketSources()` at Stage F,
which is one function rather than every surface.

**The registry exports only what something calls.** A first cut carried an `isServerHeld` predicate
and singular `useMarketSource` / `useMarketSourceName` hooks that nothing used. They are the shape
Stage B and Stage E will want, but an unused export is an untested rule, and the rule that matters —
only a server-held source may be asked of the price endpoint — is better added with the call site that
applies it. `SOURCE_KIND` stays because every source carries a `kind`, which is what Stage A item 2
asked for.

**What this owes Stage F.** `useMarketSources()` memoises on an empty dependency list, which is honest
while the registry is a constant and wrong the moment it is not. Whatever holds reader-saved sources
has to make that hook subscribe to it, or a reader adding a market will not see it appear until the
next remount. It is called out here because the hook looks finished and is not.

## Stage B — The price row and the narrowed query

### B1 — The query, and what the server refuses

`POST /api/v1/market-prices/query` takes the markets and types a caller wants and answers with those
and nothing else. The response nests rows under each source beside that source's `refreshedAt`, with
CCP's adjusted prices in a block of their own, so a top-level key is never ambiguously a market or a
piece of metadata.

**A type a market holds no order for is absent, not zero.** Zero is a figure, and a wrong one; absence
keeps "no orders here" and "nobody asked" as different answers.

**A source the server does not price is refused.** A reader-saved market is the browser's to fetch, so
naming one here is a client-side mistake — answering it empty would read as a market with no orders.

**Each source carries its own type list.** `{"sources": {"jita": ["34"], "amarr": ["35"]}}`, not a
market list beside a shared type list. The first shape shipped was the second, and it asked every
market named in a request for every type named in it — so a job pricing half its materials at Jita
and half at Amarr fetched both halves at both, which is the cross product this stage exists to
remove. The request now says exactly what is wanted and nothing else.

**The adjusted block is its own list**, not a flag over the types above, and carries its own clock. It
refreshes daily and belongs to no market, so folding it into each source's rows would tie a figure
that has not moved to the clock of one that has — and a flag would ask for an adjusted price for
every type in the request, when only installation cost estimation reads them and it wants fewer. A
caller wanting only adjusted prices now names no market at all; under the flag it had to name an
arbitrary one to be answered.

**The cap counts reads, not type ids.** The same type at two markets is two reads, so a limit on ids
would let a request through asking for twice the work. The client splits on the same count.

The handler reads **one Redis round trip per source**, on `PricesAtLocation`, and one for the whole
adjusted block on a new generic `Entries`. The shape it replaces asked Redis twice for every type it
was given, whatever it was asked about. The adjusted block was written as a loop first and corrected —
the same per-type round trip this stage exists to remove, sitting beside reads that had already been
fixed.

**`/api/v1/market-prices` is gone**, along with its custom `MarshalJSON` — which existed to flatten
market ids into top-level keys beside `adjustedPrice` and `typeID`, the ambiguity the nested shape
replaces — and the `PricesByType` Redis reader that served it. Its removal is a **breaking change to a
public surface**, and safe only because the SPA is its only caller and moved in the same change.
`LocationPrice` and the 500-type cap moved to the query handler, which is now the one that holds them.

### B2 — One accessor for every price

`getMarketPriceForType` is what every price read in the SPA goes through, and it has grown to cover
what callers were reaching into the store for: `getAdjustedPriceForType` and `getPriceRefreshedAt`
beside it. All three read the cache and nothing else.

Moving the readers found a live defect. `findMarketData` answers an unpriced type with a **zero-filled
row**, so `lastUpdated` came back as `0`, `Number.isFinite(0)` was true, and `priceAge` read it as a
real moment — a job with one unpriced material told the reader its figures were **fifty-six years
old**. Both the accessor and `priceAge` now treat zero as nothing held.

`marketLabelHelpers` also stopped mapping ids to names once at import: the registry gains reader-saved
markets while the app runs, and a map built at module load would name only the four it started with.

### B3 — Asking for prices

`fetchMarketPricesQuery` is the client, and `priceLoader` is what batches for it: a tick's wants
collect against `sourceID|typeID`, and flush on a **macrotask** rather than a microtask, because React
renders every panel wanting prices before yielding and a microtask would flush after the first. Two
callers wanting the same type at the same market wait on one lookup; the same type at two markets stays
two answers.

**A failure must not settle.** A first cut had the client swallow refusals and answer empty, which
would have the loader resolve `null` and the cache record "this market holds no order for this type"
from a transient 5xx. It throws instead, on the name cache's rule — a market that answered and held no
order, and a market that could not be reached, are different facts. A market holding no order still
settles as nothing, because that is an answer and retrying it would ask forever.

**Chunking is the client's own**, not the shared `batch` option: that merges responses with a single
`Object.assign`, and these rows nest under each source — so a second chunk would replace the first
source's block whole and take every price in it. It splits on the shared `chunkArray` at the same cap
the server enforces, and merges per source.

### B4 — `worldData.marketData` is gone

The store slice, its `addMarketData` and `findMarketData` actions, the `marketData` key in
`stateDefault()`, and the alternative price table every reader threaded through are all removed. A
price lives in one place: `queryClient`, one entry per type per market.

**The zero-filled row went with it.** `findMarketData` answered an unpriced type with a row of zeroes
for every market, which is what made a missing price read as a real figure of zero and a missing
`lastUpdated` read as the epoch. A type nothing was fetched for now has no entry, and each accessor
says what absence means for its own caller: a price reads as `0` because every caller multiplies by
it, `getPriceRefreshedAt` reads as `undefined` because a caller showing an age must be able to show
none.

**The alternative price table was already dead.** Both callers of
`calculateMaterialCostFromChildJobs` passed `{}` for it, so the parameter is removed rather than
carried forward — the arity change is followed through every caller, because the last one of these
silently dropped an argument and cost a stage's figures.

### B5 — Every surface asks for what it reads

Three surfaces still read prices the planner's own fetch had warmed, and each has been moved onto
resolving through `priceResolution.js` so what it asks for and what it reads are the same answer:

| Surface | Asks through | Resolves |
|---------|--------------|----------|
| Watchlist | `pricesWantedByWatchlist` → `useMarketPricesQuery` | Both sides at once — materials bought, item and each material valued |
| Group output card | the group's own `getMissingESIData` | The job's own choice, not just the account's |
| Price Entry dialogue | `useMarketPricesQuery` on the reader's chosen market | The market the reader picked in the dialogue |

`useMarketPricesQuery` now takes **resolved wants** — each type paired with the market it is priced
at — rather than bare type ids, which is what lets one surface want the same type at two markets. It
dedupes and sorts them into its own key, so a caller that lists a pair twice or in another order is
asking the same question rather than fetching again on every render.

**Price Entry was asking for nothing at all.** It lets the reader pick any market, and read whatever
the planner had already fetched at the account's — so a reader who switched markets saw zeroes. It
asks for its own list at its own market now, and tells its rows when that fetch landed, because
nothing re-renders when a cache entry is written.

**The group output card was reading the account's market for a job that may name another.** The
group's fetch resolves each job's own choice; the card did not, so any job with a market of its own
showed zero. It resolves the same way now.

*Still to land:* Stage D's second tier.

## Stage C — Freshness from the source's clock

### C1 — A market's clock, and where it is held

`Functions/MarketData/sourceClocks.js` holds the newest `refreshedAt` seen for each market, and one
more for the adjusted block, which belongs to no market and refreshes on its own day-long cadence.
`recordSourceClock` both stores a clock and answers whether it **moved past** the one held, which is
the question everything downstream is built on.

**The first clock from a market is not a move.** The rows arriving with it are current as of it, so
there is nothing older to make stale — `record` reports a move only where a clock was already held.
Without that distinction the first answer from every market would drop the rows it had just delivered.

**An older clock is ignored rather than written.** Two chunks of one request settle in whichever order
they land, and a market never walks its book backwards.

**A clock of zero is refused**, as is anything not finite. This is the same defect Stage B found in
`findMarketData`'s zero-filled row: a market that answered with no clock must not be recorded as
having been walked at the epoch.

### C2 — Nothing polls for a clock, and nothing renders to ask

`revalidateSourceClocks` in `priceCache.js` asks each market holding rows for **one type it already
holds**. The answer carries that market's `refreshedAt`, so a request costing a single row settles
whether every other row held for that market is still good. There is no clock endpoint and no request
whose purpose is to report a clock — the plan's § Freshness belongs to the source rejected one, and
nothing here reintroduces it.

Any held type answers the clock as well as any other, so the probe takes whichever the cache lists
first rather than naming a sentinel type id that would be a magic constant.

`Functions/MarketData/priceRefreshSchedule.js` paces it, started from `index.jsx` beside
`startStaticDataSync` and **not owned by any component**. A price is read by panels, by classes and by
reducers that never render, so what keeps prices current cannot belong to whichever screen happens to
be mounted — it runs whether or not anything is looking, and a route change that unmounts the shell
does not stop it. `startPriceRefresh` / `stopPriceRefresh` follow `staticDataSync`'s shape exactly,
including the `started` guard that makes a second start a no-op and the stop that exists for tests.

**Fifteen minutes**, matching the server's own scheduler tick — a shorter interval cannot see anything
that has not been published, and a longer one leaves a reader on figures already replaced. It also
probes when the reader returns to the tab, because a background tab's timers are throttled, subject to
a **five-minute floor** so that alt-tabbing does not ask every market for a price on each pass.

That interval paces the *asking*; it is not a staleness rule, and a row whose market has not moved
outlives any number of ticks untouched. The scheduler asks for nothing until something has fetched a
price, because it works from the markets that already hold rows.

**This is where Stage E's pacing goes.** Each reader-saved source refreshes on its own ESI expiry
rather than on demand, and that belongs here beside the hub probe rather than in a second mechanism
invented alongside the fetching.

### C3 — The age guess is gone

`PRICE_STALE_TIME` is `Infinity`. A held row never expires by age: it is what its market would answer
with until that market's book is walked again, whether that is ten minutes or ten hours. The five
minutes it replaced was the last of the four-hour rule Stage C exists to remove.

### C4 — Rows are removed, not invalidated

When a clock moves, every entry for that market is **removed** from the query cache, the whole market
at once because the whole book was walked at once.

Removal rather than invalidation is load-bearing and was found by a failing test, not by reasoning.
Entries never go stale by age now, so an *invalidated* entry is still handed straight back by
`ensureQueryData` — the new figures would never be fetched at all. Removing them is what makes the
next reader ask.

### C5 — What actually re-renders a priced surface

This is the part the stage's design missed on the first pass, and it is worth stating plainly because
nothing about it is visible from the cache module alone.

**A priced surface subscribes to none of the row entries.** It reads figures synchronously while
rendering, through `getMarketPriceForType`, because a shopping list row and an order type comparison read
inside a reduce and neither can await. So dropping a market's rows reaches nobody on its own: React is
never told anything changed.

The only thing such a surface does subscribe to is `useMarketPricesQuery`, the query that holds it up.
Two changes make a moved clock reach it:

- The clock-moved listener **invalidates that query** alongside removing the rows, so a mounted
  surface asks for its wants again.
- That query now **returns each market's clock** rather than the wants it asked for, and the hook
  **reads `data`**. Both halves are required: the query tracks which of its fields a caller uses and
  notifies only on those, so a hook reading none of `data` is never re-rendered however often the
  query refetches. Returning a constant made every refetch invisible.

`MARKET_PRICES_QUERY_KEY` moved to `priceCache.js` so both the listener and the hook read one key; the
hook re-exports it, and `marketPrices.js` importing the cache is why it cannot own it.

**Every market key is built from one prefix.** `marketPricesKey(sourceID)` and `ADJUSTED_PRICES_KEY`
are what `priceQueryKey` and `adjustedQueryKey` extend and what the clock-moved listener and the probe
match on, so reading one row and dropping a whole market's rows cannot disagree about where they are
held. The listener and probe spelled those arrays by hand at first, which is a second copy of a shape
one function already owned.

`tests/seedPrices.js` records a clock for every market it seeds. Rows carry a `refreshedAt`, but the
clock is what the freshness rule reads — seeding rows without one leaves a market that
`clockedSources()` cannot see, so a probe would skip it entirely.

**The reader never sees a zero on the way.** Removing rows leaves the accessor answering `0` until the
refetch lands, and a price flashing to zero reads as free rather than as loading. A test asserts the
figure goes from the old one to the new one with no zero between them.

### What `resetPriceLoader` must not do

It does **not** clear the clock-moved listener. The cache registers that listener once when it is
first imported and has no way to register again, so clearing it leaves every later test in a file
running without the rule it is trying to exercise — which is exactly how the C5 defect hid: the
integration test reset the loader in `beforeEach` and silently disabled the behaviour under test.

### What this stage did not need

The server was already finished for it. `marketPricesQuery.go` computes `regionClocks` and stamps each
source block with its own `refreshedAt`, and the adjusted block carries its own — all landed in Stage
B. Stage C is SPA-only, and the wire did not move.

Plan item 3 (`DEFAULT_ITEM_REFRESH_PERIOD` and `Functions/MarketData/refreshPeriod.js`) was already
done early in Stage B, and `doesMarketItemRequireRefresh` has no callers left anywhere in the tree.

## Stage D — The price cache and its two tiers

**Most of this stage was already written above.** The cache entry and the loader beneath it, the
accessor and the two ways of asking, and what became of `worldData.marketData` and
`getMissingESIData` all landed as part of Stage B — see § B2, § B3, § B4.

### D1 — The tier beneath the cache

`Functions/MarketData/priceStore.js` holds rows for reader-saved markets on `idb-keyval`, and it sits
**beneath** the query cache rather than beside it: a miss falls through to disk before reaching the
network, and a resolve writes both. `resolvePrice` in `priceCache.js` is the only seam it enters at,
so the accessor, the wrapper query and Stage C's clock machinery all carry on knowing nothing about
tiers. plan.md § How the persistent tier is stored carries why the alternative — dumping the query
cache to disk on change — was built as a spike and backed out.

**Which sources persist is declared once**, as a table from source kind to tier in `marketSources.js`.
A kind with no entry is session-only, which is the safe default: the worst it costs is a re-fetch.
The rule is who paid for the rows: a market this server walks is cheap to ask for again, and one the
reader fetched on their own token can never be had for free.

**Which kinds those are moved in § G4.** A saved station is priced by this server now, so nothing
maps to persistent and the tier waits for the citadel — the section below is the tier's design, not
a list of what uses it today.

**A stored row carried its book's expiry, and refusing an expired one was the whole eviction path.**
Without it the tier would have made freshness *worse* than not having it: `PRICE_STALE_TIME` is
`Infinity` and nothing paced a saved station yet (§ E3), so a row written to disk would have been
served as current for ever, across every reload. **Superseded in § E6** — the rotation replaces a
market whole, so nothing on a row has to say when it stops standing.

**A version bump abandons rows, which is not the same as removing them.** The version sits in the key,
so old rows stop being addressed — and therefore stop being reachable by the per-row eviction above,
which would leave them on the reader's device for good. One pass on first touch of the store removes
anything under an earlier version, and touches nothing that is not a price row.

**Nothing here may break pricing.** IndexedDB is absent in some browsing modes and blocked in others,
so every call answers as a miss rather than throwing: a reader with no storage still gets prices,
fetched every time.

**A store that hangs is the case worth naming.** `idb-keyval` settles on `success`, `error` and
`abort`; an open request that fires `blocked` instead — another tab holding the database through a
version change — fires none of them, and WebKit has its own route there that the library comments on
in `createStore`, closing the connection and merely being hoped to say so. A hang is worse than a
failure: nothing above reports anything, and the price simply never arrives, which is the same defect
shape as a want that never settles in § E3. So every call into the store is bounded, and a store that
does not answer in time is a miss like any other.

**The write is not awaited.** The price is already in hand by then and keeping it for next time is
bookkeeping the reader is not waiting on — awaiting would let a slow or wedged store delay a figure
that had already arrived.

**A market holding no order is not stored.** It is the cheapest fact to learn again, and keeping it
would hold a reader at "nothing here" for as long as the row survived.

### What this stage still owes

The pacing this tier needs is the work § C2 names `priceRefreshSchedule.js` as the home for. It lands
as the hourly rotation in § E5, and § E6 is what makes the rotation the only thing deciding when a
row stops standing.

There is no end-to-end test of the persistent tier, for the same reason § E3 gives: nothing in a
running app reaches a saved source until Stage F stores one.

## Stage E — Sources the browser fetches

### E1 — The derivation, held to the server's by a fixture

`Functions/MarketData/pricesFromOrders.js` turns an order book into the four
prices: the location filter, the buy and sell split, best bid and ask, and the
nearest-rank percentiles with the under-five fallback.
`testing/fixtures/market-derivation/books.json` is written from the server's own
`buildMarketPriceEntry` by `derivation_parity_test.go` and read by
`pricesFromOrders.parity.test.js`, the same way the hub list is held together.

**The fixture's cases were twice worthless and looked fine.** First every book was
small enough that `ceil(0.95 × n)` lands on the last index, so `buyP95` equalled
`buy` in all eight cases and a port ignoring percentiles entirely would have
passed. Then, with larger books, `floor(p × n)` still passed every case — the two
formulas agree except where `p × n` is whole. Twenty orders makes both `0.95n`
and `0.05n` whole, so a book that size is what states which rule is in force. Both
holes were found by mutating the implementation, not by reading the cases.

The SPA side also meets shapes the server never does, because it reads ESI
directly: an empty or absent book, a location id given as a number against one
held as a string, and an order carrying no usable price — which must not become a
`NaN` that spreads through every figure derived from it.

### E2 — A station the reader saved

`Functions/MarketData/fetchStationBook.js` walks a region's pages for one type,
and `fetchStationPrices` puts the result through the derivation for one station.

**`Expires` is readable, so the plan's per-source expiry works as written.** It is
a CORS-safelisted response header, so a browser reads it without ESI naming it in
`Access-Control-Expose-Headers` — where the exposed list caused a first reading
that the browser could not see it at all. ESI's `Cache-Control` on this route is
`public` with no `max-age`, so `Expires` is the only statement of when the book
can have changed; the Go worker parses `max-age` instead because it reads a
different header server-side.

**The etag is offered on the first page only.** A region's pages are generated
together and the etag identifies the whole book, so an unchanged book answers 304
on page one and costs a single conditional request rather than every page again.
A 304 still carries a **new expiry**, which is what moves the next refresh on.

**The region's orders come back beside the prices**, because a region answers for
every station in it: a reader pricing several saved stations in one region pays
for the region once and splits the answer, rather than paying per station.

### E3 — The loader sorts a tick by who can answer it

`priceLoader` reads each want's kind from the registry and issues **one request
per transport**: hub wants and adjusted prices to this server's query, station
wants to ESI. A caller still names a source and learns nothing about its kind —
the split is entirely beneath the accessor, which is what § Where a price is read
from asks for.

**The split is a correctness fix, not a tidying.** The server answers **400 for
the whole request** when it names a source it does not price, so the two kinds
were never merely inefficient together: one station want would have failed every
hub price batched beside it. Each transport now settles only its own waiters, and
the tests hold both directions of that — a station whose book cannot be read
leaves the hub prices standing, and an unreachable server leaves the station's.

**A region is read once per type, not once per station.** Wants are grouped by
the book they need rather than by the station that asked, so a reader with two
saved stations in one region pays for that region once and derives twice from it.

**A source the registry cannot name is rejected rather than settled.** It is not
"this market holds no order" — it is the absence of anywhere to ask, which is the
name cache's rule that a lookup which did not settle must not be cached as an
answer. A stored choice can outlive the market it named, and a reader needs the
difference. It is also what keeps such a want away from the server, which would
have refused the whole request over it.

**Station rows are deliberately not recorded into `sourceClocks`.** A hub has one
clock for its whole book, and § C4 drops every row a market holds when that clock
moves — correct there, because the server walked the whole book at once. A saved
station's clock is **one per source and type** (§ What a market source is): the
browser reads one type's orders, so a moved clock says nothing about the other
types held for that station, and feeding it to the per-source machinery would
discard rows nothing had refreshed. A station row therefore carries the moment
the browser read it and nothing writes a station clock yet. The per-type expiry
that `ordersByRegionAndType` already returns is what the pacing work reads, and
that is where it lands — § C2 names `priceRefreshSchedule.js` as its home.

**Every want settles, including when nothing asked it to.** Each transport fails
only its own waiters, so a throw from outside them — reading the registry, which
stops being a static list the moment a reader's own markets are stored in it —
would have escaped a timer callback and been reported nowhere, leaving every
cache entry in that tick waiting for ever. A reader sees that as a figure that
never arrives with no error anywhere, which is worse than a failure. The tick
fails as a whole instead, and a test forces it rather than a comment claiming it.

**What this owes.** The station transport holds nothing across a reload, because
the persistent tier is not built — a reader-saved station is re-fetched from ESI
on every boot. Stage D is what closes that, and it now has its consumer.

**`allMarketSources()` still returns the four hubs**, so nothing reaches the
station branch in a running app until Stage F stores a reader's markets. That is
the placeholder-behind-an-accessor shape rather than an oversight: the registry is
the single seam, the branch is exercised by its own tests, and Stage F adds rows
to one function without touching the loader.

### What only an end-to-end test could say

Every other test on this path stands something in — the endpoint client, the
loader, the cache or the accessor. Each is right to, but the result was that
nothing said a price actually arrives:
`Functions/MarketData/priceDelivery.e2e.test.jsx` mocks `fetch` and nothing else,
so the real client parses, the real loader batches, the real cache holds, and a
component draws synchronously the way every priced surface does.

It confirmed the happy path end to end — the narrowed request carries exactly the
wanted pairs and no cross product, the clock is recorded on the way through, an
absent type reads as no price, and a held price is not asked for twice.

**And it found a defect none of the unit tests could.** A request that failed left
`useMarketPricesQuery` reporting `isLoading` **for ever**: a surface waiting on
prices showed a loading state that never resolved and never learned the fetch had
failed. `fetchPrices` awaits `Promise.allSettled`, which is right for the cache —
one unreachable market must not stop the others — but it resolves successfully
even when every want rejected, so the query above it never saw a failure.

`fetchPrices` now returns `{asked, failed}` and the hook throws when every want
failed. One market failing among several is deliberately not an error: the rest
are drawable, which is the behaviour `allSettled` is there for.

**Two things made this look like a hang rather than a defect.** The shared retry
layer makes four attempts at an escalating 350ms base, so a test that waits half a
second reads a request still being retried as one that never settles. And a plain
`{ok: false, status: 503}` stand-in is not enough for that layer, which clones the
response — the failure then surfaces as `response.clone is not a function` and
reads like a fault in the code under test. Both cost real time here; a `Response`
and a wait past the backoff are what the test needs.

### E4 — Pacing a market nobody reports on

A hub's clock belongs to the server, so learning whether its rows still stand costs a request; a
market the browser reads itself states its own freshness as it is fetched, so that half of the tick
reaches no network. The two halves are run outside each other's failure, because nothing about one
market being unreachable changes whether a different market's prices have run out.

**What did the retiring has since gone.** This stage built a per-row expiry and a sweep over the
query cache to act on it, `expireSavedSourceRows`. Both are deleted in § E6: a market is now replaced
whole on its turn, and `gcTime` is what retires a row nothing is reading.

### What a surface subscribes to, and the bug that proved it

Retiring rows changed nothing a reader could see, and the end-to-end test is what
said so: the book was re-read, the new row reached the cache, and the panel went
on showing the old figure through zero re-renders.

A priced surface subscribes to no row entry — it reads figures synchronously
while rendering — so the only thing that can re-render it is `useMarketPricesQuery`
notifying, and React Query notifies only on the fields its caller reads. That
query returns `clocksFor(asked)` precisely so that a refetch is visible. But it
read clocks from `sourceClocks`, and **a saved market deliberately has none**
(§ E3): its value was a constant zero, so a refetch could not be seen.

`clocksFor` now keys a market the browser fetches for itself **per source and
type**, from the row's own `refreshedAt`, which is where that kind's clock lives.
The rule is the same one § E3 states about `sourceClocks`; what was missing was
stating it in the second place that depends on it.

**The hub path was checked rather than assumed** before concluding the gap was
only in the new kind: removing the invalidation that wakes a surface breaks the
hub's own end-to-end test, so that mechanism is load-bearing and was never the
part at fault.

### E5 — A citadel is read by the reader who saved it

**What follows from a kind is one table.** `marketSources` answers three questions about a market
kind separately — where its rows live, who reads it, and whether it can be asked a cheap question
about its freshness. For the three kinds there are today the answers line up, and they are asked
apart anyway: a kind this server prices but the reader must authenticate for would split them, and
one predicate standing in for three would be wrong in three places at once rather than missing a row
in a table.

**This is the one market the browser still fetches.** A hub and a saved NPC station are priced by
this server (§ G2-G4); a player structure's orders are private, so no server can walk one — the call
needs a token and the character holding it needs docking access. Everything below follows from that.

**There is no per-type form of it.** `GET /markets/structures/{id}/` answers with the structure's
whole order book, paginated, and nothing narrower exists. So a want for one type costs what a want
for every type costs, which inverts the model the loader was built on. What follows from it: the
read answers every type at once, what it answers with is kept, and a rotation rather than a request
per want is what keeps it current.

**The read.** `Functions/EveESI/World/getStructureOrders.js` reads a structure's orders as one
character, every page, and keeps three outcomes apart — a refusal, a request that failed, and a token
that was never granted `esi-markets.structure_markets.v1`. A market past `MAX_ORDER_PAGES` is refused
whole rather than priced from the pages that fit: prices come from every order at the place, so a
book cut short reports a best ask nobody is offering and nothing downstream could tell that from a
real figure. A page count that cannot be read fails the same way and for the same reason.

**Which character reads it.** `Functions/EveESI/World/askEachCharacter.js` is the walk across an
account's characters, shared with name resolution, which moved onto it unchanged. The first real
answer wins; a transient failure never settles as no-access, because the character that failed might
have been the one who could see it; a token that never carried the scope is neither a refusal nor
something to retry. `citadelPrices.js` asks the character recorded for that market first and the rest
after, then records whichever answered — so the ordinary case is one request, the fan-out happens
once, and a market whose access has moved heals itself.

**Nothing is asked of the reader.** No character field exists in Settings and none is stored on the
saved row: a market that can be read at all can be read without the reader telling the app anything,
and asking them would make them maintain a fact the app discovers and keep it right as corporations
and access change. The record lives in IndexedDB beside that market's prices, under a key of its own
so the whole-market replace cannot sweep it away with the rows.

**The prices.** Orders are bucketed per type and derived with `pricesFromOrders` — the same
derivation the committed fixture holds to the server's, so a citadel's figures and a hub's mean the
same thing. A type with no order is absent rather than zero.

**What a read owes, in order.** `priceLoader`'s `readAndKeep` is the one place that knows it: read,
**await** the write to the device, then record the clock and announce that the market moved. The
order is load-bearing. Announcing drops the market's held rows and wakes every surface reading them,
and what those surfaces read through is the device — so announcing first sent them to the rows the
read was in the middle of replacing, which they would then hold until something else moved the
market. One read-and-keep runs per market at a time, so a rotation and a panel wanting the same
market share one.

**What is kept.** A citadel is the only kind in the persistent tier, because its rows were read at
the reader's own expense and cannot be had for free again. `replaceStoredPrices` takes the whole set, and clears
what was held for that market before writing it: a whole-market read is a statement about every type
on it, so what was there before has no standing. Restoring a row from the device restores that
market's clock too — a reload empties the clock record while the rows survive, and a market with no
clock cannot be seen to move, so the next read would count as its first and drop nothing.

**When it is read again.** Once an hour, `PRICE_ROTATION_MS` — which `citadelPrices.js` owns while
the rotation that reads it is kind-generic, and a second kind the reader reads themselves would want
it moved to the trait table or to the schedule. Nothing is wrong today, with one such kind.

**Every saved citadel is on that schedule** — not only the ones a reader has already priced against. A market is saved because they
mean to price against it, so refreshing only what has been asked for would leave figures fresh
exactly where a reader has been and stale everywhere else.

The hour is the cadence this server refreshes the markets it prices publicly at, so a citadel's
figures and a hub's are the same age as well as the same derivation. ESI's own expiry — minutes —
is deliberately not what paces this: honouring it would walk a whole market a dozen times an hour on
the reader's own token. The cost is that a citadel's prices can be up to an hour behind.

**A reader signing in has them read straight away**, from the post-login sync where the account's
characters are first known — waiting for the first tick would leave the prices they saved those
markets for a quarter of an hour behind. Reading several at once takes nothing from the markets this
server prices: a structure's orders are on an ESI allowance of their own.

**A cloud account's characters arrive after that**, on the users-document reconcile rather than
during login, so the same read runs again as the roster lands — but **only when the roster actually
moved**. The snapshot that drives a reconcile hardcodes "the roster may have changed", and a tab
refocus and a socket reconnect both take that path, so reaching the end of a reconcile says nothing
about whether anybody was added or removed. The reconcile reports what it changed and the read
follows that instead: otherwise a reader alt-tabbing back walks their own structures again every
time, on top of the wake probe that at least holds a five-minute floor. A refreshed token for a
character already held is not a move — the same characters can still read the same markets.

Nothing was refused while the account had no characters to ask — `askEachCharacter` throws for "no characters" rather than answering
"refused", and only a refusal puts a market's turn back — so those markets are still due and the read
takes them. Without it they wait out the quarter hour to the next tick with a reader looking at
figures that are not there.

**The reconcile reaches the price layer through a dynamic import, and that is load-bearing.** Reading
a market reaches the users store for the account's characters, so importing the schedule at the top
of `accountReconcile.js` closes a cycle back onto it: `priceCache` registers its clock listener as a
module side effect, and in that cycle the registration runs before the loader it registers with has
begun, leaving the listener's binding unset and every price test entered through the loader failing
on import. The loader cannot defend itself — `var` would hoist without the dead zone but the module
body would then reset it, discarding a listener already registered, which is a silent wrong answer in
place of a loud crash. **Anything else the store can reach must import the price layer the same way.**

The rotation reads due-ness from the device rather than from what is held in memory: a price row is
watched by nothing, so the query cache lets one go within minutes, and a rotation paced by that would
stop rotating the moment a reader looked away — which is exactly when reading ahead is worth
anything. A market the account was *refused* waits its full turn again rather than being read on
every probe — where a read that merely failed does not, a failure saying nothing about the market.

**One clock model, not two.** `clocksFor` keyed a market's clock per type as well as per source,
for a saved station read one type at a time — which no longer exists, every kind now reporting a
clock of its own. A market that has never answered contributes nothing there, and has no figures for
a reader to be left looking at either.

**A refusal is not an empty market.** Every character being refused fails the read, because "no
orders here" is a figure a surface will print as zero.

### E6 — One expiry per market, and none per row

E4 and E5 left three things deciding when a citadel's prices stopped standing: an `expiresAt` on
every row, a sweep over the query cache acting on it, and the market's own turn on the rotation. They
are now one — the turn — and the other two are deleted.

**A row has no expiry, and nothing retires one.** `expireSavedSourceRows`, `rowsStateTheirOwnExpiry`
and the whole `priceFreshness` module are gone, along with the store's read-time lapse check. What a
row carries is `refreshedAt`, the moment the walk that read it was current, which is what a surface
displays and what the clock is recorded from.

**`gcTime` is what a row's lifetime is now.** Nothing subscribes to a price row — surfaces read them
synchronously — so every entry is unobserved from the moment it lands, and `gcTime` is in effect how
long one lives. `PRICE_CACHE_TIME` sets it to thirty minutes against the default five: long enough
that a reader moving between screens finds the prices still there, short enough that a tab left open
does not hold a market's whole set for the day. Below it the device answers, and what the device
holds is whatever the last rotation wrote.

**A market is cleared and written again, not reconciled.** `replaceStoredPrices` used to list the
market's held keys, work out which the new set did not mention, and delete those. It now deletes
everything under the market's prefix and writes the new set — the same end state, reached without the
comparison. The character record and the freshness record sit outside that prefix and survive it, and
the freshness record is written last, so a write that gives out halfway leaves a market due again
rather than one claiming rows it does not hold.

**The freshness record is the only expiry left.** `market-read|v2|<market>` carries when the market
is due again, the rotation reads it to decide due-ness, and a market with no record is due now.
§ E7 adds the second moment it carries and says why the two cannot be one. One moment per market rather than one per row, for a fact that was never per-row:
every row in a market was read at the same instant and stops standing at the same instant.

**What is still load-bearing.** Announcing that a market moved — dropping its held rows and
invalidating `MARKET_PRICES_QUERY_KEY` — stays. Without it a surface that is already open reads the
rows it read at mount until `gcTime` collects them, which is the defect § "What a surface subscribes
to" was written about. Reading what is there is the rule for a row; being told the market moved is
what makes a reader see a refresh.

**The tick no longer skips a hidden tab.** The rotation was held back while the tab was hidden on the
reasoning that a whole-market walk spends the reader's ESI allowance. It does not spend the one that
mattered — `GET /markets/structures/{id}/` is on a bucket of its own — so the guard was arguing from
a cost that is not charged. A hidden tab's timers are throttled by the browser regardless, and the
wake probe already catches a reader coming back.

### E7 — What bounds the device tier

E6 left one thing unanswered: with no expiry on a row and nothing sweeping, what is held for a market
the reader has **removed** — or one no character can reach any more — is never refreshed and never
thrown away. It would sit on the device for good, priced against whenever it was last read and
indistinguishable from a market still in use.

**Anything unread for a day goes, whole.** `dropUnreadMarkets` throws away a market's rows, its
character record and its freshness record together. That is the bound, and it needs nothing to know
which markets a reader still has: a market is refreshed *because* it is still saved, so one that has
stopped being saved stops being refreshed and falls out a day later on its own.

**Not judged against the registry**, which was the first shape tried. `allMarketSources()` reads the
settings store, and before an account's settings have loaded it answers with the hubs alone — a sweep
that deleted every market the registry did not carry would empty the device on any page load that ran
first. Age needs no such knowledge and cannot be wrong that way.

**The record now carries `readAt`, this device's own clock, and not ESI's.** The moment a walk
reports is `last-modified` on the orders, and a structure nobody has traded at for days states one
that is already old — a market judged by it would look untouched the second it was refreshed. Nor can
the sweep use `expiresAt`: a market that keeps failing has its turn moved forward on every attempt,
so pacing and age have to be two separate facts. `deferMarket` moves `expiresAt` and leaves `readAt`
exactly where it was, which is what lets a market nobody can reach age out rather than staying alive
on its own failures.

**A market never read successfully keeps its record.** It holds no rows to throw away, and the record
is what paces the attempts — taking it would make the market due at once and have it walked on every
probe, a refusal per character at five times the cost of a hit.

**The store's version is bumped to 2, so a returning reader starts clean.** The record's shape
changed, and a record written before it states no moment this device read the market. A market the
reader has since *removed* is never read again, so nothing would ever give it one — and the sweep
reads exactly that field, so the markets it exists to throw away would have been the markets it could
never reach. `prunePastVersions` already abandons everything under an earlier prefix; the cost is
that every reader rebuilds their markets once, on the rotation they would have had anyway.

**A market is re-read immediately before it is dropped, not decided about up front.** The tick, a
sign-in and a panel asking for a price are three chains with nothing between them, and a scan is as
long as the reader has markets. Deciding about every market first and deleting afterwards threw away
one refreshed while the scan was still walking — losing the walk that had just been paid for. The
window is now a single read rather than the whole scan; IndexedDB offers nothing to close it
entirely, and what is left costs a re-read rather than anything a reader would see.

**It runs after the rotation**, on the tick and at sign-in both. After, so a market whose turn has
just come is refreshed rather than thrown away and read again from nothing; at sign-in because that
is when a machine that has been away comes back, and a reader returning after a week should rebuild
their prices rather than open on the ones they left.

**What this does not do is label the figures inside the day.** A row carries `refreshedAt` and
nothing in the app displays it, so prices up to a day old still read as current. That is a surface
question rather than a storage one, and it is answered in
[market-locations](../market-locations/plan.md) § A market says when it was last read, whose panel
shows each market's last-read moment.

### What only these tests could say

`citadelDelivery.e2e.test.jsx` stands in for the outside world alone — ESI's HTTP, the account's
characters and their tokens, the reader's saved markets — and runs the walk, the read, the
derivation, the loader, IndexedDB, the cache and a real render together. It exists because each unit
test on this path mocks its neighbours, which is right for a unit test and is why none of them can
say that a price arrives at all.

Its fixtures are dated relative to now. Fixed dates put every market past its turn the moment the
calendar passed them, so a test about a market being read once read it twice — a fixture that rots
into a test proving nothing.

## Stage G — An NPC station is priced by the server

### G0 — One owner for the bucket list

**The plan said "one more constant beside `BucketStaticData`, and one more name in `SeedBuckets`".
That was not enough**, and finding out why is what this item is.

`SeedBuckets()` has no caller. The buckets that a deployment actually creates come from a second,
independent list in `deployment-tool/internal/dataplane/s3` — `AppBuckets()`, read by `Ensure` and
`Check`, which run `weed shell s3.bucket.create`. The two are **separate Go modules and cannot import
each other**, so the only thing holding them together was a comment on each saying "keep in sync".

A bucket added on one side and forgotten on the other is a bucket every service opens and no
deployment ever creates. It fails at the first write, on the host, and neither module's tests would
have said anything — which is why this is a prerequisite for adding a bucket rather than tidying to
do afterwards.

**What owns it now.** `objectstore.SeedBucketNames()` is the list, `SeedBuckets()` joins it for the
object store's own configuration, and a committed fixture carries it to the other module — the
pattern this project already used for the hub list and the structure kinds:

| | |
|---|---|
| Owner | `services/shared/core/objectstore` — `SeedBucketNames()` |
| Fixture | `testing/fixtures/object-store-buckets/buckets.json` |
| Written by | `buckets_parity_test.go`, regenerated with `EIP_UPDATE_OBJECT_STORE_BUCKETS=1` |
| Read by | `deployment-tool/internal/dataplane/s3/s3_test.go` |

The fixture is an **ordered** list, unlike the hub fixture's map. The Deployment Tool creates buckets
in the order it is given, so order is part of the agreement rather than an accident of iteration.

### `S3_BUCKET` in the stack file was never read by anything

`docker-stack.data.yml` set `S3_BUCKET: static-data,static-data-test` on the seaweedfs container, and
`s3.go`'s comment named it as a copy to keep in sync. It was neither — the string `S3_BUCKET` does
not appear anywhere in the `weed` binary, so the image cannot read it, and the buckets have always
been created by `s3.Ensure` through `weed shell`.

So it was one copy of the list that could never have had an effect, and a comment pointing at it as
though it did. Both are gone. What made this checkable rather than a judgement call was that the
container is running: `strings` on the binary answers whether a program can read an environment
variable, where a grep of this repository only answers whether we read it.

The bucket names also appeared in **operator-facing copy in three places** — the `ensure-s3` verb's
description in the catalogue and on the command itself, and the `S3_ACCESS_KEY` field's help text in
the Deployment Tool's `.env` template. That is copy rather than a list anything reads, so no parity
test would ever catch it, and it would go stale silently the moment a third bucket exists. All three
now say what the thing is for instead of enumerating buckets.

The third was found by review rather than by the sweep that found the others: grepping for
`static-data` turns it up, but it reads as prose describing credentials rather than as a copy of a
list, which is how it survived two passes. **Copy is a place a shared fact hides**, because the sweep
that finds duplicated lists is looking for lists.

### What the parity test cannot do by itself

**`go test` can report a stale pass here.** The fixture is read with `os.ReadFile` at run time, which
Go's test cache does not track, so a fixture that changed since the last run is not a cache miss. A
regenerated fixture and an un-updated `AppBuckets()` reported `ok (cached)` until the run was forced
with `-count=1`.

This is true of every parity test in the repository that reads its fixture at run time, not something
this one introduced. It is recorded here because a green run is the evidence these tests exist to
provide, and "cached" is the one state where that evidence is worth nothing.

### G1 — The pages live in object storage

A region's pages are written to `market-pages`, its own SeaweedFS bucket, through
`objectstore.MarketPages`. `FetchRegionMarketOrders` takes that store in place of the Redis handle
it used to take; Redis keeps the ETags, the prices and the refresh times, and the fetch tests still
build one because the ESI client paces itself through it.

`PutPage`, `Page`, `regionPageKey` and `ttlRegionPage` are deleted rather than wrapped.

**The pages already in Redis are left to expire.** A deployment carrying this change has roughly 830
`esi:market_orders:region:*:page:*` keys that nothing will ever read again — 832 on the machine this
was built on. They are not deleted on release, because each was written with a 24-hour expiry and
will go on its own within a day, and a release step that deletes keys by pattern is a worse thing to
own than a day of stale memory. Nothing reads them in the meantime: the key is gone from the code,
not just unused.

**A worker without object storage still works.** Both the write and the replay ask `Available()`
first, so a deployment where the bucket is not reachable walks the book and prices it as before — it
just refetches every page instead of replaying. The one thing that must not happen is a 304 with
nothing to replay reporting the region *unchanged*: the caller would skip the price write and the
book would silently lapse. A test holds that, and it fails if the flag is left alone.

**What the move gave up, and what replaces it.** Redis expired a page after 24 hours for free.
Object storage has no expiry at all, so without something deliberate the bucket grows for ever —
1,613 objects an hour, in a store nothing prunes. `DropRegionsOlderThan` is that something.

It judges a region by its **newest** page, not its oldest. A walk rewrites a book page by page, so
partway through a 408-page region the early pages are hours old while the region is being refreshed
right now. Judging by the oldest page would delete a region mid-walk, and the walk would then finish
writing pages into a region that had just been dropped. A test holds this: a region with one old page
and one new page is kept.

### An in-memory Backend, because the tests had nowhere to run

This was not in the plan, and it is the larger half of the work.

**Every object-store test in this repository skips.** They all reach `OpenTestStore`, which needs a
live store: `S3_URL` is unset, and the object store's port is not published to the host, so it is
reachable only from inside the overlay network. Nothing had ever noticed, because a skip reads as
green.

That would have quietly destroyed real coverage. Four fetch tests assert what the walk leaves behind
for the next pass to replay — the thing that stops a shrunk book replaying pages it no longer has —
and they assert it by reading the page store directly. Moving pages onto a `Backend` with no
in-process implementation turns all four into skips.

So `MemoryBackend` implements the nine-method interface in-process. It is written to match
`S3Backend` rather than to be convenient, because **a fake friendlier than the real thing makes its
tests lie**: a missing key is `ErrNotFound` rather than an empty result, keys are normalised on the
way in so two spellings are one object, `ListKeys` is recursive and sorted while `ListChildNames`
collapses to one level, and what is read is a copy so a caller sorting a page in place is not sorting
what the store holds.

It also takes a settable clock, which is what lets the retention test place one region before a
cutoff and another after it without sleeping.

**It is not test-only.** It lives beside `S3Backend` rather than in a test file, because any caller
wanting object storage without a store to dial can take it. The SDE tests that skip today could use
it too; that is not this project's to do.

### G2 — Walking a region and pricing a station are two tasks

**A walk stores the book; a derive prices the stations wanted in it.** `RefreshRegionMarketOrders`
no longer carries a station: it walks the region, writes the pages and the ETags, records the refresh
time, and publishes `deriveRegionMarketPrices`. `DeriveRegionMarketPrices` reads the tracked stations
and the stored pages, and writes a price per type per station. It asks ESI for nothing, so a station
added to a region already walked costs a read of stored pages and a filter — proved by
`TestASecondStationInATrackedRegionCostsNoESICall`, which counts the origin's requests across the
second derive and expects none.

**A station is tracked by being asked for.** `esi:market_orders:region:<id>:stations` is a scored set
of station ids against when each was last asked about, and it is what a derive pass reads in place of
the station the walk used to be told. Asking again moves the timestamp rather than adding a member,
`DropStationsAskedBefore` retires the ones nothing has wanted since a cutoff, and
`StopTrackingRegionIfUnwanted` takes both the set and the region's place in the sweep. The scheduler records
each hub as it publishes its walk, so the four hubs are tracked by being swept and never fall out.

**`PutPrice` is per station now.** It was passed a region id under a parameter named `locationID`,
which worked only while each swept region had exactly one station anybody asked about. Entries under
the old key are orphaned rather than migrated — they expire in two hours and the next pass rewrites
them under the new one — and `/marketPricesQuery` reads a source's `StationID` to match.

**A 304 pass stops decoding a book nothing reads.** The replay existed to feed orders through the
caller's filter, and the walk has no filter any more. `FetchRegionMarketOrders` takes a nil `onOrder`,
and the replay then asks the page store whether the page is **held** rather than fetching and decoding
it — the difference between reading The Forge's 92 MB and reading a key. What it must still do is
downgrade a page that is *not* held to changed, or an unchanged region would go on claiming to be
current with nothing behind it; `TestA304WithNoOrderConsumerStillChecksThePageIsHeld` holds that, and
fails when the downgrade is removed.

**A deployment with no page store still prices.** With nothing stored there is nothing to derive from,
so the walk accumulates the tracked stations from the stream as it passes, exactly as it used to for
one station. Without that, § G1's "a worker without object storage still works" would have become
"walks every book and prices nothing".

**Wire: the walk's payload loses `station_id`, and that is safe by decode.** Task payloads are
decoded leniently, so a walk queued by the previous release still runs — the field is ignored and the
region is walked. `routing_test.go` decodes that old payload deliberately, for that reason.

**Still open in Stage G:** a station is tracked only by the scheduler seeding the hubs. Registering a
reader-saved station on first ask, sweeping every region a reader has asked about rather than
`DefaultMarketLocations`, and the retention callers (`DropStationsAskedBefore` and
`DropRegionsOlderThan` have no caller yet) are the next slice.

### G3 — A market is tracked because an account saved it

**Registering happens where the account is known, not where a price is asked for.** The server reads
an account's settings document already, so that is where its markets are read from: the login handler
and the settings save handler both call `marketsources.Register` with the structures they already
hold. The SPA is told nothing and asks for nothing — it never learns this exists.

**Both call sites ask one question and usually publish nothing.** Most sign-ins and nearly every
settings save change no market at all, so re-registering on each would be work to re-assert what is
already true. `RegionsOfTrackedStations` answers, in one hash read, which of the account's markets
this server prices and where each sits; only the ones missing are published, and an account whose
markets are all known costs a single round trip. The hash is
`esi:market_orders:tracked_station_regions`, written as a station is tracked and cleared as one is
retired.

That index is also what a price read resolves a station by: membership and region in one lookup,
where it previously took a cached region read and a scan of the region's tracked stations.

An earlier draft did it inside `/marketPricesQuery`, registering whatever station a caller named. That
put a write on a public unauthenticated endpoint, made a read spend ESI calls, and left the first ask
answered empty while the walk it had just asked for ran. Reading prices now registers nothing.

**The worker does the resolving.** `TrackMarketSources` walks `/universe/stations/` →
`/universe/systems/` → `/universe/constellations/` for each station, caches the region without expiry
because a station never moves, tracks the station, and asks for what the market still needs: the first
station in a region publishes its walk, a later one publishes a derive against pages already stored,
and one already tracked publishes nothing — which is what every sign-in after the first does.

A station that does not resolve is skipped rather than failing the pass: one market an account cannot
have must not cost it the rest. Only ESI answering 404 about the station itself is remembered as
unknown, and for ten minutes — a timeout or a 5xx says nothing about whether the station is real.

**The read asks ESI nothing**, and refuses a station the index has no answer for. A market reaches the
price path only after the account has said it holds one, and the endpoint keeps the read-only
contract it had before this stage.

**Which is why the walk being a task is not felt.** Registration runs while a reader signs in, or as
they save the market in settings, so the book is walked before a job asks for a figure rather than a
reader waiting on their own first ask.

**The sweep reads the registry.** `regionsDue` takes region ids rather than hubs, and the sweep walks
every region something is tracked in — `esi:market_orders:tracked_regions`, a scored set
`TrackStation` writes beside the per-region station set. The four hubs are tracked **every tick**
rather than when they are walked, so a quiet fortnight cannot retire them.

**`retireUnaskedMarkets` is the bound on all of this.** A daily task drops the stations nothing has
asked about for **fourteen days** — long enough that a reader who prices a job weekly never re-pays
their region's first walk, and that a holiday is covered; short enough that a market saved once and
abandoned does not stay in the sweep. A region whose last station goes leaves the sweep, and its
stored book is left to age out at **seven days** under `DropRegionsOlderThan`.

**A partial write leaves a market under-registered, never over-registered.** `TrackStation` writes
three keys and they are not one transaction, so the index a caller reads to decide nothing needs
doing is written **last**: a failure part way through leaves a market that looks unregistered and is
asked for again on the next sign-in or settings save, rather than one that looks tracked while its
region is never swept.

**Retirement does not delete the book, and that is deliberate.** Two things follow from leaving it.
A market registered again inside the week is priced from pages already stored, with no ESI call —
coming back costs nothing where a first registration costs a walk. And the ETags stay true: they are
kept in Redis for 24 hours, and `esiclient` refuses a conditional request that throws away a validator
it has already been given, so a walk that met deleted pages would answer 304 to a book it no longer
holds and could not rebuild until ESI's own validator moved. Pages and their ETags are two halves of
one cache, and age is what takes both.

**What a retired market costs to get back.** Nothing special-cases it: the next sign-in registers it
like any other. Its region is still in the resolution cache, so no ESI call is spent on the walk
chain; if the region is still tracked for another market the station is derived from stored pages, and
if it was forgotten its walk is published and the sweep picks it up as never walked, the refresh lease
collapsing the duplicate.

### An order book belongs to a region, not to a station

**A station has prices; the region it sits in has the order book.** ESI answers orders per region,
and a station's figures are derived from the region's pages — so "a station's book" names something
that does not exist, and it read as though each station had a book of its own to fetch.

The vocabulary is now: a **region's orders** or its **order book** for what ESI returns, **prices**
for what a station takes from them, and **freshness** for the `{refreshedAt, expiresAt}` pair a read
carries. `fetchStationBook.js` is `regionOrders.js`, `fetchStationPrices` is `pricesAtStation`,
`readStationBook` is `priceStationsFromRegionOrders`, and the loader groups wants by the **read**
they need rather than by "the book".

The rule reaches names as well as prose, including the derivation itself: `deriveBookPrices` is
`pricesFromOrders` in `pricesFromOrders.js`, and its `BookPrices` typedef is `DerivedPrices`. What it
is given is an order book and what it returns is prices, so the name says the second. A fixture
holding real ESI orders is still an order book — `testing/fixtures/market-derivation/books.json`
keeps its path, because that is what it holds.

**`regionOrders.js` itself is gone**, deleted by § G4 below once this server priced what the browser
had been fetching. The vocabulary outlived the module and is what the rest of the pricing code now
reads by.

### The keys this stage retires, and the deploy that carries it

**Two shapes are left behind, and neither expires.** Keying a price at a station
orphans every price keyed at a region, and the per-type bookkeeping
`esi:market_orders:<typeID>:<regionID>:{etags,last_updated}` was already unread before this project.
Both were written **without a lifetime**, so they survive restarts and age out on no clock: a deploy
that does not remove them keeps them for ever. On the dev instance that was 118,040 keys, two thirds
of the keyspace — measured there, not on live.

`dropRetiredMarketKeys` is the release step that removes them. It converts nothing, because nothing
reads them. A key is a candidate only when it **has no lifetime of its own**: every price the running
code writes carries one, so that rule keeps a live station price out of the sweep whatever its shape
reads like, and makes a second run find nothing. `UNLINK` frees them off the main thread, so the size
of the set does not stall the instance.

**A deploy carrying § G1 creates the bucket before the worker rolls.** `OpenMarketPages` refuses a
bucket that does not exist rather than making one — creating buckets belongs to the Deployment Tool
— so a worker started before `eip ensure-s3` has run dies on its twelfth dial attempt and Swarm rolls
it back to the previous image. Observed twice on the dev stack, each time reading
`s3 bucket "market-pages" does not exist — run eip up / eip ensure-s3` while the market pipeline
stayed down. The order is `eip up` (or `eip ensure-s3`), then the image roll.

### G4 — The browser stops fetching what the server prices

**One transport answers every market.** A saved station used to be read from ESI by the browser and
a hub from this server; both come from `/marketPricesQuery` now, in one request. `splitByTransport`
has one served list, and `transportIDFor` is the only place that knows a saved market is named on the
wire by the station it sits at — the reader's own id for it never leaves the loader, so every row,
key and clock stays under that id. A clock arriving against a station id is recorded under the id it
was asked for, or it would speak for rows nothing could match it to.

**`regionOrders.js` is gone**, with the whole-region sweep built for a client-side walk — two of its
four exports already had no caller before this slice. `pricesFromOrders` stays: it is the SPA's half
of the derivation the committed fixture holds to the server's, and the citadel read derives with it.

**A clock is recorded per want, not per market the answer named.** Nothing stops an account saving
one station twice under two names, and both are asked for under the same station id — keyed by what
was asked, one would take the other's clock and the market that lost it would go on serving a
superseded price with nothing left to tell it otherwise.

**A market that has never been walked is asked again, not settled.** Registration puts a market in
the sweep, but its first walk takes minutes, and until it lands the market answers a clock of zero
and no rows — which reads exactly like a market holding no order. `revalidateSourceClocks` now
probes **every market the cache holds rows for** rather than only those that have reported a clock,
because a market with rows and no clock is precisely the one being waited on. When the walk lands the
real clock arrives, the rows it supersedes are dropped, and the surface asks again.

**Saved markets left the persistent tier.** Rows are kept on a reader's device only where that reader
paid to get them; a market this server walks is one request away after a reload, and a stored row
would sit in front of a figure the server has already replaced. Nothing maps to persistent now, so
the tier waits for the citadel it was built for — whose whole book is walked on the reader's own
token. `priceCache.savedSourceRefresh.test.jsx` went with the behaviour it described, and comes back
with that walk; the store's own tests keep the machinery covered in the meantime.

`priceDelivery.e2e.test.jsx` gained the saved-market path it never had: the same wire, the same
query, the same surface, mocking only `fetch` — including a market asked for **before** its first
walk, which is the case the probe rule exists for.

**A market's first clock is not a move, and that nearly cost the rule its point.** `recordSourceClock`
reports a move only where a clock replaces an older one, because the rows arriving with a first clock
are current as of it. A market asked for before its walk landed breaks that: its rows were answered
with no clock at all and say it holds no price, so the first real clock supersedes them while
reporting nothing. `revalidateSourceClocks` drops the rows of a market that gained its first clock
under the probe, or a reader who asked too early sits on "nothing here" for the life of the tab.

### Still to fill

**A citadel cannot be priced by this server at all**, so it is not registered: its book needs
`/markets/structures/` and the docking character the row carries, which is
[market-price-delivery](./plan.md) § Stage E item 3 and stays the reader's own fetch.

**Refetching a saved source ahead of the reader** is § Stage E item 4's other half, and only a
citadel needs it: a market this server prices states its clock on every answer, and the probe is
what notices it moved.

## Stage F — Custom market locations

**Built by [custom-structure-model](../custom-structure-model/overlay.md) § Stage D, not by this
project** — a saved location that is a market is a kind of structure, and that project owns the
shape. What it produced is the row this project prices: see [plan.md](./plan.md) § Stage F for what
was asked for and what was decided differently.

## Missing live SoT found on the way

Live documentation gaps discovered while working land here first and are folded into the live topic
docs on promote.

### `frontend/pricing/price-entry.md` describes the store this project deleted

It says the row's default price is "read from stored market data for the selected market and listing
side", and that "a market data update while the row's price still matches the previous default
replaces it". Both describe `worldData.marketData`, which § B4 retired.

What the dialogue does now: it asks for its own list at whichever market the reader picked — which it
never did before, so a reader who switched markets used to see zeroes — and hands each row a
`pricesSettled` flag saying when that fetch landed. The row re-reads on that flag rather than on a
store update, because nothing re-renders when a cache entry is written (§ C5 is the same lesson from
the cache's side). The rule the paragraph is really stating survives the change and is worth keeping
in the rewrite: a value the reader has typed away from the default is left alone.

That file is live SoT, so it is not edited here. This section is the note for promote.
