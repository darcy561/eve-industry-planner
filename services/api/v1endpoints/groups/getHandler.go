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
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// GetGroupsHandler handles GET /v1/groups - retrieve all groups for the authenticated user
func GetGroupsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIGroups()

	// Only allow GET requests
	if r.Method != http.MethodGet {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		logs.WarnCtx(ctx, "invalid method for getGroups endpoint")
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

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionGroups)

	// Find all groups for this accountID with retry
	filter := bson.M{"accountID": accountID}
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("find groups for account %s", accountID)

	var cursor *mongo.Cursor
	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		cursor, err = collection.Find(ctx, filter)
		return err
	})
	if err != nil {
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to query groups", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve groups", err)
		return
	}
	defer cursor.Close(ctx)

	// Decode all groups
	var groups []models.Group
	if err := cursor.All(ctx, &groups); err != nil {
		m.Errors.WithLabelValues("decode_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to decode groups", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to process groups", err)
		return
	}

	if err := helper.EncodeJSON(w, groups); err != nil {
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to encode groups response", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	m.Successes.Inc(ctx)
	m.GroupsRequested.Observe(ctx, float64(len(groups)))
	logs.InfoCtx(ctx, "user groups retrieved",
		"account_id", accountID,
		"group_count", len(groups),
		"duration_ms", time.Since(start).Milliseconds())
}
