# The price cache (`Functions/MarketData/priceCache.js`, `priceLoader.js`, `marketPriceForType.js`)

Live SoT for where a price lives once fetched, what decides it has gone stale, and how a caller reads
one without knowing which kind of source it came from.

## The unit of a price

One type at one source — a row of `{ buy, sell, buyP95, sellP05 }`, held as one React Query entry
under `priceQueryKey(typeID, sourceID)`. CCP's adjusted price is a separate entry under
`adjustedQueryKey(typeID)`; it belongs to no market and refreshes on its own day-long cadence.

A type a source holds no order for has no entry rather than a row of zeroes: absence keeps "no orders
here" and "nobody has asked" as different answers, and every accessor below says what absence means
for its own caller.

## The loader

`priceLoader.js` batches a tick's wants: everything asked for in one JavaScript macrotask flushes as
one request per transport. A tick's wants are split by the kind of source each names — hub and station
wants go to `/api/v1/market-prices/query` (see
[backend/api/market-prices.md](../../backend/api/market-prices.md)), citadel wants go through the
per-character walk in [citadels.md](./citadels.md) — because the server refuses a whole request that
names a source it does not price, so the two must never be asked together. Each transport settles only
its own waiters: a citadel that cannot be read leaves hub and station prices standing, and an
unreachable server leaves the citadel's.

A source the registry cannot name is rejected rather than answered — that is the absence of anywhere
to ask, not "this market holds no order", and a stored choice that has outlived the market it named
must read as the former.

## The accessor

`getMarketPriceForType`, `getAdjustedPriceForType` and `getPriceRefreshedAt`, in
`Functions/MarketData/marketPriceForType.js`, are what every price read in the SPA goes through; all
three read the cache through `priceCache.js` and nothing else. They answer synchronously from
whatever the cache already holds rather than waiting on a fetch, which is what lets a non-React reader
— `Classes/shoppingList.js`, a reduce inside `materialCostByOrderType` — read a price mid-build.

Reading and asking are separate. Asking has two entry points: `useMarketPricesQuery` for a component
that wants prices while it renders, and `fetchPrices(queryClient, wants)` for a flow already running
outside render. Both share the one cache, so a price either path resolves is present for the other.

## Freshness

A market's own clock decides what has gone stale, not an age guess. `sourceClocks.js` holds the newest
`refreshedAt` seen for each hub and station; `recordSourceClock` reports whether an incoming clock
**moved past** the one held — the first clock from a market is never a move, because the rows arriving
with it are current as of it. `PRICE_STALE_TIME` is `Infinity`: a held row never expires by age, only
by its market's clock moving.

When a market's clock moves, every entry it holds is **removed**, not invalidated — an *invalidated*
entry with an infinite stale time is still handed straight back, so removal is what makes the next
reader ask again.

**A priced surface subscribes to no row entry.** It reads figures synchronously while rendering, so
dropping a market's rows reaches nobody on its own. What re-renders it is `useMarketPricesQuery`: the
clock-moved listener invalidates that query alongside removing the rows, and the query returns each
asked market's clock so React Query has a changed field to notify on.

Nothing polls a market for its clock. `revalidateSourceClocks`, paced by
`Functions/MarketData/priceRefreshSchedule.js`, asks each market currently holding rows for one type
it already holds — the answer's own `refreshedAt` settles whether every other row held for that market
is still good. The schedule runs from `index.jsx`, owned by no component, on a fifteen-minute tick
that matches the server's own scheduler — with a five-minute floor on the extra probe fired when a
background tab regains focus.

## The two tiers

**Session.** The four hubs and any saved station: rows and clocks held for the tab's life, nothing
beneath them. A reload asks again, which is cheap because this server already holds the answer.

**Persistent.** A saved citadel only — its rows are read at the reader's own expense and cannot be had
for free again. `priceStore.js` holds them on `idb-keyval`, read through **beneath** the query cache:
a miss falls through to disk before reaching the network, and a resolve writes both. Every call into
the store is bounded and answers as a miss on failure, timeout or a browsing mode with no storage, so
a reader with no IndexedDB still gets prices, fetched every time. A market holding no order is not
written to disk — it is the cheapest fact to relearn.

A stored row's clock does not survive a reload on its own; restoring a citadel's rows from disk
restores that market's clock with them, from the `refreshedAt` each row already carries, so a market
read before is not treated as being read for the first time.

**What bounds the device.** A version prefix in the store's keys is bumped once per shipped build that
changes the record's shape; a stale-version pass on first touch of the store removes anything under an
earlier version. Separately, `dropUnreadMarkets` throws away a market's rows, its character record and
its freshness record together once nothing has asked for it in a day — judged by when the device last
read it, not by the registry or by ESI's own timestamps, so a market that keeps failing still ages out
rather than being kept alive by its own failures. See [citadels.md](./citadels.md) § The rotation for
what "a market's turn" means and why a row carries no expiry of its own.
