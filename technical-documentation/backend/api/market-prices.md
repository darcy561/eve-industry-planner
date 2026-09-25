# Market prices query (`services/api/v1endpoints/marketPricesQuery.go`)

Live SoT for `POST /api/v1/market-prices/query`, the only endpoint that answers a market price. It
serves the four trading hubs this server prices and any NPC station a reader has saved and this
server has registered — never a citadel, whose market is private and read by the browser itself; see
[frontend/market-data/citadels.md](../../frontend/market-data/citadels.md).

## Request and response

```
POST /api/v1/market-prices/query
{ "sources": { "jita": ["34", "35"], "amarr": ["35"] }, "adjustedTypeIDs": ["34"] }

{
  "sources": {
    "jita": { "refreshedAt": 1757000000000, "prices": { "34": { "buy": …, "sell": …, "buyP95": …, "sellP05": … } } },
    "amarr": { "refreshedAt": 1756999000000, "prices": { "35": { … } } }
  },
  "adjusted": { "refreshedAt": 1756900000000, "prices": { "34": 4.9 } }
}
```

- **Each source carries its own type list.** A market named in the request with no types asks for
  nothing, and a caller wanting half a job's materials at one market and half at another asks for
  exactly those pairs rather than the cross product of every market named against every type named.
- **A type a source holds no order for is absent from `prices`, not a zero row.** Zero is a figure,
  and a wrong one; absence keeps "no orders here" apart from "nobody asked".
- **The adjusted block is its own list**, not a flag over the types above, because CCP's adjusted
  price belongs to no market and refreshes daily rather than on the market's own cadence. It answers
  only when `adjustedTypeIDs` is non-empty.
- **`refreshedAt` is the moment this server last walked that source's region.** It is what a caller
  uses to decide whether rows it already holds are still good — see
  [frontend/market-data/cache.md](../../frontend/market-data/cache.md) § Freshness — and it is read
  from the same mark the worker's own refresh pass writes, not computed at request time.

## What the server refuses

- **400** — invalid JSON, nothing asked for, more prices asked for than the request cap (`maxTypeIDs`,
  500 — counted as reads, so the same type at two sources costs two of the cap, not one), or a source
  this server does not price.
- A source the server does not price is a client-side mistake and is refused rather than answered
  empty: the browser is what fetches a citadel, so naming one here would otherwise read as a market
  that happens to hold no orders.
- **This endpoint never registers a station.** A saved NPC station is registered for pricing when the
  account signs in or saves its markets, not when a price is asked for — see
  [backend/worker/market-orders.md](../../backend/worker/market-orders.md) § A market is tracked
  because an account saved it. A station this server has no record of is refused the same way an
  unpriceable source is; one whose walk has not landed yet answers with a clock of zero and no rows,
  which the caller reads the same way as "not yet walked".

## Reading it

One pipelined Redis round trip per named source, on `PricesAtLocation`, and one for the whole adjusted
block on a generic `Entries` reader — never a loop per type. A source resolves to a region and a
station through `RegionsOfTrackedStations`, so the endpoint asks ESI for nothing and touches only
Redis.

## Topic-only detail

How a region's orders are walked, how a station's prices are derived from them, and how a station
earns and loses its place in the sweep, is
[backend/worker/market-orders.md](../../backend/worker/market-orders.md). The four hubs a reader is
offered by default, and the shape a saved market takes, is
[frontend/market-data/registry.md](../../frontend/market-data/registry.md).
