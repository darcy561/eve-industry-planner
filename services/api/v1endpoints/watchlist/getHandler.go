package watchlist

import (
	"context"
	"errors"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// GetHandler handles GET /api/v1/user/watchlist.
func (h *Handlers) GetHandler(w http.ResponseWriter, r *http.Request) {
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

	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodGet)
	if !ok {
		return
	}
	raw, err := h.Mongo.WatchlistDeprecated.LoadWatchlistDeprecated(ctx, accountID)
	if err != nil {
		if errors.Is(err, mongodriver.ErrNoDocuments) {
			resp := map[string]any{
				"groups": []any{},
				"items":  []any{},
			}
			if err := helper.EncodeJSON(w, resp); err != nil {
				metrics.Error("encode_error")
				helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode empty watchlist response", "watchlist_encode_failed", "watchlist_get", err, nil)
				return
			}
			metrics.Success()
			logs.AttachDebugStep(r, "mongo_query_completed", map[string]interface{}{
				"has_document": false,
			})
			logs.AttachHandlerSuccessDetail(r, "watchlist document empty", map[string]interface{}{
				"duration_ms": time.Since(start).Milliseconds(),
			})
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve watchlist", "failed to query watchlist deprecated", "watchlist_query_failed", "watchlist_get", err, nil)
		return
	}

	groups, items := coalesceGroupsItemsFromDoc(raw)
	logs.AttachDebugStep(r, "mongo_query_completed", map[string]interface{}{
		"has_document": true,
	})
	resp := map[string]any{
		"groups": groups,
		"items":  items,
	}
	if err := helper.EncodeJSON(w, resp); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode watchlist response", "watchlist_encode_failed", "watchlist_get", err, nil)
		return
	}

	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "watchlist document retrieved", map[string]interface{}{
		"duration_ms": time.Since(start).Milliseconds(),
	})
}

func coalesceGroupsItemsFromDoc(raw bson.M) (any, any) {
	var groups any = []any{}
	var items any = []any{}
	if g, ok := raw["groups"]; ok {
		groups = g
	}
	if it, ok := raw["items"]; ok {
		items = it
	}
	return groups, items
}
