package archivedjobs

import (
	"context"
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

// PutArchivedJobsHandler handles PUT /v1/archived-jobs — batch upsert into Mongo archivedJobs.
//
// This route is registered on the private mux group (apiServer): global middleware → rate limit →
// [middleware.AuthConstructor] → Router → PutArchivedJobsHandler. Statuses below are what clients
// should expect; align with frontend saveArchivedJobs (retries only 408, 429, 5xx).
//
// Before this handler:
//   - 429 — rate limiter (private rate); safe to retry with backoff
//   - 401 — auth middleware: missing/invalid Bearer JWT (do not retry until token refresh)
//
// Router (archivedjobs.Router):
//   - 405 — method other than PUT
//   - 404 — path not handled by this router
//
// This handler:
//   - 400 — malformed JSON, empty batch, batch >100, empty jobID, duplicate jobIDs
//   - 401 — should not occur if auth middleware passed (ExtractAccountID failure)
//   - 403 — job has non-empty _meta.accountID ≠ JWT account_id (do not retry)
//   - 500 — Mongo bulk write failure (retry)
//   - 204 — success
//
// For each job, _meta.archivedBy is set to the JWT account_id (who submitted the request), in addition
// to _meta.archivedAt, accountID, lastModified, and lastUpdatedBy.
func PutArchivedJobsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	obsCtx := r.Context()
	start, ok := logs.RequestStartTime(obsCtx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIArchivedJobs()
	defer func() {
		duration := time.Since(start)
		m.Requests.Observe(obsCtx, apimetrics.DurationMilliseconds(duration))
		m.RequestsCount.Inc(obsCtx)
	}()

	ctx := obsCtx
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(obsCtx)
		logs.WarnCtx(ctx, "archived jobs put: auth failed", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	sessionID, _ := auth.ExtractSessionID(r)

	var reqBody struct {
		Jobs []models.Job `json:"jobs"`
	}
	if err := helper.DecodeJSONRequest(r, &reqBody, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc(obsCtx)
		logs.WarnCtx(ctx, "archived jobs put: bad JSON", "error", err, "account_id", accountID)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if len(reqBody.Jobs) == 0 {
		m.Errors.WithLabelValues("no_jobs").Inc(obsCtx)
		http.Error(w, "No jobs provided", http.StatusBadRequest)
		return
	}

	const maxBatchSize = 100
	if len(reqBody.Jobs) > maxBatchSize {
		m.Errors.WithLabelValues("batch_too_large").Inc(obsCtx)
		http.Error(w, fmt.Sprintf("Batch too large (max %d jobs)", maxBatchSize), http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	seenJobID := make(map[string]struct{}, len(reqBody.Jobs))
	for i := range reqBody.Jobs {
		job := &reqBody.Jobs[i]
		if job.JobID == "" {
			m.Errors.WithLabelValues("empty_job_id").Inc(obsCtx)
			logs.WarnCtx(ctx, "archived jobs put: batch rejected (empty jobID)", "index", i, "account_id", accountID)
			http.Error(w, fmt.Sprintf("Invalid job at index %d: jobID is required", i), http.StatusBadRequest)
			return
		}
		if _, dup := seenJobID[job.JobID]; dup {
			m.Errors.WithLabelValues("duplicate_job_id").Inc(obsCtx)
			logs.WarnCtx(ctx, "archived jobs put: batch rejected (duplicate jobID)", "index", i, "job_id", job.JobID, "account_id", accountID)
			http.Error(w, fmt.Sprintf("Invalid batch: duplicate jobID %q", job.JobID), http.StatusBadRequest)
			return
		}
		if job.MetaData.AccountID != "" && job.MetaData.AccountID != accountID {
			m.Errors.WithLabelValues("account_mismatch").Inc(obsCtx)
			logs.WarnCtx(ctx, "archived jobs put: _meta.accountID does not match token",
				"index", i, "job_id", job.JobID, "account_id", accountID, "job_meta_account_id", job.MetaData.AccountID)
			http.Error(w, fmt.Sprintf("Invalid job at index %d: _meta.accountID does not match the authenticated account", i), http.StatusForbidden)
			return
		}
		seenJobID[job.JobID] = struct{}{}
	}

	now := time.Now().UTC()
	bulkOps := make([]mongo.WriteModel, 0, len(reqBody.Jobs))
	for i := range reqBody.Jobs {
		job := &reqBody.Jobs[i]
		job.MetaData.AccountID = accountID
		if sessionID != "" {
			job.MetaData.SessionID = sessionID
		}
		job.MetaData.LastModified = now
		job.MetaData.LastUpdatedBy = accountID
		if job.MetaData.CreatedAt.IsZero() {
			job.MetaData.CreatedAt = now
		}
		job.MetaData.ArchivedAt = now
		job.MetaData.ArchivedBy = accountID

		bulkOps = append(bulkOps, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": job.JobID, "_meta.accountID": job.MetaData.AccountID}).
			SetUpdate(bson.M{"$set": job, "$unset": mongocore.ArchivedJobsUpsertUnset}).
			SetUpsert(true))
	}

	collection := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionArchivedJobs)
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("bulk upsert %d archived jobs", len(bulkOps))

	var result *mongo.BulkWriteResult
	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var e error
		result, e = collection.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
		return e
	})
	if err != nil {
		m.Errors.WithLabelValues("database_error").Inc(obsCtx)
		logs.ErrorCtx(ctx, "archived jobs put: bulk write", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to save archived jobs", err)
		return
	}

	savedCount := int(result.UpsertedCount + result.ModifiedCount)
	nJobs := len(reqBody.Jobs)
	if savedCount != nJobs {
		logs.WarnCtx(ctx, "archived jobs put: mongo write count differs from batch size",
			"account_id", accountID, "jobs", nJobs, "saved_ops", savedCount)
	}

	w.WriteHeader(http.StatusNoContent)
	m.Successes.Inc(obsCtx)
	m.JobsSaved.Add(obsCtx, float64(savedCount))
	m.IndividualJobsArchived.Add(obsCtx, float64(nJobs))
	m.JobsRequested.Observe(obsCtx, float64(nJobs))

	logs.InfoCtx(ctx, "archived jobs put done",
		"account_id", accountID,
		"jobs", len(reqBody.Jobs),
		"saved_ops", savedCount,
		"duration_ms", time.Since(start).Milliseconds(),
	)
}
