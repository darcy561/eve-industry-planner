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
	"eve-industry-planner/shared"
	taskscore "eve-industry-planner/shared/tasks"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/redis/go-redis/v9"
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
	result := make(map[string]interface{})

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
func MarketPricesHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIMarketPrices()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	// Only accept POST requests
	if !helper.RequireMethod(w, r, http.MethodPost) {
		duration := time.Since(start)
		metrics.Error("method_not_allowed")
		apimetrics.LogRequestMetrics(ctx, "market_prices", duration, "method_not_allowed")
		logs.WarnCtx(ctx, "invalid method for market prices endpoint")
		return
	}

	// Extract request body into MarketPricesBody struct
	reqBody, err := helper.ExtractRequestBody[MarketPricesBody](r)
	if err != nil {
		duration := time.Since(start)
		metrics.Error("extraction_error")
		apimetrics.LogRequestMetrics(ctx, "market_prices", duration, "extraction_error",
			"error", err)
		logs.WarnCtx(ctx, "failed to extract type IDs", "error", err)
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	// Validate and clean type IDs
	validatedIDs, invalidCount := helper.ValidateIDs(reqBody.RequestedIDs)
	if len(validatedIDs) == 0 {
		duration := time.Since(start)
		metrics.Error("no_valid_ids")
		apimetrics.LogRequestMetrics(ctx, "market_prices", duration, "no_valid_ids",
			"total_ids", len(reqBody.RequestedIDs), "invalid_ids", invalidCount)
		logs.WarnCtx(ctx, "no valid type IDs provided", "total_ids", len(reqBody.RequestedIDs), "invalid_ids", invalidCount)
		http.Error(w, "No valid type IDs provided", http.StatusBadRequest)
		return
	}

	// Check if the number of type IDs is too many
	if len(validatedIDs) > maxTypeIDs {
		duration := time.Since(start)
		metrics.Error("too_many_ids")
		apimetrics.LogRequestMetrics(ctx, "market_prices", duration, "too_many_ids",
			"count", len(validatedIDs), "max", maxTypeIDs)
		logs.WarnCtx(ctx, "too many type IDs requested", "count", len(validatedIDs), "max", maxTypeIDs)
		http.Error(w, fmt.Sprintf("Too many type IDs (max %d)", maxTypeIDs), http.StatusBadRequest)
		return
	}

	// Log if any invalid type IDs were filtered out
	if invalidCount > 0 {
		logs.InfoCtx(ctx, "some invalid type IDs filtered out", "total_ids", len(reqBody.RequestedIDs), "valid_ids", len(validatedIDs), "invalid_ids", invalidCount)
	}

	// Retrieve market prices from Redis
	result := make(map[string]MarketPriceResponse, len(validatedIDs))
	typesFound := 0
	typesNotFound := 0

	for _, idStr := range validatedIDs {
		typeID, _ := strconv.ParseInt(idStr, 10, 32) // Already validated, so no error check needed

		response, found, err := fetchMarketPricesForType(ctx, clients.Redis, clients.JetStream, clients.NATS, int32(typeID))
		if err != nil {
			metrics.Error("redis_error")
			logs.WarnCtx(ctx, "redis error retrieving market prices", "error", err, "type_id", typeID)
		}

		if found {
			typesFound++
		} else {
			typesNotFound++
		}

		result[idStr] = response
	}

	// Encode response (nginx handles compression); only record success metrics/logs after body is written
	if err := helper.EncodeJSON(w, result); err != nil {
		duration := time.Since(start)
		metrics.Error("encode_error")
		apimetrics.LogRequestMetrics(ctx, "market_prices", duration, "encode_error",
			"error", err)
		logs.ErrorCtx(ctx, "failed to encode response", "error", err)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	duration := time.Since(start)
	m.TypesRequested.Observe(ctx, float64(len(validatedIDs)))
	m.TypeIDsRequestedTotal.Add(ctx, float64(len(validatedIDs)))
	if typesNotFound > 0 {
		m.RequestsWithMissingPrices.Inc(ctx)
	}

	apimetrics.LogRequestMetrics(ctx, "market_prices", duration, "success",
		"type_ids_count", len(validatedIDs),
		"types_found", typesFound,
		"types_not_found", typesNotFound,
	)

	logs.InfoCtx(ctx, "market prices request completed",
		"type_ids_count", len(validatedIDs),
		"types_found", typesFound,
		"types_not_found", typesNotFound,
		"duration_ms", duration.Milliseconds(),
	)
}

// fetchMarketPricesForType fetches market prices for a specific type ID from Redis
// Returns the response, whether any data was found, and any error
func fetchMarketPricesForType(ctx context.Context, redisClient *redis.Client, js jetstream.JetStream, natsConn *nats.Conn, typeID int32) (MarketPriceResponse, bool, error) {
	response := MarketPriceResponse{
		locations:     make(map[string]LocationPrice),
		AdjustedPrice: 0,
		LastUpdated:   0,
		TypeID:        typeID,
	}

	// Fetch adjusted price
	var adjustedPrice esitypes.AdjustedPrice
	err := rediscore.GetMarketPrice(ctx, redisClient, typeID, &adjustedPrice)
	if err == nil {
		response.AdjustedPrice = adjustedPrice.AdjustedPrice
	}

	// Build list of region IDs from default locations for batch fetch
	locationIDs := make([]int32, len(esicore.DefaultMarketLocations))
	for i, location := range esicore.DefaultMarketLocations {
		locationIDs[i] = location.RegionID
	}

	// Fetch market prices for all locations using batch MGet (single operation, fastest)
	priceEntries, err := rediscore.GetMarketPriceEntriesByType(ctx, redisClient, typeID, locationIDs)
	if err != nil {
		logs.WarnCtx(ctx, "failed to fetch market price entries by type", "error", err, "type_id", typeID)
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
			logs.WarnCtx(ctx, "skipping market prices refresh messages due to invalid type_id", "type_id", typeID)
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
			if err := natscore.PublishTask(ctx, js, taskscore.FetchMissingMarketPrices.Subject, taskscore.FetchMissingMarketPrices.Name, request, natsConn); err != nil {
				logs.WarnCtx(ctx, "failed to publish market prices refresh message",
					"type_id", typeID,
					"location_id", location.RegionID,
					"station_id", location.StationID,
					"error", err)
				// Continue with other locations even if one fails
			}
		}
	}

	// Set last_updated to the minimum from all market prices (or 0 if none found)
	response.LastUpdated = minLastUpdated

	return response, hasAnyData, nil
}
