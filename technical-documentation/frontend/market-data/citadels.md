# A citadel's market (`citadelPrices.js`, `Functions/EveESI/World/getStructureOrders.js`, `askEachCharacter.js`)

Live SoT for the one market the browser still fetches for itself, and for browsing the orders that
walk read.

## The walk

`GET /markets/structures/{id}/` answers with a structure's whole market or nothing — there is no
per-type form of it — so a want for one type costs what a want for every type costs. Everything below
follows from that: the read answers every type at once, what it answers with is kept, and a rotation
rather than a request per want is what keeps it current.

`getStructureOrders.js` reads every page of a structure's orders as one character, and tells apart a
refusal, a request that failed, and a token that was never granted
`esi-markets.structure_markets.v1`. A market past the page cap is refused whole rather than priced from
a partial read, because a read cut short would report a best ask nobody is offering with nothing
downstream able to tell that from a real figure.

**Which character reads it.** `askEachCharacter.js` is the walk across an account's linked characters,
shared unchanged with structure-name resolution: the first real answer wins, a transient failure never
settles as "no access" — the character that failed might not be the one who could see it — and a token
that never carried the scope is neither a refusal nor something to retry. No character field is stored
on a saved row and nothing is asked of the reader; `citadelPrices.js` asks the character that answered
last time first, then the rest, and keeps that record in IndexedDB beside the market's prices, so a
market whose access has moved heals itself on the next read.

**The prices.** Orders are bucketed per type and put through `pricesFromOrders.js`, the same
derivation a committed fixture holds to the server's own (§ Where E1 lands — see
[backend/worker/market-orders.md](../../backend/worker/market-orders.md) for the server side of that
fixture). A type with no order is absent rather than zero.

**What a read does, in order.** Read the market, **await** writing it to the device, then announce the
refresh time it was read under. The order matters: announcing drops the prices the read superseded and
wakes every open surface reading them, and those surfaces read through the device — announcing before
the write finished would send them to prices the read was still replacing. One read runs per
market at a time, so a scheduled rotation and a panel wanting the same market share it rather than
doubling the walk.

A market's prices are replaced whole, not merged: a whole-market read is a statement about every type on
it, so a type the new read did not see has no standing regardless of what an older read said.

## The rotation

Every saved citadel is read once an hour (`PRICE_ROTATION_MS`), whether or not it has been priced
against yet — a market is saved because the reader means to price against it, so refreshing only what
has already been asked for would leave figures fresh where a reader has been and stale everywhere
else. The hour matches this server's own hub cadence, so a citadel's figures and a hub's carry the
same kind of age.

**A price carries no expiry of its own**, and nothing sweeps one on its own schedule. `gcTime` is what
retires an unobserved price from memory; on the device, a market's turn on the rotation is the only fact
deciding when its held prices stop standing. `readAt` — the device's own clock, not ESI's — is the
separate fact `cache.md` § What bounds the device ages a market out by; the two are kept apart because
a market that keeps failing has its turn moved forward on every attempt, and pacing and age cannot
share one number.

A reader signing in has their saved citadels read straight away, from the point in login where the
account's characters are first known, rather than waiting for the first tick. A roster change — a
character linked or unlinked — triggers the same read again, but only when the roster has actually
moved, so a reader alt-tabbing back does not walk their own structures on every reconnect. A market
the account was refused waits out its full turn before being tried again; a read that merely failed
does not, because a failure says nothing about whether the market is reachable.

## Browsing a citadel's orders

The walk that prices a citadel keeps its orders too, under a key of their own beside the derived
prices, written from the same pass rather than a second walk. The write cannot fail the pricing it sits
beside: it is fire-and-forget, so a reader over their storage quota loses the browsing and keeps the
costing rather than losing both.

`Functions/MarketData/citadels/ordersAtCitadels.js` selects one type's orders out of what is stored, and
`Hooks/React Query/World/citadelOrders.js` puts a surface behind it — shaped like the region-orders
hook so a surface drawing both is handed the same thing twice. It is keyed by **region**: a saved
market carries the region it sits in, and `citadelsInRegion` in `marketSources.js` finds every citadel
the reader has saved there. A surface reads and never fetches — the rotation already keeps what it
needs, so opening it spends nothing; a citadel nothing has read yet contributes nothing rather than an
error.

`Functions/MarketData/citadels/regionOrderMerge.js` merges a region's public orders with the reader's private
markets inside it, in the `useMarketData` hook rather than in a dialogue, so every caller of that hook
gets the whole region. A structure ESI already publishes publicly and a citadel the reader saved
separately are deduplicated by place; the region's own copy wins, because both hold the same market
and merging them would otherwise show one market at two different moments.
