package v1endpoints

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"eve-industry-planner/api/api/helper"
	esicore "eve-industry-planner/shared/core/esi"
	esitypes "eve-industry-planner/shared/core/esi/types"
	natscore "eve-industry-planner/shared/core/nats"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	taskscore "eve-industry-planner/shared/tasks"

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

// MarketPricesHandler handles POST requests for market prices
// POST: expects array of type IDs in body ["12345", "67890"]
func MarketPricesHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	m := metrics.GetAPIMarketPrices()

	// Set context timeout
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Only accept POST requests
	if r.Method != http.MethodPost {
		duration := time.Since(start)
		m.Errors.WithLabelValues("method_not_allowed").Inc()
		metrics.LogRequestMetrics("market_prices", duration, "method_not_allowed",
			"method", r.Method, "path", r.URL.Path, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "invalid method for market prices endpoint", "method", r.Method, "path", r.URL.Path, "ip", r.RemoteAddr)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract request body into MarketPricesBody struct
	reqBody, err := helper.ExtractRequestBody[MarketPricesBody](r)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("extraction_error").Inc()
		metrics.LogRequestMetrics("market_prices", duration, "extraction_error",
			"error", err, "method", r.Method, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "failed to extract type IDs", "error", err, "method", r.Method, "ip", r.RemoteAddr)
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	// Validate and clean type IDs
	validatedIDs, invalidCount := helper.ValidateIDs(reqBody.RequestedIDs)
	if len(validatedIDs) == 0 {
		duration := time.Since(start)
		m.Errors.WithLabelValues("no_valid_ids").Inc()
		metrics.LogRequestMetrics("market_prices", duration, "no_valid_ids",
			"total_ids", len(reqBody.RequestedIDs), "invalid_ids", invalidCount, "ip", r.RemoteAddr)
		logs.WarnCtx(r.Context(), "no valid type IDs provided", "total_ids", len(reqBody.RequestedIDs), "invalid_ids", invalidCount, "ip", r.RemoteAddr)
		http.Error(w, "No valid type IDs provided", http.StatusBadRequest)
		return
	}

	// Check if the number of type IDs is too many
	if len(validatedIDs) > maxTypeIDs {
		duration := time.Since(start)
		m.Errors.WithLabelValues("too_many_ids").Inc()
		metrics.LogRequestMetrics("market_prices", duration, "too_many_ids",
			"count", len(validatedIDs), "max", maxTypeIDs, "ip", r.RemoteAddr)
		logs.WarnCtx(r.Context(), "too many type IDs requested", "count", len(validatedIDs), "max", maxTypeIDs, "ip", r.RemoteAddr)
		http.Error(w, fmt.Sprintf("Too many type IDs (max %d)", maxTypeIDs), http.StatusBadRequest)
		return
	}

	// Log if any invalid type IDs were filtered out
	if invalidCount > 0 {
		logs.InfoCtx(r.Context(), "some invalid type IDs filtered out", "total_ids", len(reqBody.RequestedIDs), "valid_ids", len(validatedIDs), "invalid_ids", invalidCount, "ip", r.RemoteAddr)
	}

	// Retrieve market prices from Redis
	result := make(map[string]MarketPriceResponse, len(validatedIDs))
	typesFound := 0
	typesNotFound := 0

	for _, idStr := range validatedIDs {
		typeID, _ := strconv.ParseInt(idStr, 10, 32) // Already validated, so no error check needed

		response, found, err := fetchMarketPricesForType(ctx, clients.Redis, clients.JetStream, clients.NATS, int32(typeID))
		if err != nil {
			m.Errors.WithLabelValues("redis_error").Inc()
			logs.WarnCtx(ctx, "redis error retrieving market prices", "error", err, "type_id", typeID, "ip", r.RemoteAddr)
		}

		if found {
			typesFound++
		} else {
			typesNotFound++
		}

		result[idStr] = response
	}

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(duration.Seconds())
	m.RequestsCount.Inc()
	m.TypesRequested.Observe(float64(len(validatedIDs)))
	m.TypesFound.Add(float64(typesFound))
	m.TypesNotFound.Add(float64(typesNotFound))

	// Log per-request metrics for slow requests or with interesting data
	metrics.LogRequestMetrics("market_prices", duration, "success",
		"method", r.Method,
		"type_ids_count", len(validatedIDs),
		"types_found", typesFound,
		"types_not_found", typesNotFound,
		"ip", r.RemoteAddr,
	)

	// Log successful request (detailed)
	logs.InfoCtx(ctx, "market prices request completed",
		"method", r.Method,
		"type_ids_count", len(validatedIDs),
		"types_found", typesFound,
		"types_not_found", typesNotFound,
		"duration_ms", duration.Milliseconds(),
		"ip", r.RemoteAddr,
	)

	// Encode response (nginx handles compression)
	if err := helper.EncodeJSON(w, result); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("encode_error").Inc()
		metrics.LogRequestMetrics("market_prices", duration, "encode_error",
			"error", err, "ip", r.RemoteAddr)
		logs.ErrorCtx(r.Context(), "failed to encode response", "error", err, "ip", r.RemoteAddr)
	}
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

			// Use high-priority subject for missing market prices to prioritize them over scheduled refreshes
			subject := natscore.SubjectFetchMissingMarketPrices
			if err := natscore.PublishTask(js, subject, taskscore.TaskTypeRefreshMarketPrices, request, natsConn); err != nil {
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
