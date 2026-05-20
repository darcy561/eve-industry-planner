package statistics

import (
	"context"
	"errors"
	"net/http"
	"sort"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	authzhmac "eve-industry-planner/shared/core/crypto/authzhmac/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
)

func GetCorpBuildStatsTimelineHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	m := apimetrics.GetAPIStatistics()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	_, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodGet)
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
	corpID, typeID, err := parseCorpTypeQuery(r)
	if err != nil {
		metrics.Error("invalid_query")
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !corpInClaims(corpID, corpIDs) {
		metrics.Error("forbidden_corp")
		http.Error(w, "Forbidden corporation scope", http.StatusForbidden)
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

	coll := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionCorpBuildStatsBuckets)
	filter := bson.M{"corpRef": corpRef, "typeID": typeID}
	var out []models.CorpBuildStatsTimelineBucket
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = "get corp build stats timeline"
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		cur, e := coll.Find(ctx, filter)
		if e != nil {
			return e
		}
		defer cur.Close(ctx)
		return cur.All(ctx, &out)
	}); err != nil {
		metrics.Error("database_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve corporation build stats timeline", err)
		return
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Year == out[j].Year {
			return out[i].Month < out[j].Month
		}
		return out[i].Year < out[j].Year
	})
	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, out); err != nil {
		metrics.Error("encode_error")
		return
	}
	metrics.Success()
}
