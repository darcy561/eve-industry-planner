# Frontend — market data

## Owns (SoT)

How a market price reaches the SPA and how it is kept current, for every kind of market the planner
can price against: the four trading hubs this server prices, a reader-saved NPC station (also priced
by this server, once registered), and a reader-saved citadel (priced by the browser itself, on the
reader's own token) — under
[`frontend/src/Functions/MarketData`](../../../frontend/src/Functions/MarketData) and
[`frontend/src/Functions/EveESI/World`](../../../frontend/src/Functions/EveESI/World).

- **The source registry.** What a market source is, which kinds exist, and the one place every
  surface reads the list from.
- **The price cache.** One React Query entry per type at one source, the loader beneath it, the
  accessor every reader goes through, and the freshness rule that decides when a row is asked for
  again.
- **The citadel walk.** The per-character read of a structure's whole market, its hourly rotation, and
  the device-side tier that holds it between visits.
- **A citadel's orders**, kept from the same walk that prices it, and how the Market Data dialogue
  shows them beside a region's public order book.

## Does not own

- The `/api/v1/market-prices/query` endpoint, the region walk and the per-station derivation behind
  it → [backend/api/market-prices.md](../../backend/api/market-prices.md),
  [backend/worker/market-orders.md](../../backend/worker/market-orders.md)
- Which market source and order type a figure is priced against — the resolution ladder, account and
  job defaults → `priceResolution.js`, reached from Edit Job and the group page, not documented here
- The price history chart and the price entry dialogue, which call into this system for prices but do
  not hold any of it → [../pricing/contents.md](../pricing/contents.md)
- The dashboard watchlist, a caller of the accessor → [../dashboard/watchlist.md](../dashboard/watchlist.md)
- The stored `marketLocations` lane a reader's saved markets come from → the SPA reads it through the
  registry; the document shape and its API are backend's
- Test depth → [testing/frontend/market-data.md](../../testing/frontend/market-data.md)

## Task map

| I need to… | Read |
|------------|------|
| Find every market source the SPA can price against, and which kind each is | [registry.md](./registry.md) |
| Add a market kind, or change what one carries | [registry.md](./registry.md) § What a source kind carries |
| Read or ask for a price without knowing which kind of source answered | [cache.md](./cache.md) § The accessor |
| Know what decides a price has gone stale, and what happens when a market's clock moves | [cache.md](./cache.md) § Freshness |
| Know which markets survive a reload, and what bounds the device | [cache.md](./cache.md) § The two tiers |
| Know how a citadel's market is read, and by which character | [citadels.md](./citadels.md) § The walk |
| Know when a saved citadel is refreshed | [citadels.md](./citadels.md) § The rotation |
| Show one type's orders at a citadel, or a region's orders beside its private markets | [citadels.md](./citadels.md) § Browsing a citadel's orders |
