package v1endpoints

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"eve-industry-planner/api/helper"
	esicore "eve-industry-planner/shared/core/esi"
	esitypes "eve-industry-planner/shared/core/esi/types"
	natscore "eve-industry-planner/shared/core/nats"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

const (
	maxTypeIDs = 500
)

type MarketPricesBody struct {
	RequestedIDs []string `json:"typeIDs"`
}

// MarketPriceResponse represents the response structure for market prices endpoint
// Location IDs are direct keys in the JSON response, not nested under "locations"
type MarketPriceResponse struct {
	locations     map[string]LocationPrice // location_id -> {buy, sell} (private, marshaled directly)
	AdjustedPrice float64                  `json:"adjustedPrice"`
	LastUpdated   int64                    `json:"lastUpdated"`
	TypeID        int32                    `json:"typeID"`
}

// LocationPrice represents buy/sell prices for a location
type LocationPrice struct {
	Buy  float64 `json:"buy"`
	Sell float64 `json:"sell"`
}

// MarshalJSON implements custom JSON marshaling to flatten location IDs as top-level keys
func (r MarketPriceResponse) MarshalJSON() ([]byte, error) {
	// Create a map to hold all fields including location IDs as top-level keys
	result := make(map[string]any)

	// Add all location IDs as top-level keys
	for locationID, price := range r.locations {
		result[locationID] = price
	}

	// Add other fields (using camelCase to match frontend expectations)
	result["adjustedPrice"] = r.AdjustedPrice
	result["lastUpdated"] = r.LastUpdated
	result["typeID"] = r.TypeID
	return json.Marshal(result)
}

// MarketPricesHandler handles POST /api/v1/marketprices/query with JSON body { typeIDs: string[] }.
// Public: rate limit → handler. Client retries: withRequestRetries (408, 429, 5xx).
//
//	405 — not POST
//	400 — invalid JSON, missing typeIDs, empty array, too many IDs, or invalid IDs
//	200 — JSON map of typeID → price rows; missing keys appear as empty arrays
func (a *Handlers) MarketPricesHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
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

	reqBody, err := helper.ExtractRequestBody[MarketPricesBody](r)
	if err != nil {
		metrics.Error("extraction_error")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Invalid request: %v", err), "failed to extract type IDs", "market_prices_extraction_error", "market_prices", err, nil)
		return
	}

	validatedIDs, invalidCount := helper.ValidateIDs(reqBody.RequestedIDs)
	if len(validatedIDs) == 0 {
		metrics.Error("no_valid_ids")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No valid type IDs provided", "no valid type IDs provided", "market_prices_no_valid_ids", "market_prices", nil, map[string]any{
			"total_ids": len(reqBody.RequestedIDs), "invalid_ids": invalidCount,
		})
		return
	}

	if len(validatedIDs) > maxTypeIDs {
		metrics.Error("too_many_ids")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Too many type IDs (max %d)", maxTypeIDs), "too many type IDs requested", "market_prices_too_many_ids", "market_prices", nil, map[string]any{
			"count": len(validatedIDs), "max": maxTypeIDs,
		})
		return
	}

	if invalidCount > 0 {
		logs.AttachHandlerCaveat(r, "invalid_type_ids_filtered", "some invalid type IDs filtered out", map[string]any{
			"total_ids":   len(reqBody.RequestedIDs),
			"valid_ids":   len(validatedIDs),
			"invalid_ids": invalidCount,
		})
	}

	logs.AttachDebugStep(r, "type_ids_validated", map[string]any{
		"valid_count":   len(validatedIDs),
		"invalid_count": invalidCount,
	})

	result := make(map[string]MarketPriceResponse, len(validatedIDs))
	typesFound := 0
	typesNotFound := 0
	missingIDs := make([]string, 0)

	for _, idStr := range validatedIDs {
		typeID, _ := strconv.ParseInt(idStr, 10, 32)

		response, found, err := a.fetchMarketPricesForType(ctx, r, int32(typeID))
		if err != nil {
			metrics.Error("redis_error")
			logs.AttachHandlerCaveat(r, "redis_market_prices_error", "redis error retrieving market prices", map[string]any{
				"error":   err.Error(),
				"type_id": typeID,
			})
		}

		if found {
			typesFound++
		} else {
			typesNotFound++
			missingIDs = append(missingIDs, idStr)
		}

		result[idStr] = response
	}

	logs.AttachDebugStep(r, "redis_fetch_completed", map[string]any{
		"types_found":     typesFound,
		"types_not_found": typesNotFound,
	})

	if err := helper.EncodeJSON(w, result); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode market prices response", "market_prices_encode_failed", "market_prices", err, nil)
		return
	}

	duration := time.Since(start)
	m.TypesRequested.Observe(ctx, float64(len(validatedIDs)))
	m.TypeIDsRequestedTotal.Add(ctx, float64(len(validatedIDs)))
	if typesNotFound > 0 {
		m.RequestsWithMissingPrices.Inc(ctx)
	}

	logs.AttachHandlerSuccessDetail(r, "market prices request completed", map[string]any{
		"requested_type_ids": validatedIDs,
		"missing_type_ids":   missingIDs,
		"type_ids_count":     len(validatedIDs),
		"types_found":        typesFound,
		"types_not_found":    typesNotFound,
		"duration_ms":        duration.Milliseconds(),
	})

	if duration > time.Second {
		apimetrics.LogRequestMetrics(ctx, "market_prices", duration, "success",
			"type_ids_count", len(validatedIDs),
			"types_found", typesFound,
			"types_not_found", typesNotFound,
		)
	}
}

// fetchMarketPricesForType fetches market prices for a specific type ID from Redis
// Returns the response, whether any data was found, and any error
func (a *Handlers) fetchMarketPricesForType(ctx context.Context, r *http.Request, typeID int32) (MarketPriceResponse, bool, error) {
	response := MarketPriceResponse{
		locations:     make(map[string]LocationPrice),
		AdjustedPrice: 0,
		LastUpdated:   0,
		TypeID:        typeID,
	}

	// Fetch adjusted price
	var adjustedPrice esitypes.AdjustedPrice
	err := rediscore.GetMarketPrice(ctx, a.Redis, typeID, &adjustedPrice)
	if err == nil {
		response.AdjustedPrice = adjustedPrice.AdjustedPrice
	}

	// Build list of region IDs from default locations for batch fetch
	locationIDs := make([]int32, len(esicore.DefaultMarketLocations))
	for i, location := range esicore.DefaultMarketLocations {
		locationIDs[i] = location.RegionID
	}

	// Fetch market prices for all locations using batch MGet (single operation, fastest)
	priceEntries, err := rediscore.GetMarketPriceEntriesByType(ctx, a.Redis, typeID, locationIDs)
	if err != nil {
		if r != nil {
			logs.AttachHandlerCaveat(r, "market_price_entries_fetch_failed", "failed to fetch market price entries by type", map[string]any{
				"error":   err.Error(),
				"type_id": typeID,
			})
		}
		// Continue with empty map - will send refresh messages
		priceEntries = make(map[int32]*rediscore.MarketPriceEntry)
	}

	hasAnyData := false
	minLastUpdated := int64(0)

	// Process all default locations
	for _, location := range esicore.DefaultMarketLocations {
		// Look up price entry for this location's region ID
		priceEntry, found := priceEntries[int32(location.RegionID)]
		if !found || priceEntry == nil {
			// Market price not found for this location - add with zero prices
			response.locations[location.ID] = LocationPrice{
				Buy:  0,
				Sell: 0,
			}
			continue
		}

		// Market price found
		hasAnyData = true
		response.locations[location.ID] = LocationPrice{
			Buy:  priceEntry.Buy,
			Sell: priceEntry.Sell,
		}

		// Track minimum last updated (only from non-zero values)
		if priceEntry.LastUpdated > 0 {
			if minLastUpdated == 0 || priceEntry.LastUpdated < minLastUpdated {
				minLastUpdated = priceEntry.LastUpdated
			}
		}
	}

	// If no data found for any location, send messages to worker to request prices for all locations
	if !hasAnyData {
		// Validate typeID before sending messages
		if typeID == 0 {
			if r != nil {
				logs.AttachHandlerCaveat(r, "market_prices_refresh_skipped_invalid_type", "skipping market prices refresh messages due to invalid type_id", map[string]any{
					"type_id": typeID,
				})
			}
			return response, hasAnyData, nil
		}

		// Send message for each default location
		for _, location := range esicore.DefaultMarketLocations {

			request := natscore.MarketPricesRequest{
				TypeID:     typeID,
				LocationID: location.RegionID,
				StationID:  location.StationID,
			}

			// Use high-priority task for missing market prices (FetchMissingMarketPrices has DefaultPriority Priority2)
			if err := natscore.PublishTask(ctx, a.JetStream, taskscore.FetchMissingMarketPrices.Subject, taskscore.FetchMissingMarketPrices.Name, request, a.NATS); err != nil {
				if r != nil {
					logs.AttachHandlerCaveat(r, "market_prices_refresh_publish_failed", "failed to publish market prices refresh message", map[string]any{
						"type_id":     typeID,
						"location_id": location.RegionID,
						"station_id":  location.StationID,
						"error":       err.Error(),
					})
				}
				// Continue with other locations even if one fails
			}
		}
	}

	// Set last_updated to the minimum from all market prices (or 0 if none found)
	response.LastUpdated = minLastUpdated

	return response, hasAnyData, nil
}
