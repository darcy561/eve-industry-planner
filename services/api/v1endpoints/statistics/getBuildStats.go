package statistics

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// GetBuildStatsHandler serves GET /api/v1/statistics/build-stats?typeID=<int>.
// Returns one Mongo build_stats row for the JWT account and item type (same aggregate shape as legacy
// Firestore BuildStats documents). When no row exists, returns 200 with a zeroed aggregate for that typeID.
func GetBuildStatsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	m := apimetrics.GetAPIStatistics()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()
	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodGet)
	if !ok {
		logs.WarnCtx(ctx, "build stats get: auth or method check failed")
		return
	}
	if clients == nil || clients.Mongo == nil {
		metrics.Error("mongo_client_missing")
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Service unavailable", "build stats get: mongo client missing", "build_stats_mongo_unavailable", "build_stats", errors.New("mongo client missing"), nil)
		return
	}

	typeIDStr := r.URL.Query().Get("typeID")
	if typeIDStr == "" {
		metrics.Error("missing_type_id")
		http.Error(w, "missing required query parameter typeID", http.StatusBadRequest)
		return
	}
	typeID64, err := strconv.ParseInt(typeIDStr, 10, 32)
	if err != nil || typeID64 < 0 {
		metrics.Error("invalid_type_id")
		http.Error(w, "invalid typeID", http.StatusBadRequest)
		return
	}
	typeID := int(typeID64)

	statsID := mongocore.BuildStatsDocumentID(accountID, typeID)
	coll := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionBuildStats)

	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("get build_stats %s", statsID)

	var row models.BuildStatsRow
	err = mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		return coll.FindOne(ctx, bson.M{"_id": statsID}).Decode(&row)
	})
	if err != nil {
		if err != mongo.ErrNoDocuments {
			metrics.Error("database_error")
			helper.RespondEndpointServerError(w, r, "Failed to retrieve build statistics", "build stats get: query failed", "build_stats_query_failed", "build_stats", err, map[string]interface{}{"account_id": accountID, "type_id": typeID})
			return
		}
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
}
