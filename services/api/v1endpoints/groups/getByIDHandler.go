package groups

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// GetGroupByIDHandler handles GET /v1/groups/{groupID} — one group for the authenticated account.
func GetGroupByIDHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients, groupID string) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIGroups()

	if r.Method != http.MethodGet {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	groupID = strings.TrimSpace(groupID)
	if groupID == "" {
		m.Errors.WithLabelValues("bad_request").Inc(ctx)
		http.Error(w, "group ID required", http.StatusBadRequest)
		return
	}

	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUserJobGroups)

	filter := bson.M{"_id": groupID, "_meta.accountID": accountID}
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("find group %s for account %s", groupID, accountID)

	var group models.Group
	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		return collection.FindOne(ctx, filter).Decode(&group)
	})
	if err != nil {
		if err == mongo.ErrNoDocuments {
			m.Errors.WithLabelValues("not_found").Inc(ctx)
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to load group by id", "error", err, "account_id", accountID, "group_id", groupID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve group", err)
		return
	}

	if err := helper.EncodeJSON(w, group); err != nil {
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	m.Successes.Inc(ctx)
	logs.InfoCtx(ctx, "single group retrieved",
		"account_id", accountID,
		"group_id", groupID,
		"duration_ms", time.Since(start).Milliseconds())
}
