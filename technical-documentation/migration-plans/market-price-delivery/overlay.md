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
reads; `sourceIn`, `sourceNameIn` and `isServerHeld` are the questions asked of it, and `SOURCE_KIND`
marks which kind a source is. `Hooks/Static/useMarketSources.js` wraps it for components and offers
`readMarketSources()` for callers outside render — the same hook-plus-imperative pair
`marketGroupData.js` and its hooks already use.

`GLOBAL_CONFIG.MARKET_OPTIONS` now has exactly one reader: the registry that builds from it.
`DEFAULT_MARKET_OPTION` stays in config, because it is a default *choice* rather than a copy of the
list.

| Reads it through | Which |
|------------------|-------|
| `useMarketSources()` | `marketLocation.jsx`, `priceHistory.jsx`, `marketCostsPanel.jsx` |
| `readMarketSources()` | `marketLabelHelpers.js`, `marketLinkTarget.js`, `saleLocations.js`, `saleLocationRates.jsx` |
| `allMarketSources()` directly | `worldDataSlice/marketData.js`, building `findMarketData`'s zero-filled shape |

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

*Nothing landed yet.*

Sections to fill: the query and response shape; how the handler reads Redis and what it does with a
source it does not hold; how the world-data store is keyed and the one accessor every price read goes
through; how a call site names the sources it wants.

## Stage C — Freshness from the source's clock

*Nothing landed yet.*

Sections to fill: what the browser records per source, and where that differs for a source fetched per
type; what decides a fetch; what became of the per-type age guess.

## Stage D — The price cache and its two tiers

*Nothing landed yet.*

Sections to fill: the cache entry and the loader beneath it; the accessor that reads and the two ways
of asking, and what became of `worldData.marketData` and `getMissingESIData`; the IndexedDB store, its
version and its eviction path.

## Stage E — Sources the browser fetches

*Nothing landed yet.*

Sections to fill: the shared per-character walk extracted from `nameLoader` and what both callers pass
it; the derivation in the SPA and what holds it in agreement with the Go one; the
per-type path for a custom NPC station; the token-authenticated whole-book walk that reaches a
private market through a citadel, and how a character without access is remembered; the ESI scope and
when it was added; how several stations in one region share a request; what paces each kind.

## Stage F — Custom market locations

*Nothing landed yet.*

Sections to fill: what a sale lane row carries once it can be a station as well as a structure; the
surface for adding one; what `PriceHub` means once a structure can be priced directly.

## Missing live SoT found on the way

*Nothing recorded yet.* Live documentation gaps discovered while working land here first and are
folded into the live topic docs on promote.
