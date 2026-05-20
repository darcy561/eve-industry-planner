package statistics

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/core/authzhmac"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
)

func GetBuildStatsTimelineHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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

	scope := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("scope")))
	if scope == "" {
		scope = "personal"
	}

	db := clients.Mongo.Database(mongocore.DatabaseName)

	var docs []models.ArchivedJobStats
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = "get build stats timeline"

	var runFind func() error
	switch scope {
	case "personal":
		filter := bson.M{
			"accountID":         accountID,
			"typeID":            typeID,
			"revoked":           bson.M{"$ne": true},
			"isProductionChain": bson.M{"$ne": true},
		}
		coll := db.Collection(mongocore.CollectionUserArchivedJobStats)
		runFind = func() error {
			cur, e := coll.Find(ctx, filter)
			if e != nil {
				return e
			}
			defer cur.Close(ctx)
			return cur.All(ctx, &docs)
		}

	case "corp":
		corpIDs, _, err := auth.ExtractSessionGrants(ctx, r, clients.Redis)
		if err != nil {
			metrics.Error("auth_error")
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		corpIDStr := r.URL.Query().Get("corporation_id")
		if corpIDStr == "" {
			metrics.Error("missing_corporation_id")
			http.Error(w, "missing required query parameter corporation_id for scope=corp", http.StatusBadRequest)
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

		cid := int(corpID)
		filter := bson.M{
			"typeID":            typeID,
			"revoked":           bson.M{"$ne": true},
			"isProductionChain": bson.M{"$ne": true},
			"$or": []bson.M{
				{"corpRef": corpRef},
				{
					"accountID": accountID,
					"$or": []bson.M{
						{"transactionLines": bson.M{"$elemMatch": bson.M{"resolvedCorpID": cid}}},
						{"feeLines": bson.M{"$elemMatch": bson.M{"resolvedCorpID": cid}}},
						{"linkedIndustryCorpIDs": cid},
					},
				},
			},
		}
		coll := db.Collection(mongocore.CollectionCorpArchivedJobStats)
		runFind = func() error {
			cur, e := coll.Find(ctx, filter)
			if e != nil {
				return e
			}
			defer cur.Close(ctx)
			return cur.All(ctx, &docs)
		}

	default:
		metrics.Error("invalid_scope")
		http.Error(w, "invalid scope (use personal or corp)", http.StatusBadRequest)
		return
	}

	if err := mongocore.RetryMongoOperation(ctx, retryCfg, runFind); err != nil {
		metrics.Error("database_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve build statistics timeline", err)
		return
	}

	out := aggregateBuildStatsTimeline(docs)

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, out); err != nil {
		metrics.Error("encode_error")
		return
	}
	metrics.Success()
}

func aggregateBuildStatsTimeline(docs []models.ArchivedJobStats) []models.BuildStatsTimelineBucket {
	type key struct{ y, m int }
	buckets := map[key]*models.BuildStatsTimelineBucket{}
	for _, doc := range docs {
		for _, t := range doc.TransactionLines {
			k := key{y: t.Year, m: t.Month}
			b := buckets[k]
			if b == nil {
				b = &models.BuildStatsTimelineBucket{Year: t.Year, Month: t.Month}
				buckets[k] = b
			}
			b.TransactionCount++
			b.QuantitySold += t.Quantity
			b.SalesTotal += t.Amount
			b.TransactionFeeTotal += t.Tax
			b.ProfitLoss += t.Profit
		}
		for _, f := range doc.FeeLines {
			k := key{y: f.Year, m: f.Month}
			b := buckets[k]
			if b == nil {
				b = &models.BuildStatsTimelineBucket{Year: f.Year, Month: f.Month}
				buckets[k] = b
			}
			b.BrokersFeeTotal += f.Amount
			b.ProfitLoss -= f.Amount
		}
	}

	out := make([]models.BuildStatsTimelineBucket, 0, len(buckets))
	for _, v := range buckets {
		out = append(out, *v)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Year == out[j].Year {
			return out[i].Month < out[j].Month
		}
		return out[i].Year < out[j].Year
	})
	return out
}
