package v1endpoints

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"

	"eve-industry-planner/api/helper"
	esicore "eve-industry-planner/shared/core/esi"
	esitypes "eve-industry-planner/shared/core/esi/types"
	"eve-industry-planner/shared/logs"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// How many prices one request may ask for, counting every type at every source
// it names plus each adjusted price. A client asking for more chunks its own
// request; the cap is what stops one from asking for the whole item list, and it
// counts the work rather than the type ids because the same type at two markets
// is two reads.
const maxTypeIDs = 500

// LocationPrice represents the prices for a location: best buy/sell, plus the
// outlier-trimmed percentile of each side.
type LocationPrice struct {
	Buy     float64 `json:"buy"`
	Sell    float64 `json:"sell"`
	BuyP95  float64 `json:"buyP95"`
	SellP05 float64 `json:"sellP05"`
}

// MarketPricesQueryBody names what a caller wants priced.
//
// **Each source carries its own types.** A caller pricing half a job's materials
// at Jita and half at Amarr wants specific pairs, not every type at both — one
// shared list would fetch the cross product and hand back rows nothing reads,
// which is the cost this shape exists to remove. A source with no types is no
// request at all.
//
// AdjustedTypeIDs is its own list rather than a flag over the types above,
// because CCP's adjusted price belongs to no market and is wanted for a
// different, usually smaller, set: only installation cost estimation reads it.
type MarketPricesQueryBody struct {
	Sources         map[string][]string `json:"sources"`
	AdjustedTypeIDs []string            `json:"adjustedTypeIDs"`
}

// SourcePrices is one market's answer: the moment its orders were walked, and a
// row per type it holds one for.
//
// A type the market has no order for is absent rather than a row of zeroes, so
// "no orders here" and "nobody asked" stay different answers.
type SourcePrices struct {
	RefreshedAt int64                    `json:"refreshedAt"`
	Prices      map[string]LocationPrice `json:"prices"`
}

// AdjustedPrices are CCP's own adjusted prices, which belong to no market.
//
// Their own block with their own clock: repeating them inside each source's rows
// would tie a figure that refreshes daily to the clock of one that refreshes
// hourly.
type AdjustedPrices struct {
	RefreshedAt int64              `json:"refreshedAt"`
	Prices      map[string]float64 `json:"prices"`
}

// MarketPricesQueryResponse is a plain nested object, so a top-level key is
// never ambiguously a market or a piece of metadata.
type MarketPricesQueryResponse struct {
	Sources  map[string]SourcePrices `json:"sources"`
	Adjusted *AdjustedPrices         `json:"adjusted,omitempty"`
}

// MarketPricesQueryHandler handles POST /api/v1/market-prices/query.
//
//	405 — not POST
//	400 — invalid JSON, nothing asked for, too many prices asked for, or a source
//	      this server does not price
//	200 — the requested sources, each with its clock and its rows
func (a *Handlers) MarketPricesQueryHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	m := apimetrics.GetAPIMarketPrices()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	if !helper.RequireMethod(w, r, http.MethodPost) {
		metrics.Error("method_not_allowed")
		return
	}

	reqBody, err := helper.ExtractRequestBody[MarketPricesQueryBody](r)
	if err != nil {
		metrics.Error("extraction_error")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Invalid request: %v", err), "failed to extract market price query", "market_prices_extraction_error", "market_prices", err, nil)
		return
	}

	asked, err := requestedPrices(reqBody)
	if err != nil {
		metrics.Error("invalid_request")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, err.Error(), "invalid market price query", "market_prices_invalid_request", "market_prices", nil, map[string]any{
			"sources": sourceIDsOf(reqBody.Sources),
		})
		return
	}
	if asked.invalidCount > 0 {
		logs.AttachHandlerCaveat(r, "invalid_type_ids_filtered", "some invalid type IDs filtered out", map[string]any{
			"valid_ids": asked.count, "invalid_ids": asked.invalidCount,
		})
	}

	response := MarketPricesQueryResponse{
		Sources: make(map[string]SourcePrices, len(asked.sources)),
	}

	// One round trip per source rather than two per type: the old shape asked
	// Redis once for every type it was given, whatever it was asked about.
	orders := a.Redis.MarketOrders()
	refreshedAt := regionClocks(ctx, orders)
	for _, source := range asked.sources {
		entries, err := orders.PricesAtLocation(ctx, source.location.RegionID, source.typeIDs)
		if err != nil {
			metrics.Error("redis_error")
			helper.RespondEndpointServerError(w, r, "Internal server error", "market-prices: read prices for a source", "market_prices_source_read_failed", "market_prices", err, map[string]any{
				"source": source.location.ID,
			})
			return
		}

		prices := make(map[string]LocationPrice, len(entries))
		for typeID, entry := range entries {
			prices[strconv.FormatInt(int64(typeID), 10)] = LocationPrice{
				Buy:     entry.Buy,
				Sell:    entry.Sell,
				BuyP95:  entry.BuyP95,
				SellP05: entry.SellP05,
			}
		}
		response.Sources[source.location.ID] = SourcePrices{
			RefreshedAt: refreshedAt[source.location.RegionID],
			Prices:      prices,
		}
	}

	if len(asked.adjustedTypeIDs) > 0 {
		response.Adjusted = a.adjustedPrices(ctx, asked.adjustedTypeIDs)
	}

	if err := helper.EncodeJSON(w, response); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode market prices response", "market_prices_encode_failed", "market_prices", err, nil)
		return
	}

	metrics.Success()
	m.TypesRequested.Observe(ctx, float64(asked.count))
	m.TypeIDsRequestedTotal.Add(ctx, float64(asked.count))
	logs.AttachHandlerSuccessDetail(r, "market prices query completed", map[string]any{
		"sources":        sourceIDsOf(reqBody.Sources),
		"prices_asked":   asked.count,
		"adjusted_count": len(asked.adjustedTypeIDs),
	})
}

// sourceRequest is one market and the types wanted at that market.
type sourceRequest struct {
	location esicore.MarketLocation
	typeIDs  []int32
}

// priceRequest is a validated request: what to read where, and how much of it.
type priceRequest struct {
	sources         []sourceRequest
	adjustedTypeIDs []int32
	count           int
	invalidCount    int
}

// requestedPrices validates a body into the reads it asks for.
//
// A source this server does not price is refused rather than answered empty: a
// reader-saved market is the browser's to fetch, so naming one here is a
// client-side mistake, and an empty answer would read as a market with no
// orders.
//
// A source naming no valid types is dropped rather than refused — it asks for
// nothing, and a caller that resolved every one of its types to another market
// has made no mistake. Asking for nothing at all is still refused, because a
// request that wants no answer is one.
func requestedPrices(body MarketPricesQueryBody) (priceRequest, error) {
	byID := make(map[string]esicore.MarketLocation, len(esicore.DefaultMarketLocations))
	for _, location := range esicore.DefaultMarketLocations {
		byID[location.ID] = location
	}

	asked := priceRequest{sources: make([]sourceRequest, 0, len(body.Sources))}

	// Sorted, so a request naming the same markets always reads and logs the
	// same way whatever order the map ranged in.
	for _, id := range sortedKeys(body.Sources) {
		location, held := byID[id]
		if !held {
			return priceRequest{}, fmt.Errorf("this server does not price %q", id)
		}

		typeIDs, invalid := validTypeIDs(body.Sources[id])
		asked.invalidCount += invalid
		if len(typeIDs) == 0 {
			continue
		}

		asked.sources = append(asked.sources, sourceRequest{location: location, typeIDs: typeIDs})
		asked.count += len(typeIDs)
	}

	adjusted, invalid := validTypeIDs(body.AdjustedTypeIDs)
	asked.adjustedTypeIDs = adjusted
	asked.invalidCount += invalid
	asked.count += len(adjusted)

	if asked.count == 0 {
		return priceRequest{}, fmt.Errorf("no valid prices requested")
	}
	if asked.count > maxTypeIDs {
		return priceRequest{}, fmt.Errorf("too many prices requested (max %d)", maxTypeIDs)
	}
	return asked, nil
}

// validTypeIDs keeps the ids that parse, reporting how many were dropped.
func validTypeIDs(named []string) ([]int32, int) {
	validated, invalidCount := helper.ValidateIDs(named)

	typeIDs := make([]int32, 0, len(validated))
	for _, idStr := range validated {
		typeID, err := strconv.ParseInt(idStr, 10, 32)
		if err != nil {
			invalidCount++
			continue
		}
		typeIDs = append(typeIDs, int32(typeID))
	}
	return typeIDs, invalidCount
}

func sortedKeys(sources map[string][]string) []string {
	ids := make([]string, 0, len(sources))
	for id := range sources {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

// sourceIDsOf names the markets a request asked about, for logging.
func sourceIDsOf(sources map[string][]string) []string { return sortedKeys(sources) }

// regionClocks is when each tracked region's book was last walked.
//
// A region nothing has walked is absent, which reaches a caller as zero — "no
// rows from here can be trusted to be current" rather than the epoch.
func regionClocks(ctx context.Context, orders *eipredis.MarketOrdersStore) map[int32]int64 {
	times, err := orders.RefreshTimes(ctx)
	if err != nil {
		return map[int32]int64{}
	}
	clocks := make(map[int32]int64, len(times))
	for _, entry := range times {
		clocks[entry.RegionID] = entry.LastUpdated.UnixMilli()
	}
	return clocks
}

// adjustedPrices reads CCP's adjusted price for each type.
//
// A type with no stored adjusted price is absent rather than zero: zero is a
// price, and an installation cost built on it would be wrong rather than
// missing.
func (a *Handlers) adjustedPrices(ctx context.Context, typeIDs []int32) *AdjustedPrices {
	// One round trip for the whole block, like each source above. Reading these
	// one id at a time is what made the shape this replaces cost a round trip
	// per type whatever it was asked about.
	found, err := eipredis.Entries[esitypes.AdjustedPrice](
		ctx, a.Redis.Cache(eipredis.DatasetMarketPrices), typeIDs)
	if err != nil {
		return &AdjustedPrices{Prices: map[string]float64{}}
	}

	prices := make(map[string]float64, len(found))
	var newest int64
	for typeID, adjusted := range found {
		prices[strconv.FormatInt(int64(typeID), 10)] = adjusted.AdjustedPrice
		if adjusted.LastUpdated > newest {
			newest = adjusted.LastUpdated
		}
	}

	return &AdjustedPrices{RefreshedAt: newest, Prices: prices}
}
