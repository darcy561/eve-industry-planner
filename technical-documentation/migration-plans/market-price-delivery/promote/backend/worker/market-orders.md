# Market order pricing (`services/worker/tasks/esi/`)

Live SoT for how this server prices a market: the region walk, the per-station derivation beneath it,
and how a station earns and loses its place in the sweep. Package:
[`services/worker/tasks/esi`](../../../services/worker/tasks/esi). Endpoint that reads the result →
[api/market-prices.md](../api/market-prices.md).

## Walking a region and pricing a station are two tasks

`RefreshRegionMarketOrders` (`refreshRegionMarketOrders.go`, over `regionMarketOrdersFetch.go`) walks
one region, writes its pages and ETags, records the region's refresh time, and publishes
`deriveRegionMarketPrices`. It does not know or care which station anyone wants — ESI-bound, hourly,
paced by the existing budget check.

`DeriveRegionMarketPrices` (`regionMarketPricesDerive.go`) reads the region's stored pages and the
stations tracked in it, and writes a price per type per tracked station. It asks ESI for nothing, so a
second station added to an already-walked region costs a stored-page read and a filter, not another
walk. The two fail independently: a derive that errors does not waste the walk, and a walk deferred by
budget does not stop a station deriving from pages already held.

## Where the pages live

A region's raw order pages are written to the `market-pages` object-store bucket rather than Redis —
see [shared/objectstore.md](../shared/objectstore.md). A **304** on the first page of a region's walk
is replayed by checking each page is **held** in that bucket rather than refetched and decoded; a page
that turns out not to be held is downgraded to changed, so an unavailable object store cannot make a
walk claim a region is current with nothing behind it.

Redis still holds what is small and hot: ETags, ~2-hour price entries, refresh times, and the
per-region set of wanted stations.

## A market is tracked because an account saved it

**Registration happens where the account is known, not where a price is asked for.** The login
handler and the settings-save handler call `marketsources.Register` with the structures the account
already holds; `RegionsOfTrackedStations` answers, in one Redis read, which of an account's saved
markets this server already prices, and only the ones missing are published for `TrackMarketSources`
to resolve. `/api/v1/market-prices/query` registers nothing itself — it only reads.

`TrackMarketSources` resolves a station through `/universe/stations/` → `/universe/systems/` →
`/universe/constellations/`, caches the resolved region without expiry (a station never moves),
`TrackStation`s it, and asks for what the market still needs: the first station in a region publishes
a walk, a later one in an already-tracked region publishes a derive, and one already tracked publishes
nothing. A station that fails to resolve is skipped rather than failing the whole pass; only a 404 on
the station itself is remembered as unknown, and only for ten minutes.

**Retention.** `retireUnaskedMarkets` runs daily. It drops a tracked station once nothing has asked
about it for **fourteen days** — long enough that a reader pricing weekly, or on holiday, never
re-pays their region's first walk — and a region loses its stored pages seven days after its last
station goes, via `DropRegionsOlderThan`, a backstop far past the age of any region still walked
hourly. The four default hubs are tracked on every scheduler tick rather than when walked, so they
never fall out.

## `PutPrice` is per station

Prices are keyed by station, not by region: two stations in one region no longer collide, and
`/api/v1/market-prices/query` reads a source's own station id to match.

## Topic-only detail

The derivation itself — best bid, best ask, nearest-rank percentile with the under-five-orders
fallback — is `percentilePrice`, held to the SPA's own citadel derivation by a committed fixture; see
[frontend/market-data/citadels.md](../../frontend/market-data/citadels.md) § The walk. Bucket
ownership and retention mechanics live in [shared/objectstore.md](../shared/objectstore.md).
