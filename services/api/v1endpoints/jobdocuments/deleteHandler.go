package jobdocuments

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/documentlock"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// DeleteJobDocumentsHandler handles DELETE /api/v1/job-documents with { jobIDs: [] }.
func (h *Handlers) DeleteJobDocumentsHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIJobs()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID := helper.AuthenticatedAccountID(r)

	var reqBody struct {
		JobIDs []string `json:"jobIDs"`
	}
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &reqBody) {
		return
	}

	if len(reqBody.JobIDs) == 0 {
		metrics.Error("no_job_ids")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No job IDs provided", "no job IDs provided for delete", "job_docs_delete_no_ids", "job_documents", nil, nil)
		return
	}

	const maxBatchSize = 200
	if len(reqBody.JobIDs) > maxBatchSize {
		metrics.Error("batch_too_large")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Batch too large (max %d job IDs)", maxBatchSize), "job documents delete batch too large", "job_docs_delete_batch_too_large", "job_documents", nil, map[string]any{
			"count": len(reqBody.JobIDs),
			"max":   maxBatchSize,
		})
		return
	}

	logs.AttachDebugStep(r, "batch_validated", map[string]any{
		"batch_size": len(reqBody.JobIDs),
	})

	filter := bson.M{
		"_meta.accountID": accountID,
		"_id":             bson.M{"$in": reqBody.JobIDs},
	}

	now := time.Now().UTC()
	sessionID := helper.AuthenticatedSessionID(r)
	wsClientID := helper.ExtractWSClientID(r)

	if h.locks.Redis != nil {
		if sessionID == "" {
			metrics.Error("auth_error")
			helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "job documents delete lock gate: missing session", "job_docs_delete_missing_session", "job_documents", nil, nil)
			return
		}
		jobGroupBypass := documentlock.JobGroupBypass{}
		if h.Mongo != nil {
			type jobGroupRow struct {
				ID              string `bson:"_id"`
				GroupID         string `bson:"groupID"`
				IncludedInGroup bool   `bson:"includedInGroup"`
			}
			collection := h.Mongo.JobDocuments.Collection()
			cur, findErr := collection.Find(ctx, bson.M{
				"_meta.accountID": accountID,
				"_id":             bson.M{"$in": reqBody.JobIDs},
			}, options.Find().SetProjection(bson.M{"groupID": 1, "includedInGroup": 1}))
			if findErr != nil {
				metrics.Error("lock_error")
				helper.RespondEndpointServerError(w, r, "Failed to verify document lock", "job documents delete lock gate: group lookup failed", "job_docs_lock_gate_group_lookup_failed", "job_documents", findErr, nil)
				return
			}
			for cur.Next(ctx) {
				var row jobGroupRow
				if err := cur.Decode(&row); err != nil {
					_ = cur.Close(ctx)
					metrics.Error("lock_error")
					helper.RespondEndpointServerError(w, r, "Failed to verify document lock", "job documents delete lock gate: group decode failed", "job_docs_lock_gate_group_decode_failed", "job_documents", err, nil)
					return
				}
				if row.IncludedInGroup && row.GroupID != "" {
					jobGroupBypass[row.ID] = row.GroupID
				}
			}
			if err := cur.Close(ctx); err != nil {
				metrics.Error("lock_error")
				helper.RespondEndpointServerError(w, r, "Failed to verify document lock", "job documents delete lock gate: group cursor close failed", "job_docs_lock_gate_group_cursor_failed", "job_documents", err, nil)
				return
			}
		}
		rejects, lerr := documentlock.CollectLockHeldElsewhereRejects(ctx, h.locks.Redis, accountID, sessionID, eipmongo.CollectionUserJobDocuments, reqBody.JobIDs, jobGroupBypass)
		if lerr != nil {
			if errors.Is(lerr, documentlock.ErrSessionRequiredForLockGate) {
				metrics.Error("auth_error")
				helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "job documents delete lock gate: session required", "job_docs_delete_session_required", "job_documents", lerr, nil)
				return
			}
			metrics.Error("lock_error")
			helper.RespondEndpointServerError(w, r, "Failed to verify document lock", "job documents delete lock gate failed", "job_docs_lock_gate_failed", "job_documents", lerr, nil)
			return
		}
		if len(rejects) > 0 {
			metrics.Error("lock_conflict")
			helper.RespondLockHeldElsewhereJSON(w, r, eipmongo.CollectionUserJobDocuments, rejects)
			return
		}
		logs.AttachDebugStep(r, "lock_gate_passed", map[string]any{
			"doc_count": len(reqBody.JobIDs),
		})
	}

	deletedCount, err := h.Mongo.JobDocuments.DeleteManyAfterStampingMeta(ctx, filter, now, sessionID, wsClientID,
		eipmongo.WithOpName(fmt.Sprintf("delete %d job documents", len(reqBody.JobIDs))))

	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to delete jobs", "failed to delete job documents", "job_docs_delete_failed", "job_documents", err, nil)
		return
	}

	logs.AttachDebugStep(r, "mongo_write_completed", map[string]any{
		"deleted": deletedCount,
	})

	w.WriteHeader(http.StatusNoContent)
	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "job documents deleted", map[string]any{
		"requested":   len(reqBody.JobIDs),
		"deleted":     deletedCount,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
