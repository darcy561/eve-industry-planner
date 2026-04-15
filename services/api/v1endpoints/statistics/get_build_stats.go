package statistics

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// GetBuildStatsHandler serves GET /api/v1/statistics/build-stats?typeID=<int>.
// Returns one Mongo build_stats row for the JWT account and item type (same aggregate shape as legacy
// Firestore BuildStats documents). When no row exists, returns 200 with a zeroed aggregate for that typeID.
func GetBuildStatsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if clients == nil || clients.Mongo == nil {
		logs.ErrorCtx(ctx, "build stats get: mongo client missing")
		logs.RespondHTTPError(w, r, http.StatusServiceUnavailable, "Service unavailable", errors.New("mongo client missing"))
		return
	}

	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		logs.WarnCtx(ctx, "build stats get: auth failed", "error", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	typeIDStr := r.URL.Query().Get("typeID")
	if typeIDStr == "" {
		http.Error(w, "missing required query parameter typeID", http.StatusBadRequest)
		return
	}
	typeID64, err := strconv.ParseInt(typeIDStr, 10, 32)
	if err != nil || typeID64 < 0 {
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
			logs.ErrorCtx(ctx, "build stats get: query failed", "error", err, "account_id", accountID, "type_id", typeID)
			logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve build statistics", err)
			return
		}
		row = models.EmptyBuildStatsRow(typeID)
	} else if row.DataSnapshots == nil {
		row.DataSnapshots = []models.BuildStatSnapshot{}
	}

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, row); err != nil {
		logs.ErrorCtx(ctx, "build stats get: encode failed", "error", err)
	}
}
