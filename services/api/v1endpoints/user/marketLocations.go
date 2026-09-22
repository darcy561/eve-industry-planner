package user

import (
	"context"
	"errors"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/marketsources"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// marketLocationsResponse is every market the account may price against.
//
// A list rather than the settings document that holds the account's own: this
// answer is composed from several owners, and the document goes back to the
// server on save. Sending the union inside it would have the next save write
// another owner's markets into this account's own lane.
type marketLocationsResponse struct {
	MarketLocations models.MarketLocations `json:"marketLocations"`
}

// MarketLocationsHandler handles GET /api/v1/user/market-locations — the markets
// this account saved, plus the ones each organisation it belongs to has shared.
//
// Read again rather than merged into: a websocket update about any owner's
// settings says the union may have moved, and this is what says what it moved
// to. The rule for composing it lives on this side only.
func (h *Handlers) MarketLocationsHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	m := apimetrics.GetAPIEveTokenLogin()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	if r.Method != http.MethodGet {
		metrics.Error("method_not_allowed")
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed,
			"Method not allowed. Use GET to retrieve the markets this account may price against.",
			"invalid method for market locations endpoint", "market_locations_method_not_allowed",
			"eve_token_login", nil, map[string]any{"method": r.Method})
		return
	}

	accountID := helper.AuthenticatedAccountID(r)
	if accountID == "" {
		metrics.Error("auth_error")
		helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized",
			"market locations: missing account", "market_locations_missing_account",
			"eve_token_login", nil, nil)
		return
	}
	if h.Mongo == nil {
		metrics.Error("mongo_client_missing")
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Service unavailable",
			"market locations: mongo client missing", "market_locations_mongo_unavailable",
			"eve_token_login", errors.New("mongo client missing"), nil)
		return
	}

	composed, err := h.Mongo.MarketLocationsForAccount(ctx, accountID, time.Now().UTC())
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve market locations",
			"market locations: read failed", "market_locations_read_failed",
			"eve_token_login", err, nil)
		return
	}

	w.WriteHeader(http.StatusOK)
	stamped := marketsources.StampPricedAt(ctx, h.Redis, composed)
	if err := helper.EncodeJSON(w, marketLocationsResponse{MarketLocations: stamped}); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error",
			"market locations: encode failed", "market_locations_encode_failed",
			"eve_token_login", err, nil)
		return
	}

	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "market locations composed", map[string]any{
		"count": len(composed),
	})
}
