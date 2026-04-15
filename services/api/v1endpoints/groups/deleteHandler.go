package groups

import (
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// DeleteGroupsHandler handles DELETE /v1/groups - delete specific groups by IDs for the authenticated user
func DeleteGroupsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIGroups()

	// Only allow DELETE requests
	if r.Method != http.MethodDelete {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		logs.WarnCtx(ctx, "invalid method for deleteGroups endpoint")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract accountID from JWT token
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		logs.WarnCtx(ctx, "failed to extract accountID", "error", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body to get groupIDs (required)
	var reqBody struct {
		GroupIDs []string `json:"groupIDs"`
	}

	// Decode request body - groupIDs are required
	if err := helper.DecodeJSONRequest(r, &reqBody, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc(ctx)
		logs.WarnCtx(ctx, "failed to decode delete groups JSON", "error", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate that at least one groupID is provided
	if len(reqBody.GroupIDs) == 0 {
		m.Errors.WithLabelValues("no_group_ids").Inc(ctx)
		logs.WarnCtx(ctx, "no group IDs provided for deletion")
		http.Error(w, "At least one group ID is required", http.StatusBadRequest)
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionGroups)

	// Build filter: must match accountID AND be in the provided groupIDs list
	filter := bson.M{
		"accountID": accountID,
		"_id":       bson.M{"$in": reqBody.GroupIDs},
	}

	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("delete %d groups for account %s", len(reqBody.GroupIDs), accountID)

	var result *mongo.DeleteResult
	if err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		result, err = collection.DeleteMany(ctx, filter)
		return err
	}); err != nil {
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to delete groups", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to delete groups", err)
		return
	}

	deletedCount := int(result.DeletedCount)

	w.WriteHeader(http.StatusNoContent)

	m.Successes.Inc(ctx)
	m.GroupsDeleted.Add(ctx, float64(deletedCount))
	m.GroupsRequested.Observe(ctx, float64(len(reqBody.GroupIDs)))
	logs.InfoCtx(ctx, "groups deleted", "account_id", accountID, "requested_count", len(reqBody.GroupIDs), "deleted_count", deletedCount, "duration_ms", time.Since(start).Milliseconds())
}
