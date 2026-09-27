# Market data — tests

Live SoT for test depth across the SPA's market price system: the source registry, the price cache and
its loader, the freshness rule, the two storage tiers, and the citadel walk. Behaviour →
[frontend/market-data/contents.md](../../frontend/market-data/contents.md) for the task map into the
topics; each row below links the one it tests. Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Whole suite | From `frontend/`: `npm test -- --run` | Vitest; no browser, no stack |
| Market data tree | `npx vitest run src/Functions/MarketData` | Registry, cache, loader, derivation, citadel |
| ESI world calls | `npx vitest run src/Functions/EveESI/World` | Structure orders, the per-character walk |
| End to end | `npx vitest run priceDelivery.e2e citadelDelivery.e2e` | Mocks `fetch` only; everything else is real |
| Coverage | `npm run coverage` | `vitest run --coverage` |

## Coverage map

**Depth:** Strong on the cache, the loader, the freshness rule and the citadel walk, each with an
end-to-end test on top of its units. Thin on the components that read prices while rendering, which
carry targeted tests rather than exhaustive coverage of every surface.

### Tested

| Area | Topic | What the tests cover |
|------|-------|-----------------------|
| `Functions/MarketData/registry/marketSources.js` | [registry.md](../../frontend/market-data/registry.md) | Which kind a source is, the traits a kind carries (tier, who reads it, whether it answers a cheap freshness question), and the registry composing the four hubs with the reader's saved markets |
| `global-config-app.parity.test.js` | [registry.md](../../frontend/market-data/registry.md) § The hub list | `MARKET_OPTIONS` against `testing/fixtures/market-hubs/hubs.json`, derived from `models.DefaultMarketLocations` — an id, region and station drift on either side fails here |
| `Functions/MarketData/prices/priceCache.js`, `priceLoader.js` | [cache.md](../../frontend/market-data/cache.md) | Wants batched within a macrotask and split by transport; a refusal thrown rather than settled as "no order"; a source the registry cannot name rejected rather than answered; chunking merged per source rather than by whole-object assign; `priceCache.rotation.test.js` and `priceCache.readThrough.test.js` cover the citadel path specifically — see below |
| `Functions/MarketData/prices/priceCache.js` — freshness | [cache.md](../../frontend/market-data/cache.md) § Freshness | A refresh drops each price older than it and leaves a price still being fetched alone; a price that settled as nothing is dropped once the market is walked; zero or non-finite is refused; a drop invalidates the wrapper query rather than merely invalidating the prices; an invalidated price is handed back rather than re-asked, which is what the static stale time buys; `priceCache.refreshTimes.test.jsx` covers the query returning each asked price's refresh time so a refetch is visible to a component that reads `data` |
| `Functions/MarketData/prices/priceLoader.js` — announcing | [cache.md](../../frontend/market-data/cache.md) § Freshness | Every market an answer named is announced with the moment it stated, per market asked for rather than per block answered; a failed request announces nothing |
| `Functions/MarketData/prices/priceStore.js` | [cache.md](../../frontend/market-data/cache.md) § The two tiers | Read-through on `idb-keyval` (via `fake-indexeddb`): a miss falls through to a fetch, a resolve writes the type's prices and the market's refresh time together, a store that never answers is treated as a miss, a version bump abandons prices under the earlier prefix, and `dropUnreadMarkets` clears a market's prices, character record and freshness record together once its `readAt` is past the bound |
| `Functions/MarketData/prices/priceRefreshSchedule.js` | [cache.md](../../frontend/market-data/cache.md) § Freshness | The fifteen-minute tick, the five-minute floor on the extra probe fired on tab focus, and the `started` guard making a second start a no-op |
| `Functions/MarketData/prices/pricesFromOrders.js`, `pricesFromOrders.parity.test.js` | [citadels.md](../../frontend/market-data/citadels.md) § The walk | The derivation against `testing/fixtures/market-derivation/orders.json`, generated from the server's own `buildMarketPriceEntry` — twenty orders is the smallest case that states which percentile rule is in force; plus shapes only the SPA meets: no orders at all, a location id given as a number against one held as a string, and an order with no usable price that must not turn into a `NaN` |
| `Functions/EveESI/World/getStructureOrders.js` | [citadels.md](../../frontend/market-data/citadels.md) § The walk | Every page read as one character; a refusal, a failed request and a missing scope told apart; a market past the page cap refused whole rather than partially priced |
| `Functions/EveESI/World/askEachCharacter.js` | [citadels.md](../../frontend/market-data/citadels.md) § The walk | Shared with structure-name resolution — the first real answer wins, a transient failure never settles as "no access", a token missing the scope is neither a refusal nor retried |
| `Functions/MarketData/citadels/citadelPrices.js`, `priceCache.rotation.test.js` | [citadels.md](../../frontend/market-data/citadels.md) § The rotation | The hourly turn, a market read straight away at sign-in and again only when the roster actually moved, a refused market waiting its full turn versus a merely failed one retried sooner, and the read-then-await-write-then-announce order — announcing before the device write lands would send an open surface to prices still being replaced |
| `Functions/MarketData/citadels/ordersAtCitadels.js`, `Hooks/React Query/World/citadelOrders.js` | [citadels.md](../../frontend/market-data/citadels.md) § Browsing a citadel's orders | Selecting one type's orders out of what a walk stored; a citadel nothing has read yet contributing nothing rather than an error |
| `Functions/MarketData/citadels/regionOrderMerge.js` | [citadels.md](../../frontend/market-data/citadels.md) § Browsing a citadel's orders | A region's public orders merged with the reader's own citadels in it, deduplicated by place with the region's own copy winning |
| `Functions/Endpoints/Public/marketPricesQuery.js`, `marketPricesQuery.parity.test.js` | [../services/api.md](../services/api.md) § `v1endpoints` — market prices surface | Every JSON path and kind `testing/fixtures/market-prices/surface.json` carries, checked against the same fixture the Go handler's own test writes |
| `Functions/MarketData/prices/priceDelivery.e2e.test.jsx` | [cache.md](../../frontend/market-data/cache.md) | The hub and saved-station path end to end, mocking only `fetch`: the narrowed request, the refresh time kept on the prices, an absent type reading as no price, a held price not re-asked, and a request that fails leaving `useMarketPricesQuery` erroring rather than loading forever |
| `Functions/MarketData/citadels/citadelDelivery.e2e.test.jsx` | [citadels.md](../../frontend/market-data/citadels.md) | The whole citadel path against faked ESI, the account's characters and their tokens: the walk, the derivation, the loader, IndexedDB, the cache and a real render together — including a market read while a surface is watching, and that surface's first fill |

### Thin

- Components that read a price while rendering — `Classes/shoppingList.js`, order-type comparisons —
  carry targeted tests for the defect shapes found along the way (zero-filled prices read as real
  figure, a price flashing to zero on the way to a refetch) rather than exhaustive per-surface
  coverage.
- `Functions/MarketData/defaults/priceResolution.js`, which decides which source and order type a caller asks
  for, is covered by its own unit tests but not walked from every call site.

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- The end-to-end tests exist because every unit test on this path mocks a neighbour — the client, the
  loader, the cache or the accessor — so none of them alone can say a price actually arrives. Fixture
  dates in the citadel end-to-end test are relative to `Date.now()` rather than fixed, because a fixed
  date puts every market past its turn the moment the calendar passes it.
- `tests/seedPrices.js` stamps every price it seeds with a refresh time, which is the only place that
  moment is held — a price seeded without one reads as having come from before its market was walked.
