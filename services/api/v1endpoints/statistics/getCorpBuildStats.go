package statistics

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/core/authzhmac"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func GetCorpBuildStatsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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

	docID := mongocore.CorpBuildStatsDocumentID(corpRef, typeID)
	coll := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionCorpBuildStats)
	var row models.CorpBuildStatsRow
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("get corp_build_stats %s", docID)
	err = mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		return coll.FindOne(ctx, bson.M{"_id": docID}).Decode(&row)
	})
	if err != nil {
		if err == mongo.ErrNoDocuments {
			row = models.CorpBuildStatsRow{CorpRef: corpRef, TypeID: typeID}
		} else {
			metrics.Error("database_error")
			logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve corporation build stats", err)
			return
		}
	}
	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, row); err != nil {
		metrics.Error("encode_error")
		return
	}
	metrics.Success()
}

func parseCorpTypeQuery(r *http.Request) (corpID int64, typeID int, err error) {
	corpIDStr := r.URL.Query().Get("corporation_id")
	typeIDStr := r.URL.Query().Get("typeID")
	if corpIDStr == "" || typeIDStr == "" {
		return 0, 0, fmt.Errorf("missing required query parameters corporation_id and typeID")
	}
	corpID, err = strconv.ParseInt(corpIDStr, 10, 64)
	if err != nil || corpID <= 0 {
		return 0, 0, fmt.Errorf("invalid corporation_id")
	}
	typeID64, err := strconv.ParseInt(typeIDStr, 10, 32)
	if err != nil || typeID64 < 0 {
		return 0, 0, fmt.Errorf("invalid typeID")
	}
	return corpID, int(typeID64), nil
}

func corpInClaims(corpID int64, corporations []int64) bool {
	for _, c := range corporations {
		if c == corpID {
			return true
		}
	}
	return false
}
