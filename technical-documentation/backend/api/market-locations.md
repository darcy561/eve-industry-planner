# Market locations API

Storing and composing the markets an account or a planner has saved — as against the four kinds of
place a job is performed in, which carry a different shape entirely. The system spans:

- **`services/shared/models`** — `MarketLocation` / `MarketLocations`, the type both settings
  documents carry, and `Validate`, the rule a saved lane must pass before it is stored.
- **`services/shared/mongo`** — `MarketLocationsForAccount`, which composes the set one account may
  price against, and `models.ComposeMarketLocations`, the collapsing rule it calls.
- **`services/api/v1endpoints/user`** — `GET /api/v1/user/market-locations`.
- **`services/api/v1endpoints/planners`** — `PUT /api/v1/planners/{ownerHandle}/settings`, which
  carries a planner's market lane.
- **`services/core/commands`** — the two release steps that gave every settings document the lane and
  moved what had been saved onto it.

## The stored shape

`MarketLocation` carries what a market has, and nothing a place a job runs in has:

| Field | Carries |
|-------|---------|
| `id`, `name` | Identity. `id` is never rewritten once minted — a job setup referencing a market by id keeps resolving across a save |
| `sharedWithMembers` | Whether an organisation's market reaches its members' accounts. Meaningless on an account's own row, which nobody inherits |
| `regionID` | Never omitted — every market has one, so an absent value is a fault to see rather than a zero to hide |
| `stationID` / `structureID` | Exactly one, never both. Which sort of market a row is follows from the place it names; nothing stores a kind that could disagree with it |
| `raceID`, `ownerID` | What an NPC station's broker fee is derived from — the faction a standing is held against, and the corporation holding the other side of it. Absent on a citadel |
| `brokerFee` | A citadel owner's rate, which nothing can derive. Absent on a station, whose fee comes from the seller's own skills and standings |

`sharedBy` and `pricedAt` are carried on the wire only (`bson:"-"`): `sharedBy` is which owner a
composed row came from, true only of the answer a reader is handed, never of the row as its owner
stored it; `pricedAt` is when this server last walked the region the market sits in, which moves
without the market changing and says nothing about a citadel, whose orders are read with a
character's own token rather than by this server at all.

`marketLocations` is a lane on both `models.ApplicationSettings` and `planner.Settings`, so every
owner that can hold settings can hold markets — including the planners owned by a corporation or an
alliance. An owner with none stores `[]`, never `null`: `null` is reserved for what is genuinely
absent, and an owner who has saved no markets has an empty list of them rather than nothing said about
them at all.

The four trading hubs this server prices — Jita, Amarr, Dodixie, Hek — are `models.MarketLocation`
values too, held in `models.DefaultMarketLocations` rather than a document. A hub and a saved NPC
station are the same thing to everything downstream: a region to walk and a station to filter orders
to.

## Composing the set an account may price against

`GET /api/v1/user/market-locations` answers every market the account may price against — its own,
plus what each organisation it belongs to has shared — composed server-side by
`Mongo.MarketLocationsForAccount` and `models.ComposeMarketLocations`. This is the only place the rule
exists:

- Take the account's own markets, and from every planner its membership admits it to, the markets
  that planner has ticked `sharedWithMembers`. An unshared row on an organisation's document reaches
  nobody.
- Collapse by **place** — `structureID` when a row has one, else `stationID`. Two rows naming one
  place are one market.
- On a collision the account's **own** row wins outright: its name for the market and the rate it
  recorded. Where two *inherited* rows collide and neither is the account's own, the nearer owner
  wins — a corporation's row before an alliance's, any other planner after both — and a further tie
  falls to the lower owner key, so the answer does not depend on the order the documents were read in.
  This decides every field the row carries, the broker fee included: it is a figure somebody typed for
  a citadel, and two owners can genuinely disagree about what one charges.
- A planner whose settings could not be *read* is left out of the answer and logged, distinct from one
  that simply has no settings document yet — an organisation's markets going quietly missing from
  every member's answer is what this exists to stop happening to one citadel.

`marketsources.StampPricedAt` fills `pricedAt` on every path that hands markets to a client — this
endpoint, the sign-in bootstrap, and the account's own settings — from the moment this server last
walked the region. It is stamped rather than stored because it is a fact about the server's own
walking, not about the market.

The union is delivered apart from `application_settings`, which the SPA sends back whole on every
settings save: filling that document's `marketLocations` with the composed answer would have the next
save of any setting write another owner's markets permanently into the account's own lane.

## Saving a lane

`PUT /api/v1/user/application-settings` and `PUT /api/v1/planners/{ownerHandle}/settings` each carry a
`marketLocations` lane on the document they save, and each applies `MarketLocations.Validate` before
writing it — on the type both documents embed, so a row saved through either reaches the same
validation and the same pricing:

| Rule | Detail |
|------|--------|
| Row count | At most 200 |
| Name | Required, at most 120 characters |
| Region | Required |
| Place | Exactly one of `stationID` / `structureID` |
| Broker fee | Zero on a station; 0–100 on a citadel (`MaxBrokerFeePercent`) |
| Ids | No duplicate `id` within the lane |

What it does not check is whether the place exists — that is an ESI question, answered when the
reader chose it, and asking it again here would make saving any setting depend on ESI being up.

Saving a planner's market lane also registers what that planner shares for pricing
(`marketsources.Register(ctx, ..., stored.MarketLocations.Shared())`), asked for as the planner saves
rather than waiting for a member to read it — the shared rows only, since one kept internal to the
planner reaches no member and would be a region walked for nobody.

## Where every file lives

| Path | Holds |
|------|-------|
| `shared/models/marketLocations.go` | `MarketLocation`, `MarketLocations`, `DefaultMarketLocations`, `TakeMarketLocations` |
| `shared/models/market_locations_validate.go` | `Validate` and its limits |
| `shared/mongo/market_locations.go` | `MarketLocationsForAccount` |
| `api/v1endpoints/user/marketLocations.go` | `GET /api/v1/user/market-locations` |
| `api/v1endpoints/planners/putSettings.go` | `PUT /api/v1/planners/{ownerHandle}/settings`, and where a planner's shared markets are registered |
| `api/marketsources/pricedat.go` | `StampPricedAt` |
| `core/commands/release_market_locations.go` | `seedMarketLocationLane` — gives every settings document an empty lane |
| `core/commands/release_market_move.go` | `moveMarketsToTheirOwnLane` — writes down what reading already moves |

## A document that predates the lane

A settings document's schema upgrader lifts a row out of `customStructures` onto the market lane as
the document is read, tested by the row's kind and place rather than by the document's declared
schema version — so it reaches a document whatever version it claims, and both settings loaders run
it. The settings schema version does not move for this: an empty lane needs no bump, since a document
decoded before it existed simply has no markets, which is what it has.

## Topic-only detail

Which markets this server is told to price, and how their orders are fetched, derived, held and
rotated once registered, is decided beyond this topic — `marketsources.Register` is where a lane
reaches that machinery. The SPA surface that manages a saved market, and reads what is true of it, is
[frontend/settings/market-locations.md](../../frontend/settings/market-locations.md).
