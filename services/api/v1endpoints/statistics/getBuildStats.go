package statistics

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// GetBuildStatsHandler serves GET /api/v1/statistics/build-stats?typeID=<int>.
// Returns one account_production_totals row for the authenticated account and item type. The account is
// resolved by the auth middleware from the session cookie, never read from the request.
// When no row exists, returns 200 with a zeroed aggregate for that typeID.
func (h *Handlers) GetBuildStatsHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	m := apimetrics.GetAPIStatistics()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	if !helper.RequireMethod(w, r, http.MethodGet) {
		metrics.Error("method_not_allowed")
		return
	}
	accountID := helper.AuthenticatedAccountID(r)

	if h.Mongo == nil {
		metrics.Error("mongo_client_missing")
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Service unavailable", "build stats get: mongo client missing", "build_stats_mongo_unavailable", "build_stats", errors.New("mongo client missing"), nil)
		return
	}

	typeIDStr := r.URL.Query().Get("typeID")
	if typeIDStr == "" {
		metrics.Error("missing_type_id")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "missing required query parameter typeID", "build stats get: missing typeID", "build_stats_missing_type_id", "build_stats", nil, nil)
		return
	}
	typeID64, err := strconv.ParseInt(typeIDStr, 10, 32)
	if err != nil || typeID64 < 0 {
		metrics.Error("invalid_type_id")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "invalid typeID", "build stats get: invalid typeID", "build_stats_invalid_type_id", "build_stats", err, map[string]any{"type_id": typeIDStr})
		return
	}
	typeID := int(typeID64)

	logs.AttachDebugStep(r, "type_id_resolved", map[string]any{
		"type_id": typeID,
	})

	statsID := eipmongo.AccountProductionTotalsDocumentID(accountID, typeID)
	coll := h.Mongo.AccountProductionTotals.Collection()

	var row models.BuildStatsRow
	foundInDB := true
	err = eipmongo.Retry(ctx, fmt.Sprintf("get account_production_totals %s", statsID), func() error {
		return coll.FindOne(ctx, bson.M{"_id": statsID}).Decode(&row)
	})
	if err != nil {
		if !errors.Is(err, mongodriver.ErrNoDocuments) {
			metrics.Error("database_error")
			helper.RespondEndpointServerError(w, r, "Failed to retrieve build statistics", "build stats get: query failed", "build_stats_query_failed", "build_stats", err, map[string]any{"type_id": typeID})
			return
		}
		foundInDB = false
		row = models.EmptyBuildStatsRow(typeID)
	} else if row.DataSnapshots == nil {
		row.DataSnapshots = []models.BuildStatSnapshot{}
	}

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, row); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "build stats get: encode failed", "build_stats_encode_failed", "build_stats", err, nil)
		return
	}
	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "build stats retrieved", map[string]any{
		"type_id": typeID,
		"found":   foundInDB,
	})
}
