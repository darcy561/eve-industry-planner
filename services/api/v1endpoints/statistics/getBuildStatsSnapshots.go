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

func sortArchivedSnapshotsNewestFirst(docs []models.ArchivedJobStats) {
	sort.SliceStable(docs, func(i, j int) bool {
		return docs[i].ArchivedAt.After(docs[j].ArchivedAt)
	})
}

// GetBuildStatsSnapshotsHandler serves GET /api/v1/statistics/build-stats/snapshots?typeID=<int>&scope=personal|corp>.
// Personal scope returns user_archived_job_stats only. Corp scope requires corporation_id and JWT corp membership;
// returns corp_archived_job_stats rows for that opaque corp ref only (no merge with user snapshots).
func GetBuildStatsSnapshotsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = "get build stats snapshots"

	var out []models.ArchivedJobStats

	switch scope {
	case "personal":
		filter := bson.M{
			"accountID": accountID,
			"typeID":    typeID,
			"revoked":   bson.M{"$ne": true},
		}
		coll := db.Collection(mongocore.CollectionUserArchivedJobStats)
		if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
			cur, e := coll.Find(ctx, filter)
			if e != nil {
				return e
			}
			defer cur.Close(ctx)
			return cur.All(ctx, &out)
		}); err != nil {
			metrics.Error("database_error")
			logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve archived job snapshots", err)
			return
		}

	case "corp":
		claims, err := auth.ExtractInternalClaims(r)
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
		if !corpInClaims(corpID, claims.Corporations) {
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
			"typeID":  typeID,
			"revoked": bson.M{"$ne": true},
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
		if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
			cur, e := coll.Find(ctx, filter)
			if e != nil {
				return e
			}
			defer cur.Close(ctx)
			return cur.All(ctx, &out)
		}); err != nil {
			metrics.Error("database_error")
			logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve archived job snapshots", err)
			return
		}

	default:
		metrics.Error("invalid_scope")
		http.Error(w, "invalid scope (use personal or corp)", http.StatusBadRequest)
		return
	}

	sortArchivedSnapshotsNewestFirst(out)

	w.WriteHeader(http.StatusOK)
	type payload struct {
		Snapshots []models.ArchivedJobStats `json:"snapshots"`
	}
	if err := helper.EncodeJSON(w, payload{Snapshots: out}); err != nil {
		metrics.Error("encode_error")
		return
	}
	metrics.Success()
}
