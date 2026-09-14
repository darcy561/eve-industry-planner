# Market price delivery — measurements

Raw numbers this project's design was argued from. Add to it as work lands; do not replace a
measurement with the conclusion drawn from it.

## Response payload

Serialised sizes of the market price response, computed from the shape the handler emits with
representative ISK figures (eight and seven significant digits, which is what real hub prices look
like). Sampled against a served response afterwards — see § A served response, below.

| Shape | 1 type | 500 types |
|-------|--------|-----------|
| Today: four hubs × four bases, plus `adjustedPrice`, `lastUpdated`, `typeID` | 415 B | 208,501 B |
| Proposed: one hub, four bases, one hub clock for the whole response | — | 42,553 B |

A 500-type request against one hub is **79 % smaller**. Two hubs would be roughly 85 KB, still under
half of today's. The saving from the hub clock (§ Freshness belongs to the source in
[plan.md](./plan.md)) is separate and larger in ordinary use, because the common repeat ask becomes an
empty one.

## Server read cost

Counted from the `/api/v1/market-prices` handler as it stood when this was measured, which called
`fetchMarketPricesForType` once per validated type id. That handler was deleted in Stage B and its
replacement is `marketPricesQuery.go`; the figures below are what the measurement was taken against:

- Per type: 1 `GET` for the adjusted price, 1 `MGET` across the four hub regions.
- A 500-type request: **~1,000 sequential Redis round trips**, no pipelining.
- Proposed: one pipelined round trip per requested hub, plus one for adjusted prices when asked for.

No latency measurement has been taken yet. The handler already logs `duration_ms` and escalates to
`apimetrics.LogRequestMetrics` past a second, so the data to compare against exists in the running
system.

## ESI market routes

Read from the published ESI schema at `https://esi.evetech.net/meta/openapi.json`, not from the SPA's
existing calls. These are what decide that a custom NPC station and a custom citadel are different
fetch problems.

| Route | Auth | `type_id` filter | Paged | Note |
|-------|------|------------------|-------|------|
| `/markets/{region_id}/orders` | None | **Yes** (`order_type` required) | Yes | What a custom NPC station uses; filter the result to the station's `location_id` |
| `/markets/structures/{structure_id}` | **`esi-markets.structure_markets.v1`** | **No** | Yes | Whole book only. What a custom citadel forces |
| `/markets/{region_id}/history` | None | Required | No | Expires daily at 11:05 per the schema description |
| `/markets/{region_id}/types` | None | — | Yes | Type ids with active orders in a region; not used today |

`esi-markets.structure_markets.v1` does not appear anywhere in the repository. SSO scopes are supplied
at runtime through the environment rather than checked in, so confirm the live scope string against
the deployment before assuming the SPA cannot read a structure market today.

## Duplicated hub list

`GLOBAL_CONFIG.MARKET_OPTIONS` (`frontend/src/global-config-app.js`) and
`esicore.DefaultMarketLocations` (`services/shared/core/esi/locations.go`) carry the same four hubs
with the same region and station ids. Readers of the SPA copy, excluding tests, at the time the plan
was written — **13 files**:

```
Components/Edit Job/.../Materials And Sourcing/Helpers/marketLabelHelpers.js
Components/Edit Job/.../Returns/saleLocationRates.jsx
Components/Edit Job/.../Market Costs Panel/marketCostsPanel.jsx
Components/Reprocessing/basicMineralOutput.jsx
Functions/MarketData/marketPriceForType.js
Functions/MarketOrders/saleLocations.js
Styled Components/IconButton/marketData.jsx
Styled Components/IconButton/marketHistory.jsx
Styled Components/LineGraph/priceHistory.jsx
Styled Components/Select/marketLocation.jsx
Styled Components/Typography/marketData.jsx
Styled Components/Typography/marketHistory.jsx
Zustand/worldDataSlice/marketData.js
```

### A served response

Taken from the dev stack's own `/api/v1/market-prices` before that endpoint was deleted, which was the
last moment it could be. 500 type ids in one request, answered in 66 ms.

| | Bytes |
|---|---|
| Served, the shape being replaced | 128,671 |
| The same data in the new shape, one source | 121 |
| The same data in the new shape, if absent rows were sent as zeroes | 24,121 |
| The new shape with the adjusted block asked for as well | 5,024 |

**Dev's order books are nearly empty**, so these are not production sizes: 25 of the 500 types carried
a figure at any hub, and one carried a figure at Jita. That is exactly what makes the sample worth
keeping. The shape being replaced spends **128 KB describing data it does not have** — its size is
decided by the number of types asked about and the number of hubs, not by how much is known — while the
new shape's size follows the data. The 79 % figure computed above is what the change saves when every
type is priced; this is what it saves when they are not, and the two ends bracket the real answer.

The third row is the same 500 types with a row of zeroes written for every unpriced one, and it is why
absence is not zero: sending zeroes would give back most of the saving and state 499 prices that are
not prices.

## Refresh cadence

From the code, not from observation:

| Piece | Value | Where |
|-------|-------|-------|
| Hub order book re-walk | 1 hour | `regionSweepInterval`, `core/scheduler/esi/regionMarketOrdersRefresh.go` |
| Stored price entry TTL | 2 hours | `ttlRegionPrice`, `shared/redis/marketorders.go` |
| Cached region page / ETag TTL | 24 hours | `ttlRegionPage`, `ttlRegionETags` |
| Browser's staleness guess | 4 hours | `DEFAULT_ITEM_REFRESH_PERIOD`, `frontend/src/global-config-app.js` — both since deleted, Stage B |
| Cost of a full four-hub pass | ~1,674 ESI tokens against 12,000 per 15 min | Comment on `regionSweepInterval` |

## Dead code found

Nothing imported either file; both were deleted in Stage B:

- `frontend/src/Functions/MarketData/refreshMarketData.js`
- `frontend/src/Functions/MarketData/requestChunks.js` — the System Indexes area has its own
  `requestChunks` and uses it; this one is the unused twin.

## `go fix -diff`

Run while the plan was written, scoped to the packages in the project's touch surface.

| Scope | Result |
|-------|--------|
| `./shared/redis/...` | Clean |
| `./shared/core/esi/...` | Clean |
| `./worker/tasks/esi/...` | Clean |
| `./core/scheduler/esi/...` | Clean |
| `./api/v1endpoints/...` | Suggestions in `authenticate.go`, `refresh.go`, `session_types.go`, `statistics/live_scope_test.go`; none in a file this project touches. Re-run after Stage B: unchanged |
