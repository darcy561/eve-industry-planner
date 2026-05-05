package groups

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/api/v1endpoints/documentlocks"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// DeleteGroupsHandler handles DELETE /v1/groups - delete specific groups by IDs for the authenticated user
func DeleteGroupsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIGroups()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	// Only allow DELETE requests
	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodDelete)
	if !ok {
		return
	}

	// Parse request body to get groupIDs (required)
	var reqBody struct {
		GroupIDs []string `json:"groupIDs"`
	}

	// Decode request body - groupIDs are required
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &reqBody) {
		logs.WarnCtx(ctx, "failed to decode delete groups JSON", "account_id", accountID)
		return
	}

	// Validate that at least one groupID is provided
	if len(reqBody.GroupIDs) == 0 {
		metrics.Error("no_group_ids")
		logs.WarnCtx(ctx, "no group IDs provided for deletion")
		http.Error(w, "At least one group ID is required", http.StatusBadRequest)
		return
	}

	const maxBatchSize = 200
	if len(reqBody.GroupIDs) > maxBatchSize {
		metrics.Error("batch_too_large")
		logs.WarnCtx(ctx, "batch too large for group delete", "count", len(reqBody.GroupIDs), "max", maxBatchSize)
		http.Error(w, fmt.Sprintf("Batch too large (max %d group IDs)", maxBatchSize), http.StatusBadRequest)
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUserJobGroups)

	// Build filter: must match account AND be in the provided groupIDs list
	filter := bson.M{
		"_meta.accountID": accountID,
		"_id":             bson.M{"$in": reqBody.GroupIDs},
	}

	findRetry := mongocore.DefaultRetryConfig()
	findRetry.OperationName = fmt.Sprintf("resolve groups for delete account %s", accountID)

	var resolvedIDs []string
	findErr := mongocore.RetryMongoOperation(ctx, findRetry, func() error {
		cur, err := collection.Find(ctx, filter, options.Find().SetProjection(bson.M{"_id": 1}))
		if err != nil {
			return err
		}
		defer cur.Close(ctx)
		for cur.Next(ctx) {
			var doc struct {
				ID string `bson:"_id"`
			}
			if err := cur.Decode(&doc); err != nil {
				return err
			}
			if doc.ID != "" {
				resolvedIDs = append(resolvedIDs, doc.ID)
			}
		}
		return cur.Err()
	})
	if findErr != nil {
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "failed to resolve groups before delete", "error", findErr, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to delete groups", findErr)
		return
	}

	if len(resolvedIDs) == 0 {
		w.WriteHeader(http.StatusNoContent)
		metrics.Success()
		m.GroupsDeleted.Add(ctx, 0)
		m.GroupsRequested.Observe(ctx, float64(len(reqBody.GroupIDs)))
		logs.InfoCtx(ctx, "groups delete: nothing matched filter", "account_id", accountID, "requested_count", len(reqBody.GroupIDs), "duration_ms", time.Since(start).Milliseconds())
		return
	}

	sessionID, serr := auth.ExtractSessionID(r)
	if serr != nil {
		metrics.Error("auth_error")
		logs.WarnCtx(ctx, "missing session_id claim for group delete lock check", "error", serr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if clients.Redis != nil {
		for _, gid := range resolvedIDs {
			blocked, lerr := documentlocks.LockHeldByOther(ctx, clients.Redis, accountID, mongocore.CollectionUserJobGroups, gid, sessionID)
			if lerr != nil {
				metrics.Error("lock_error")
				logs.ErrorCtx(ctx, "failed to check group doc lock before delete", "error", lerr, "account_id", accountID, "group_id", gid)
				logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to verify document lock", lerr)
				return
			}
			if blocked {
				metrics.Error("lock_conflict")
				logs.WarnCtx(ctx, "group delete blocked: locked by another session", "account_id", accountID, "group_id", gid)
				http.Error(w, "Cannot delete group: another session holds the edit lock", http.StatusConflict)
				return
			}
		}
	}

	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("delete %d groups for account %s", len(resolvedIDs), accountID)

	var result *mongo.DeleteResult
	if err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		result, err = collection.DeleteMany(ctx, filter)
		return err
	}); err != nil {
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "failed to delete groups", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to delete groups", err)
		return
	}

	deletedCount := int(result.DeletedCount)

	if clients.Redis != nil {
		for _, gid := range resolvedIDs {
			_ = documentlocks.DeleteDocLock(ctx, clients.Redis, accountID, mongocore.CollectionUserJobGroups, gid)
		}
	}

	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	m.GroupsDeleted.Add(ctx, float64(deletedCount))
	m.GroupsRequested.Observe(ctx, float64(len(reqBody.GroupIDs)))
	logs.InfoCtx(ctx, "groups deleted", "account_id", accountID, "requested_count", len(reqBody.GroupIDs), "deleted_count", deletedCount, "duration_ms", time.Since(start).Milliseconds())
}
