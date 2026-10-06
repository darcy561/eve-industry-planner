# Selling charges (`frontend/src/Functions/MarketOrders`)

Live SoT for what it costs to list an item and to sell it, where a sale is priced from, and which
character its rates are quoted for. Shared between the Planning stage's Returns and Skills panels
and the Selling stage, so both read one formula rather than growing a second copy.

## Sale locations

`saleLocations.js` normalises an NPC station and a saved citadel into one `SaleLocation`, so a caller
pricing a sale never branches on which kind it is — it reads `brokerFee`, and a sale is priced at the
place it happens.

| Field | Holds |
|-------|-------|
| `kind` | `SALE_LOCATION_KIND.NPC_STATION` (`"npcStation"`) or `.CITADEL` (`"citadel"`) |
| `id` / `name` | The market source id or the saved citadel's id, and its display name |
| `feeStationID` | The NPC station whose owner's standings set the broker fee; `null` at a citadel, whose owner sets a rate directly |
| `brokerFee` | The owner's rate at a citadel; `null` at an NPC station, where the rate is derived from the seller |

A citadel is priced on its own orders, so the shape names no other market for its prices.

`resolveSaleLocation(saleLocationID, marketID)` takes a saved citadel's id or a market source id ahead
of the market argument, and only falls back to that market — then to the trading hub — when the named
id does not resolve: a named station is honoured as the choice it is, rather than falling through to
whichever market the materials are priced against.

`getSaleCitadels()` and `getDefaultSaleStructure()` are the only way anything reads which citadels a
player can sell from and which market a job sells from when it names none. The citadels are the saved
ones in the market source registry (`savedCitadels(allMarketSources())`, see
[../settings/market-locations.md](../settings/market-locations.md)); the default is the account's
selling default, or the trading hub where that names a market no longer saved.

## Broker fee and sales tax

`sellingRates.js` answers what a sale costs, as a **working** (the rate and what it is made of) and
an **amount**, for each charge:

| | Broker fee | Sales tax |
|---|---|---|
| At an NPC station | Derived: base, less Broker Relations, less faction and corporation standing | Derived: base, less Accounting |
| At a citadel | The owner's rate, used verbatim — Broker Relations and standings do not apply | Derived: base, less Accounting |
| Signed out | Base rate, no reduction | Base rate, no reduction |

Sales tax has no location term: it is a character figure, charged the same way wherever the sale
happens. Accounting reduces it multiplicatively (`base × (1 − 0.11 × level)`); the broker fee's
coefficients subtract from the base instead — the two read alike and are not interchangeable. The
broker fee's coefficients in `brokerFeeRates` are set so that maximum Broker Relations and standings
come to exactly the 1% NPC floor, which is why the derived rate needs no clamp of its own; negative
standings raise it above base, which is correct.

`brokerFeeWorking` and `salesTaxWorking` name every term applied — `BROKER_FEE_TERMS` is
`brokerRelations`, `faction`, `corporation` — so the figure can be checked term by term rather than
taken on faith. A term the app could not read (see below) carries `unknown: true` rather than
resolving to zero. A standing's entity is named even at zero, since an empty cell beside a named
entity reads as a gap in the working rather than as the answer; a standing below zero raises the fee
and is shown with a plus.

An NPC station's faction is resolved through `Hooks/React Query/World/raceFactions.js`
(`/universe/races/`, whose `alliance_id` is the faction id) rather than by matching the station's
`race_id` directly against the standing list — a station reports the race that built it, and the
standing that reduces its fee is held against that race's *faction*, a different id in a different
category. The match also checks the standing's `from_type`, since a faction and an NPC corporation
can share an id across categories.

`getSellerSkills` and `getStationStandings` throw on failure rather than returning an empty
collection: an empty collection would read as "untrained" or "no standing", which is a claim about the
seller that a 403, a 5xx, a network error or a missing character gives no basis for. A 403 answers
with `data: null`, and both throw otherwise; callers carry the resulting `unknown` flag through to
the rate rather than reporting a zero. The cached accessors return an empty collection both while loading and after an
error, so a caller distinguishes them by the query's own `isLoading` / `isError`, not by inspecting
the collection.

`calcSellingCharges` resolves both charges for a real order at link time, and pairs with
`useSellingRateInputs`/`ensureSellingRateInputs`, which fetches the skill and standing reads a
character has not already been subscribed for. Base rates, skill coefficients and standing
coefficients live in `defaultValues.jsx` as `brokerFeeRates` and `salesTaxRates`; the market skill
type ids they key off — Broker Relations and Accounting — are `marketSkillIDs`, both resolvable
through the skill catalogue (`bpSkills.json`) the way any other skill is.

## Who the rates are quoted for

`sellerCharacter.js` resolves the character a job's selling figures are quoted for:
`resolveSellerCharacter(override)` takes a job's own named seller ahead of
`applicationSettings.defaultMarketCharacter`, and falls back to the account's main with
`isDefault: true` when neither is set — so a rate block can say it is guessing rather than quoting.
`DefaultMarketCharacter` is chosen on **Job Settings**, beside the reprocessing default, and is nil
until a player sets one.

`Hooks/Planner/useJobSellingContext.js` is the one place a panel resolves who sells and from where:
it reads the job's own selling plan ahead of the account defaults and returns the seller, the
resolved `SaleLocation`, and the hub the layout prices against. Returns, Skills and Cost Breakdown
(through `useJobEconomics`, [cost-breakdown.md](./cost-breakdown.md)) all read this hook rather than
resolving the pair themselves, because a seller and a location resolved three times over three panels
can drift apart from each other.

A job's own choice is held on the job's build as `build.sellerCharacter` and `build.saleLocationID`
(`JobBuild` in `services/shared/models/job.go`, both nullable and omitted when nil), set through
`setSellingPlan` and edited from the Returns rate block ([returns.md](./returns.md)). Clearing either returns the job to
the account defaults. Both are **planning inputs only**: once the job reaches the Selling stage, the
authority is the real ESI market order, which carries its own character and figures, and nothing
downstream reads the plan once an order is linked. On a shared planner, each member resolves the
plan's seller against their own characters — a seller named by another member's account cannot have
their fee worked out, so resolution falls back to the reader's own default and says so.
