package watchlist

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// PutHandler handles PUT /api/v1/user/watchlist.
func PutHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveTokenLogin()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	if !helper.RequireMethod(w, r, http.MethodPut) {
		metrics.Error("method_not_allowed")
		return
	}
	accountID := helper.AuthenticatedAccountID(r)
	mongo := clients.Mongo

	var body struct {
		Groups any `json:"groups"`
		Items  any `json:"items"`
	}
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &body) {
		return
	}

	groups, err := asJSONArray("groups", body.Groups)
	if err != nil {
		metrics.Error("invalid_json")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, err.Error(), "invalid watchlist groups", "watchlist_invalid_groups", "watchlist_put", err, nil)
		return
	}
	items, err := asJSONArray("items", body.Items)
	if err != nil {
		metrics.Error("invalid_json")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, err.Error(), "invalid watchlist items", "watchlist_invalid_items", "watchlist_put", err, nil)
		return
	}

	now := time.Now().UTC()
	sessionID := helper.AuthenticatedSessionID(r)
	wsClientID := helper.ExtractWSClientID(r)

	result, err := mongo.WatchlistDeprecated.UpsertWatchlistDeprecated(ctx, accountID, groups, items, now, sessionID, wsClientID)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to save watchlist", "failed to upsert watchlist deprecated", "watchlist_upsert_failed", "watchlist_put", err, nil)
		return
	}

	logs.AttachDebugStep(r, "mongo_upsert_completed", map[string]interface{}{
		"matched":  result.MatchedCount,
		"upserted": result.UpsertedCount,
	})

	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "watchlist document saved", map[string]interface{}{
		"matched":     result.MatchedCount,
		"upserted":    result.UpsertedCount,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}

func asJSONArray(fieldName string, v any) (any, error) {
	if v == nil {
		return bson.A{}, nil
	}
	switch x := v.(type) {
	case []any:
		return x, nil
	case bson.A:
		return x, nil
	default:
		return nil, fmt.Errorf("%s must be a JSON array", fieldName)
	}
}
