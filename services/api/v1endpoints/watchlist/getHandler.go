package watchlist

import (
	"context"
	"errors"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// GetHandler handles GET /api/v1/user/watchlist.
func GetHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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

	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		metrics.Error("auth_error")
		logs.WarnCtx(ctx, "failed to extract accountID")
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUserWatchlistDeprecated)

	raw, err := mongoget.LoadWatchlistDeprecated(ctx, collection, accountID)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			resp := map[string]any{
				"groups": []any{},
				"items":  []any{},
			}
			if err := helper.EncodeJSON(w, resp); err != nil {
				metrics.Error("encode_error")
				logs.ErrorCtx(ctx, "failed to encode empty watchlist response", "error", err, "account_id", accountID)
				logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
				return
			}
			metrics.Success()
			return
		}
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "failed to query watchlist deprecated", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve watchlist", err)
		return
	}

	groups, items := coalesceGroupsItemsFromDoc(raw)
	resp := map[string]any{
		"groups": groups,
		"items":  items,
	}
	if err := helper.EncodeJSON(w, resp); err != nil {
		metrics.Error("encode_error")
		logs.ErrorCtx(ctx, "failed to encode watchlist response", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	metrics.Success()
	logs.InfoCtx(ctx, "watchlist document retrieved",
		"account_id", accountID,
		"duration_ms", time.Since(start).Milliseconds())
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
