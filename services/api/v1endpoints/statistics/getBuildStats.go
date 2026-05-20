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
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// GetBuildStatsHandler serves GET /api/v1/statistics/build-stats?typeID=<int>.
// Returns one Mongo user_build_stats row for the JWT account and item type (personal-only aggregates;
// corporation-attributed jobs are served under corp-build-stats). When no row exists, returns 200 with
// a zeroed aggregate for that typeID.
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
		logs.ErrorCtx(ctx, "build stats get: mongo client missing")
		logs.RespondHTTPError(w, r, http.StatusServiceUnavailable, "Service unavailable", errors.New("mongo client missing"))
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
	db := clients.Mongo.Database(mongocore.DatabaseName)
	collUser := db.Collection(mongocore.CollectionUserBuildStats)

	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("get user_build_stats %s", statsID)

	row := models.EmptyBuildStatsRow(typeID)
	var userRow models.BuildStatsRow
	errUser := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		return collUser.FindOne(ctx, bson.M{"_id": statsID}).Decode(&userRow)
	})
	if errUser != nil && errUser != mongo.ErrNoDocuments {
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "build stats get: query user_build_stats failed", "error", errUser, "account_id", accountID, "type_id", typeID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve build statistics", errUser)
		return
	}
	if errUser == nil {
		row = models.AddBuildStatsRows(row, userRow)
	}
	row.TypeID = typeID

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, row); err != nil {
		metrics.Error("encode_error")
		logs.ErrorCtx(ctx, "build stats get: encode failed", "error", err)
		return
	}
	metrics.Success()
}
