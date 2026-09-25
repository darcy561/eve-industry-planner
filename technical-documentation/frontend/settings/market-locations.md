# Market locations (`Components/Settings/Standard Layout/Market Locations`)

Live SoT for the markets a reader has saved, the ones an organisation they belong to shares with
them, and the tab that manages both. A saved market is a thing in its own right here — never a kind
of the custom-structures form, which carries only the four places a job is built in.

Reached from the Settings page (`routes/_protected/settings.jsx`), which mounts
[`settingsPage.jsx`](../../../frontend/src/Components/Settings/settingsPage.jsx) and its Standard
Layout frames.

## The registry

`allMarketSources()` ([`Functions/MarketData/marketSources.js`](../../../frontend/src/Functions/MarketData/marketSources.js))
is every market a price may be asked for: the four trading hubs (static configuration, held to the
server's own list by a parity test) plus the reader's saved sources — their own markets and the ones
shared with them, filtered to a row naming a place at all. Read this rather than either list alone, so
a reader saving a market reaches every surface without any of them changing.

A source carries one `kind` — `hub`, `station` or `citadel` — and a kind is the one place three
questions are answered: whether its rows outlive the tab (`persistsAcrossSessions`), whether the
reader fetches it themselves rather than this server (`isReadByTheReader`), and whether it can be
asked cheaply about one type's freshness or only answers by its turn on a rotation
(`answersAPerTypeProbe`). A citadel is the one kind read by the reader, held past the session, and
asked only by rotation; a hub and a saved NPC station share every answer.

**The composed set an account may price against is read from the server, not assembled here.** It is
held in the React Query cache under `["market", "locations"]`
([`Functions/MarketData/marketLocations.js`](../../../frontend/src/Functions/MarketData/marketLocations.js)),
seeded from what the sign-in bootstrap already carried and re-read from
`GET /api/v1/user/market-locations` whenever a settings document moves — the account's own or any
planner's. `marketsToOffer()` answers that set, or the account's own saved lane until it has arrived,
and is the one place any caller asks the question. The entry is kept for the whole session
(`gcTime: Infinity`): nothing subscribes to it directly, so React Query's ordinary few-minute
collection would otherwise drop it and quietly fall a reader back to their own markets, losing
everything an organisation shares until some owner's settings next changed.

`useMarketSources()` is the hook a surface calls to redraw when the set changes — a market saved, or
one an organisation just shared arriving over the socket with nothing the reader did. It subscribes to
the query cache through `useSyncExternalStore` rather than issuing a query itself, so a surface
offering a market needs no query provider standing over it.

## The panel

`MarketLocationsFrame` lists every market the reader may price against — their own and the ones an
organisation shares — as a table, the settings for one opening beneath its own row and drawn only
while open. What the editor offers is a market's name, a citadel's broker rate, and — on an
organisation's row — whether it reaches the organisation's members. The place a market names is not
among them: a market somewhere else is a different market, and the prices held for it, the character
that reads it and its turn on the refresh rotation all hang off its id.

**Where a job is priced sits above the list, not on a market.** `PricedAgainst` names the market and
order type each side of a job reads by default — materials bought at one, the output sold at the
other — as an account-wide setting rather than a flag on any saved row, because buying at the bid in
Jita is a different answer from buying at the ask there and a market added is not a choice to price
against it. The first-login setup mounts the same component. A choice naming a market that is no
longer saved (removed, or an organisation that stopped sharing it) resolves back to the trading hub,
which the select shows.

**One rate answers for a citadel that is not on the list.** `UnsavedCitadelFee`, beneath the table, is
what charges a market order linked from a structure the reader has not saved — every saved citadel
answers for itself from its own row.

### What a market says about itself right now

Every row is asked, through `summariseMarket`, when it was last read and how that read went:

- A **citadel**'s moment is the `readAt` this device holds beside its prices in IndexedDB — this
  device's own clock, absent for a market never read here. Deliberately not the freshness the orders
  themselves carry, which is already old the moment a quiet structure is walked.
- A **hub or NPC station**'s moment is `pricedAt`, the clock this server states with the market — the
  same for every reader, and absent only while the region has not been walked since the market was
  saved.

**Why a citadel is not answering, where the reader can act on it.** A citadel read on this device can
fail for reasons only the reader can fix, and the read keeps what it settled on
(`Functions/MarketData/marketReadOutcome.js`) rather than the four outcomes collapsing into one
"no prices" the moment they reach a panel:

| Outcome | Shown? | Meaning |
|---------|--------|---------|
| `read` | — | Prices arrived |
| `refused` | Yes | Every character on the account was told no |
| `unaskable` | Yes | No character holds the scope, or there is none to ask |
| `failed` | No | ESI or the app; the next turn may answer, so nothing is said |

`readProblem` (`marketRows.js`) words the two shown outcomes into a `StatusChip` and an
`ExplainerTooltip` in the row's "Last read" cell — the label says what is wrong, the tooltip says what
to do about it, and both end on "the next refresh" so a reader knows when a fix takes effect. The
tooltip is reachable by keyboard (`ExplainerTooltip`'s `focusable`), because it is the only place the
fix is described.

`MarketsNotAnswering` sits beneath the table and offers the one way out for the whole list — linking
or re-authorising a character through the same
[`useLinkCharacter`](../accounts/characters.md#linking-a-character-again) the Accounts page calls —
because linking is an act on the account, not on any one market. It is absent entirely while nothing is
wrong.

## Adding, editing and saving a market

`newMarketLocation` ([`newMarket.js`](../../../frontend/src/Components/Settings/Standard%20Layout/Market%20Locations/newMarket.js))
mints a market row from what a reader picked and what was derived from it: the id in the shape a
saved market already carries, the region, and the place in whichever field the location id says it
belongs in — a station carries what its broker fee is derived from, a citadel carries the rate it was
given. The region and a station's fee inputs are derived as the place is chosen, from the same query
that resolves the location's name, rather than left for whatever happens to have arrived by the
moment a reader saves.

**Which document a write lands on is decided in one place.** `marketWriter(sharedBy)`
(`marketWriter.js`) takes the owner a row came from — absent for the reader's own — and answers with a
function that applies a transform to that owner's lane: the account's settings store for their own
markets, the planner store for an organisation's. Every control calls it rather than deciding for
itself, which is also where a permission check will go once there is a roles model to check a write
against — today every member who can see an organisation's markets may edit them. `marketEdits`
supplies the three transforms every editor uses: add, update, remove.

A write is scheduled on the normal settings debounce and then **flushed at once**, because a reader
who just added a market would otherwise be looking at a panel it is missing from until the debounce's
two seconds ran out. `marketLocationsChanged()` records that the composed set is now behind whichever
save is in flight, and `refreshMarketLocationsAfterWrite()` re-reads it once that save lands — read
again rather than merged in, so the collapsing rule that resolves two rows naming one place is not
written a second time on the client.

An organisation's row is editable once that organisation's own settings have been read
(`useMarketIsEditable`, backed by `usePlannerSettingsForOwners`): the composed row is what the panel
shows, but a write needs the owner's own lane to apply the change to, and that arrives after the rows
are summarised rather than before.

**The client holds a reader to the broker-fee ceiling at the field**, because a save the server
refuses reaches the reader as nothing at all — the figure simply never sticks. `MAX_BROKER_FEE_PERCENT`
and the server's `MaxBrokerFeePercent` are held together by a parity fixture generated from the Go
constant, on the pattern the trading-hub list already uses.

## Where every file lives

| Path | Holds |
|------|-------|
| `Functions/MarketData/marketSources.js` | `SOURCE_KIND`, `allMarketSources`, kind traits |
| `Functions/MarketData/marketLocations.js` | The composed-set cache entry, `marketsToOffer`, `refreshMarketLocationsAfterWrite` |
| `Functions/MarketData/marketReadOutcome.js` | The four read outcomes, and which a reader can act on |
| `Hooks/Static/useMarketSources.js` | `useMarketSources`, `readMarketSources` |
| `Components/Settings/Standard Layout/Market Locations/marketLocationsFrame.jsx` | The tab: table, add form, priced-against, unsaved-citadel fee |
| `.../marketRows.js` | Wording a row: labels, `readProblem` |
| `.../marketSummary.js` | `summariseMarket`, `lastReadMoment` |
| `.../marketWriter.js` | `marketWriter`, `marketEdits`, `useMarketIsEditable` |
| `.../newMarket.js` | `newMarketLocation` |
| `.../marketsNotAnswering.jsx` | The one linking offer for the whole list |
| `.../pricedAgainst.jsx` | Where each side of a job is priced by default |
| `.../unsavedCitadelFee.jsx` | The account-wide rate for a citadel that is not saved |

## Topic-only detail

The stored shape, the server's composition and de-duplication rule, and the release steps that moved
a market off the custom-structures form → [backend/api/market-locations.md](../../backend/api/market-locations.md).
Linking or re-authorising a character → [accounts/characters.md](../accounts/characters.md).
