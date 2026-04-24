package groups

import (
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// PutGroupsHandler handles PUT /v1/groups (batch group upsert)
func PutGroupsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIGroups()

	// Extract accountID from JWT token
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		logs.WarnCtx(ctx, "failed to extract accountID", "error", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var reqBody struct {
		Groups []models.Group `json:"groups"`
	}

	if err := helper.DecodeJSONRequest(r, &reqBody, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc(ctx)
		logs.WarnCtx(ctx, "failed to decode batch groups JSON", "error", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if len(reqBody.Groups) == 0 {
		m.Errors.WithLabelValues("no_groups").Inc(ctx)
		logs.WarnCtx(ctx, "no groups provided in batch request")
		http.Error(w, "No groups provided", http.StatusBadRequest)
		return
	}

	// Limit batch size to prevent abuse
	const maxBatchSize = 100
	if len(reqBody.Groups) > maxBatchSize {
		m.Errors.WithLabelValues("batch_too_large").Inc(ctx)
		logs.WarnCtx(ctx, "batch too large", "count", len(reqBody.Groups), "max", maxBatchSize)
		http.Error(w, fmt.Sprintf("Batch too large (max %d groups)", maxBatchSize), http.StatusBadRequest)
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUserJobGroups)

	wsClientID := helper.ExtractWSClientID(r)
	sessionID, _ := auth.ExtractSessionID(r)

	now := time.Now()
	var bulkOps []mongo.WriteModel
	savedCount := 0
	failedCount := 0

	for _, group := range reqBody.Groups {
		if group.GroupID == "" {
			logs.WarnCtx(ctx, "skipping group with empty groupID", "account_id", accountID)
			failedCount++
			continue
		}
		// Update metadata fields on the struct before converting to BSON
		group.MetaData.LastModified = now
		group.MetaData.LastUpdatedBy = accountID
		group.MetaData.AccountID = accountID
		if sessionID != "" {
			group.MetaData.SessionID = sessionID
		}
		// Set CreatedAt if it's zero (new document)
		if group.MetaData.CreatedAt.IsZero() {
			group.MetaData.CreatedAt = now
		}
		// Ensure accountID is set
		group.AccountID = accountID
		if wsClientID != "" {
			group.MetaData.ClientID = wsClientID
		}

		bulkOps = append(bulkOps, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": group.GroupID, "_meta.accountID": accountID}).
			SetUpdate(bson.M{"$set": group}).
			SetUpsert(true))
	}

	if len(bulkOps) == 0 {
		m.Errors.WithLabelValues("no_valid_groups").Inc(ctx)
		logs.WarnCtx(ctx, "no valid groups in batch")
		http.Error(w, "No valid groups to save", http.StatusBadRequest)
		return
	}

	// Execute bulk write with retry
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("bulk upsert %d groups", len(bulkOps))

	var result *mongo.BulkWriteResult
	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		result, err = collection.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
		return err
	})
	if err != nil {
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to bulk upsert groups", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to save groups", err)
		return
	}

	savedCount = int(result.UpsertedCount + result.ModifiedCount)

	w.WriteHeader(http.StatusNoContent)

	m.Successes.Inc(ctx)
	m.GroupsSaved.Add(ctx, float64(savedCount))
	m.GroupsRequested.Observe(ctx, float64(len(reqBody.Groups)))

	logs.InfoCtx(ctx, "batch groups upserted",
		"account_id", accountID,
		"total", len(reqBody.Groups),
		"saved", savedCount,
		"failed", failedCount,
		"duration_ms", time.Since(start).Milliseconds())
}
