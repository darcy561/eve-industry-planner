package statistics

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/archivestats"
	"eve-industry-planner/shared/core/authzhmac"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
)

// GetBuildStatsRollupHandler serves GET /api/v1/statistics/build-stats/rollup (personal, from user_build_stats_buckets).
//
// Query:
//   - typeID (optional): restrict to one blueprint/item type; omit for all types on the account.
//   - Period (one mode): years=2023,2024 OR fromYear,fromMonth,toYear,toMonth OR year&month OR year alone.
//
// Rows are rebuilt by ProcessDirtyAccountBuildStats from user_archived_job_stats.
func GetBuildStatsRollupHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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
		return
	}
	if clients == nil || clients.Mongo == nil {
		metrics.Error("mongo_client_missing")
		logs.RespondHTTPError(w, r, http.StatusServiceUnavailable, "Service unavailable", errors.New("mongo client missing"))
		return
	}

	window, err := parseRollupWindow(r)
	if err != nil {
		metrics.Error("invalid_period")
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	monthPairs, err := archivestats.MonthsInRollupPeriod(window.meta)
	if err != nil {
		metrics.Error("invalid_period_meta")
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	typeID, err := parseOptionalTypeID(r.URL.Query().Get("typeID"))
	if err != nil {
		metrics.Error("invalid_type_id")
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	andParts := bson.A{
		bson.M{"accountID": accountID},
		rollupBSONMonthOr(monthPairs),
	}
	if typeID != nil {
		andParts = append(andParts, bson.M{"typeID": *typeID})
	}
	filter := bson.M{"$and": andParts}

	db := clients.Mongo.Database(mongocore.DatabaseName)
	coll := db.Collection(mongocore.CollectionUserBuildStatsBuckets)
	var rows []models.UserRollupMonthlyBucket
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = "get build stats rollup personal (buckets)"
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		cur, e := coll.Find(ctx, filter)
		if e != nil {
			return e
		}
		defer cur.Close(ctx)
		return cur.All(ctx, &rows)
	}); err != nil {
		metrics.Error("database_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve build statistics rollup", err)
		return
	}

	totals, byType := mergeUserRollupBuckets(rows, typeID)
	resp := models.BuildStatsRollupResponse{
		Period: window.meta,
		Totals: totals,
	}
	if typeID != nil {
		resp.TypeID = typeID
	} else {
		resp.ByType = byType
	}

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, resp); err != nil {
		metrics.Error("encode_error")
		return
	}
	metrics.Success()
}

// GetCorpBuildStatsRollupHandler serves GET /api/v1/statistics/corp-build-stats/rollup (corp_rollup_buckets).
//
// Query:
//   - corporation_id (required)
//   - typeID (optional)
//   - Same period parameters as personal rollup.
//
// Rows are rebuilt by ProcessDirtyCorpBuildStats from corp_archived_job_stats (same snapshot sweep as corp_build_stats).
func GetCorpBuildStatsRollupHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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
		return
	}
	if clients == nil || clients.Mongo == nil {
		metrics.Error("mongo_client_missing")
		logs.RespondHTTPError(w, r, http.StatusServiceUnavailable, "Service unavailable", errors.New("mongo client missing"))
		return
	}

	corpIDs, _, err := auth.ExtractSessionGrants(ctx, r, clients.Redis)
	if err != nil {
		metrics.Error("auth_error")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	corpIDStr := r.URL.Query().Get("corporation_id")
	if corpIDStr == "" {
		metrics.Error("missing_corporation_id")
		http.Error(w, "missing required query parameter corporation_id", http.StatusBadRequest)
		return
	}
	corpID, err := strconv.ParseInt(corpIDStr, 10, 64)
	if err != nil || corpID <= 0 {
		metrics.Error("invalid_corporation_id")
		http.Error(w, "invalid corporation_id", http.StatusBadRequest)
		return
	}
	if !corpInClaims(corpID, corpIDs) {
		metrics.Error("forbidden_corp")
		http.Error(w, "Forbidden corporation scope", http.StatusForbidden)
		return
	}

	window, err := parseRollupWindow(r)
	if err != nil {
		metrics.Error("invalid_period")
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	monthPairs, err := archivestats.MonthsInRollupPeriod(window.meta)
	if err != nil {
		metrics.Error("invalid_period_meta")
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	typeID, err := parseOptionalTypeID(r.URL.Query().Get("typeID"))
	if err != nil {
		metrics.Error("invalid_type_id")
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	h, err := authzhmac.NewFromEnv()
	if err != nil {
		metrics.Error("config_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to load corp reference config", err)
		return
	}
	corpRef, err := h.RefFromCorporationID(corpID)
	if err != nil {
		metrics.Error("invalid_corp_ref")
		http.Error(w, "Invalid corporation id", http.StatusBadRequest)
		return
	}

	andParts := bson.A{
		bson.M{"corpRef": corpRef},
		bson.M{"lane": bson.M{"$in": bson.A{models.CorpRollupOwnedLane, accountID}}},
		rollupBSONMonthOr(monthPairs),
	}
	if typeID != nil {
		andParts = append(andParts, bson.M{"typeID": *typeID})
	}
	filter := bson.M{"$and": andParts}

	db := clients.Mongo.Database(mongocore.DatabaseName)
	coll := db.Collection(mongocore.CollectionCorpRollupBuckets)
	var rows []models.CorpRollupMonthlyBucket
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("get corp build stats rollup buckets corp_id=%d", corpID)
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		cur, e := coll.Find(ctx, filter)
		if e != nil {
			return e
		}
		defer cur.Close(ctx)
		return cur.All(ctx, &rows)
	}); err != nil {
		metrics.Error("database_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve corporation build statistics rollup", err)
		return
	}

	totals, byType := mergeCorpRollupBuckets(rows, typeID)
	resp := models.BuildStatsRollupResponse{
		Period: window.meta,
		Totals: totals,
	}
	if typeID != nil {
		resp.TypeID = typeID
	} else {
		resp.ByType = byType
	}

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, resp); err != nil {
		metrics.Error("encode_error")
		return
	}
	metrics.Success()
}
