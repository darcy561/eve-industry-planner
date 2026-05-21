package watchlist

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoput "eve-industry-planner/shared/core/mongo/put"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
)

// PutHandler handles PUT /api/v1/user/watchlist.
func PutHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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

	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodPut)
	if !ok {
		return
	}

	var body struct {
		Groups any `json:"groups"`
		Items  any `json:"items"`
	}
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &body) {
		logs.WarnCtx(ctx, "failed to decode watchlist JSON", "account_id", accountID)
		return
	}

	groups, err := asJSONArray("groups", body.Groups)
	if err != nil {
		metrics.Error("invalid_json")
		logs.WarnCtx(ctx, "invalid watchlist groups", "error", err, "account_id", accountID)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	items, err := asJSONArray("items", body.Items)
	if err != nil {
		metrics.Error("invalid_json")
		logs.WarnCtx(ctx, "invalid watchlist items", "error", err, "account_id", accountID)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	sessionID, _ := auth.ExtractSessionID(r)
	wsClientID := helper.ExtractWSClientID(r)

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUserWatchlistDeprecated)

	result, err := mongoput.UpsertWatchlistDeprecated(ctx, collection, accountID, groups, items, now, sessionID, wsClientID)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to save watchlist", "failed to upsert watchlist deprecated", "watchlist_upsert_failed", "watchlist_put", err, map[string]interface{}{"account_id": accountID})
		return
	}

	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	logs.InfoCtx(ctx, "watchlist document saved",
		"account_id", accountID,
		"matched", result.MatchedCount,
		"upserted", result.UpsertedCount,
		"duration_ms", time.Since(start).Milliseconds())
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
