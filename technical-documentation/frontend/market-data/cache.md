# The price cache (`Functions/MarketData/prices/priceCache.js`, `priceLoader.js`, `marketPriceForType.js`)

Live SoT for where a price lives once fetched, what decides it has gone stale, and how a caller reads
one without knowing which kind of source it came from.

## The unit of a price

One type at one market — its prices, `{ buy, sell, buyP95, sellP05 }`, held as one React Query entry
under `priceQueryKey(typeID, marketLocation)`. CCP's adjusted price is a separate entry under
`adjustedQueryKey(typeID)`; it belongs to no market and refreshes on its own day-long cadence.

A type a source holds no order for has no entry rather than prices of zero: absence keeps "no orders
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

`readMarketPriceForType`, `readAdjustedPriceForType` and `readPriceRefreshedAt`, in
`Functions/MarketData/prices/marketPriceForType.js`, are what every price read in the SPA goes through; all
three read the cache through `priceCache.js` and nothing else. They answer synchronously from
whatever the cache already holds rather than waiting on a fetch, which is what lets a non-React reader
— `Classes/shoppingList.js`, a reduce inside `materialCostByOrderType` — read a price mid-build.

Reading and asking are separate. Asking has two entry points: `useMarketPricesQuery` for a component
that wants prices while it renders, and `fetchPrices(queryClient, wants)` for a flow already running
outside render. Both share the one cache, so a price either path resolves is present for the other.

## Freshness

A market's own refresh time decides what has gone stale, not an age guess. That moment is held in
one place: `refreshedAt` on each price, stamped as it lands. `PRICE_STALE_TIME` is `Infinity` — a held
price never expires by age, only by its market refreshing.

The loader announces the refresh time every answer carried and decides nothing else; the cache, which
holds the prices a refresh supersedes, is where the comparison happens. It drops **each price older
than the announced moment** rather than the market as a whole, which is what makes it safe to run in
the middle of the very read that announced it: a price still settling holds no answer to be older
than anything, and the prices the read has already written carry the moment announced. A price that
settled as no price at all carries no moment, and came from before the market had ever been walked,
so a first refresh does supersede those and nothing else.

Prices are **removed**, not invalidated — an *invalidated* entry with an infinite stale time is still
handed straight back, so removal is what makes the next reader ask again.

**A priced surface subscribes to no price entry.** It reads figures synchronously while rendering, so
dropping a market's prices reaches nobody on its own. What re-renders it is `useMarketPricesQuery`: the
market-refreshed listener invalidates that query alongside removing the prices, and the query returns the
refresh time of every price asked for so React Query has a changed field to notify on.

Nothing polls a market for its refresh time. `revalidateMarketRefreshTimes`, paced by
`Functions/MarketData/prices/priceRefreshSchedule.js`, asks each market currently holding prices for one type
it already holds — the answer's own `refreshedAt` settles whether every other price held for that market
is still good. The schedule runs from `index.jsx`, owned by no component, on a fifteen-minute tick
that matches the server's own scheduler — with a five-minute floor on the extra probe fired when a
background tab regains focus.

## The two tiers

**Session.** The four hubs and any saved station: prices held for the tab's life, nothing
beneath them. A reload asks again, which is cheap because this server already holds the answer.

**Persistent.** A saved citadel only — its prices are read at the reader's own expense and cannot be had
for free again. `priceStore.js` holds them on `idb-keyval`, read through **beneath** the query cache:
a miss falls through to disk before reaching the network, and a resolve writes both. Every call into
the store is bounded and answers as a miss on failure, timeout or a browsing mode with no storage, so
a reader with no IndexedDB still gets prices, fetched every time. A market holding no order is not
written to disk — it is the cheapest fact to relearn.

**What bounds the device.** A version prefix in the store's keys is bumped once per shipped build that
changes the record's shape; a stale-version pass on first touch of the store removes anything under an
earlier version. Separately, `dropUnreadMarkets` throws away a market's prices, its character record and
its freshness record together once nothing has asked for it in a day — judged by when the device last
read it, not by the registry or by ESI's own timestamps, so a market that keeps failing still ages out
rather than being kept alive by its own failures. See [citadels.md](./citadels.md) § The rotation for
what "a market's turn" means and why a price carries no expiry of its own.

**Two orderings in the store are load-bearing.** Writing a market stamps its freshness record **last**,
after every price entry has been written: a write that gives out halfway then leaves a market due again
rather than one whose record claims a read it did not finish. And the sweep for unread markets asks
whether each market is past the bound **as it reaches that market**, not for every market before it
deletes any — deciding about them all up front threw away a market that had been refreshed while the
scan was still walking, losing the read just paid for.
