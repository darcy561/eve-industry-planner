package groups

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// GetGroupsHandler handles GET /v1/groups - retrieve all groups for the authenticated user
func GetGroupsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	m := metrics.GetAPIGroups()

	// Only allow GET requests
	if r.Method != http.MethodGet {
		m.Errors.WithLabelValues("method_not_allowed").Inc()
		logs.WarnCtx(r.Context(), "invalid method for getGroups endpoint", "method", r.Method, "ip", r.RemoteAddr)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract accountID from JWT token
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc()
		logs.WarnCtx(r.Context(), "failed to extract accountID", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Query MongoDB for all groups belonging to this account
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

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
		m.Errors.WithLabelValues("database_error").Inc()
		logs.ErrorCtx(ctx, "failed to query groups", "error", err, "account_id", accountID, "ip", r.RemoteAddr)
		http.Error(w, "Failed to retrieve groups", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	// Decode all groups
	var groups []models.Group
	if err := cursor.All(ctx, &groups); err != nil {
		m.Errors.WithLabelValues("decode_error").Inc()
		logs.ErrorCtx(ctx, "failed to decode groups", "error", err, "account_id", accountID, "ip", r.RemoteAddr)
		http.Error(w, "Failed to process groups", http.StatusInternalServerError)
		return
	}

	m.Successes.Inc()
	m.GroupsRequested.Observe(float64(len(groups)))
	logs.InfoCtx(r.Context(), "user groups retrieved",
		"account_id", accountID,
		"group_count", len(groups),
		"duration_ms", time.Since(start).Milliseconds())

	// Encode response (nginx handles compression)
	if err := helper.EncodeJSON(w, groups); err != nil {
		logs.ErrorCtx(r.Context(), "failed to encode groups response", "error", err, "account_id", accountID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}
