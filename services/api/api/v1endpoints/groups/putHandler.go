package groups

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/api/helper"
	"eve-industry-planner/api/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// PutGroupsHandler handles PUT /v1/groups (batch group upsert)
func PutGroupsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	m := metrics.GetAPIGroups()

	// Extract accountID from JWT token
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc()
		logs.WarnCtx(r.Context(), "failed to extract accountID", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var reqBody struct {
		Groups []models.Group `json:"groups"`
	}

	if err := helper.DecodeJSONRequest(r, &reqBody, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc()
		logs.WarnCtx(r.Context(), "failed to decode batch groups JSON", "error", err, "ip", r.RemoteAddr)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if len(reqBody.Groups) == 0 {
		m.Errors.WithLabelValues("no_groups").Inc()
		logs.WarnCtx(r.Context(), "no groups provided in batch request", "ip", r.RemoteAddr)
		http.Error(w, "No groups provided", http.StatusBadRequest)
		return
	}

	// Limit batch size to prevent abuse
	const maxBatchSize = 100
	if len(reqBody.Groups) > maxBatchSize {
		m.Errors.WithLabelValues("batch_too_large").Inc()
		logs.WarnCtx(r.Context(), "batch too large", "count", len(reqBody.Groups), "max", maxBatchSize, "ip", r.RemoteAddr)
		http.Error(w, fmt.Sprintf("Batch too large (max %d groups)", maxBatchSize), http.StatusBadRequest)
		return
	}

	// Save to MongoDB using bulk write
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionGroups)

	now := time.Now()
	var bulkOps []mongo.WriteModel
	savedCount := 0
	failedCount := 0

	// Extract clientID from X-Client-ID header (optional)
	clientID := r.Header.Get("X-Client-ID")

	for _, group := range reqBody.Groups {
		if group.GroupID == "" {
			logs.WarnCtx(ctx, "skipping group with empty groupID", "account_id", accountID)
			failedCount++
			continue
		}
		// Update metadata fields on the struct before converting to BSON
		group.MetaData.LastUpdated = now
		group.MetaData.LastUpdatedBy = accountID
		if clientID != "" {
			group.MetaData.ClientID = clientID
		}
		// Set CreatedAt if it's zero (new document)
		if group.MetaData.CreatedAt.IsZero() {
			group.MetaData.CreatedAt = now
		}
		// Ensure accountID is set
		group.AccountID = accountID

		bulkOps = append(bulkOps, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": group.GroupID, "accountID": accountID}).
			SetUpdate(bson.M{"$set": group}).
			SetUpsert(true))
	}

	if len(bulkOps) == 0 {
		m.Errors.WithLabelValues("no_valid_groups").Inc()
		logs.WarnCtx(r.Context(), "no valid groups in batch", "ip", r.RemoteAddr)
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
		m.Errors.WithLabelValues("database_error").Inc()
		logs.ErrorCtx(ctx, "failed to bulk upsert groups", "error", err, "account_id", accountID)
		http.Error(w, "Failed to save groups", http.StatusInternalServerError)
		return
	}

	savedCount = int(result.UpsertedCount + result.ModifiedCount)

	m.Successes.Inc()
	m.GroupsSaved.Add(float64(savedCount))
	m.GroupsRequested.Observe(float64(len(reqBody.Groups)))

	logs.InfoCtx(r.Context(), "batch groups upserted",
		"account_id", accountID,
		"total", len(reqBody.Groups),
		"saved", savedCount,
		"failed", failedCount,
		"duration_ms", time.Since(start).Milliseconds())

	// Return success status with no data
	w.WriteHeader(http.StatusNoContent)
}
