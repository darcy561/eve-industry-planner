# Market price delivery — overlay

What changed and how each part works **after** the change. Live docs remain the truth wherever this
file has no entry. Fill a section as its slice lands; do not pre-write behaviour that has not shipped.

Promote target on go-ahead: [frontend/](../../frontend/contents.md) and
[backend/](../../backend/contents.md).

## Stage A — The source registry

### A1 — The two hub lists are held together by a test

`esicore.DefaultMarketLocations` is the source of truth for which markets this server prices.
`testing/fixtures/market-hubs/hubs.json` is derived from it by
`shared/core/esi/locations_parity_test.go`, committed, and read by
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
rendering, through `getMarketPriceForType`, because a shopping list row and a basis comparison read
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

*Nothing landed yet.*

Sections to fill: the cache entry and the loader beneath it; the accessor that reads and the two ways
of asking, and what became of `worldData.marketData` and `getMissingESIData`; the IndexedDB store, its
version and its eviction path.

## Stage E — Sources the browser fetches

### E1 — The derivation, held to the server's by a fixture

`Functions/MarketData/deriveBookPrices.js` turns an order book into the four
prices: the location filter, the buy and sell split, best bid and ask, and the
nearest-rank percentiles with the under-five fallback.
`testing/fixtures/market-derivation/books.json` is written from the server's own
`buildMarketPriceEntry` by `derivation_parity_test.go` and read by
`deriveBookPrices.parity.test.js`, the same way the hub list is held together.

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

**Nothing calls it yet, and that is the honest state rather than an oversight.**
`deriveBookPrices` has its consumer in `fetchStationBook`; `fetchStationBook` has
none, because the seam it plugs into does not exist. § Where a price is read from
puts the three transports in one place — `priceLoader.js` — and that loader does
not branch on `SOURCE_KIND` at all today, because every source it has ever served
is a hub.

Stage A's rule is that an unused export is an untested rule, and it removed
speculative surface for exactly that reason. This is the other case: the module is
exercised by its own tests against a fixture the server writes, so the rule *is*
tested — what is missing is the caller. Wiring it means teaching the loader that a
want can be for a station rather than a hub, which is a change to the one place
the transports differ and belongs with the persistent tier that holds what it
fetches, not bolted on ahead of either.

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

### Still to land

Sections to fill: the shared per-character walk extracted from `nameLoader` and what both callers pass
it; the derivation in the SPA and what holds it in agreement with the Go one; the
per-type path for a custom NPC station; the token-authenticated whole-book walk that reaches a
private market through a citadel, and how a character without access is remembered, including one
whose token predates the scope; how several stations in one region share a request; what paces each kind.

## Stage F — Custom market locations

*Nothing landed yet.*

Sections to fill: what a sale lane row carries once it can be a station as well as a structure; the
surface for adding one; what `PriceHub` means once a structure can be priced directly.

## Missing live SoT found on the way

*Nothing recorded yet.* Live documentation gaps discovered while working land here first and are
folded into the live topic docs on promote.
