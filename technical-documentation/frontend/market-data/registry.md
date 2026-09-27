# The market source registry (`Functions/MarketData/registry/marketSources.js`)

Live SoT for what a market source is and where the SPA reads the list of them from.

## What a source kind carries

Three kinds, distinguished by who fetches a market's orders, who derives its prices from them, and
whether its prices survive a reload:

| Kind | Fetched by | Derived by | Tier |
|------|-----------|-----------|------|
| **Default hub** (4) | This server, hourly | This server | Session — nothing beneath the cache |
| **Custom NPC station** | This server, once a reader has saved one | This server | Session |
| **Custom citadel** | The browser, with the reader's own ESI token | The browser | Persistent — read through IndexedDB |

A custom citadel is how a private market is reached: a reader adds the citadel that market runs in,
and it is read with that reader's own token, which is what grants the access. There is no separate
"private market" kind beside it.

A saved NPC station is public — `/markets/{region_id}/orders` takes no token — so it costs the same
one request this server already pays to walk the region a hub sits in, and the browser fetches
nothing for it. A citadel's market has no per-type read (`/markets/structures/{id}/` answers with the
whole market or nothing), needs a token, and needs a character who can dock there, so it stays the
browser's own fetch. **Public data centralises, private data does not**, and that line is what decides
a source's kind.

## The registry

`allMarketSources()` is what every caller reads. It composes the four hubs — a constant, held to
`models.DefaultMarketLocations` by a committed fixture (§ The hub list) — with whatever markets the
reader has saved. Nothing above it may assume a source is one of the four hubs.

Those saved markets come from `marketsToOffer()` in `Functions/MarketData/registry/marketLocations.js`: the
composed set the server answers with, which is the account's own markets **plus the ones each
organisation it belongs to has shared**, collapsed so one place is one market. Until that set has
been read it falls back to the account's own lane, so a reader part-way through signing in is
offered the markets they saved rather than none — but the steady state includes what a corporation
or alliance shared with them, and a surface offering markets gets those without knowing it.

`Hooks/Static/useMarketSources.js` wraps it for components, so a surface re-renders when the set
moves. A caller outside render — a class, a reducer, anything that cannot call a hook — calls
`allMarketSources()` itself, which is a plain function and needs no imperative twin. `sourceIn`
and `sourceNameIn` answer questions about the registry; `SOURCE_KIND` marks which kind a source is.

**Nothing in the store holds this list.** `allMarketSources()` is a plain function, not a Zustand
slice: the registry is composed fresh from configuration and the reader's saved markets, and nothing
above the loader branches on where a source came from.

## The hub list

The four trading hubs the server prices are static configuration, not a document — they move only
when a deploy moves them. `GLOBAL_CONFIG.MARKET_OPTIONS` in `global-config-app.js` carries them, and
has exactly one reader: the registry that builds from it. `DEFAULT_MARKET_OPTION` is a separate
constant — a default *choice*, not a copy of the list.

`testing/fixtures/market-hubs/hubs.json` is derived from `models.DefaultMarketLocations` and checked
against `MARKET_OPTIONS` on both sides, so the two cannot drift without failing a test —
[testing/frontend/market-data.md](../../testing/frontend/market-data.md) has where.

## What a stored row looks like

A reader's saved market — an NPC station or a citadel — is a `marketLocations` row read the same way
a hub is: a region to walk (or read), and either a station or a structure to filter or read from.
Nothing about a saved row records who can reach it; `citadels.md` § The walk covers how that is
discovered instead.
