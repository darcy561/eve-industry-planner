package archivedjobs

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/authzhmac"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func markDirtyAccount(ctx context.Context, coll *mongo.Collection, accountID string, now time.Time) error {
	if accountID == "" {
		return nil
	}
	_, err := coll.UpdateOne(
		ctx,
		bson.M{"_id": accountID},
		bson.M{"$set": bson.M{"_id": accountID, "touchedAt": now}},
		options.Update().SetUpsert(true),
	)
	return err
}

func markDirtyCorpRefs(ctx context.Context, coll *mongo.Collection, refs []string, now time.Time) error {
	if len(refs) == 0 {
		return nil
	}
	writes := make([]mongo.WriteModel, 0, len(refs))
	for _, ref := range refs {
		if ref == "" {
			continue
		}
		writes = append(writes, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": ref}).
			SetUpdate(bson.M{"$set": bson.M{"_id": ref, "touchedAt": now}}).
			SetUpsert(true))
	}
	_, err := coll.BulkWrite(ctx, writes, options.BulkWrite().SetOrdered(false))
	return err
}

func corpRefsFromSnapshot(doc *models.ArchivedJobStats, h *authzhmac.Helper) []string {
	if doc == nil || h == nil {
		return nil
	}
	set := map[string]struct{}{}
	if doc.CorpRef != "" {
		set[doc.CorpRef] = struct{}{}
	}
	addCorpID := func(id int) {
		if id <= 0 {
			return
		}
		ref, err := h.RefFromCorporationID(int64(id))
		if err == nil && ref != "" {
			set[ref] = struct{}{}
		}
	}
	for _, t := range doc.TransactionLines {
		addCorpID(t.ResolvedCorpID)
	}
	for _, f := range doc.FeeLines {
		addCorpID(f.ResolvedCorpID)
	}
	for _, id := range doc.LinkedIndustryCorpIDs {
		addCorpID(id)
	}
	out := make([]string, 0, len(set))
	for ref := range set {
		out = append(out, ref)
	}
	sort.Strings(out)
	return out
}

// PostRestoreArchivedJobHandler restores one archived job back to live job documents,
// revokes its derived snapshot, and removes it from archivedJobs.
func PostRestoreArchivedJobHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	m := apimetrics.GetAPIArchivedJobs()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodPost)
	if !ok {
		return
	}
	jobID := r.URL.Query().Get("jobID")
	if jobID == "" {
		metrics.Error("missing_job_id")
		http.Error(w, "missing required query parameter jobID", http.StatusBadRequest)
		return
	}
	if clients == nil || clients.Mongo == nil {
		metrics.Error("mongo_client_missing")
		logs.RespondHTTPError(w, r, http.StatusServiceUnavailable, "Service unavailable", errors.New("mongo client missing"))
		return
	}

	db := clients.Mongo.Database(mongocore.DatabaseName)
	archivedColl := db.Collection(mongocore.CollectionArchivedJobs)
	liveColl := db.Collection(mongocore.CollectionUserJobDocuments)
	snapshotColl := db.Collection(mongocore.CollectionCorpArchivedJobStats)
	userSnapshotColl := db.Collection(mongocore.CollectionUserArchivedJobStats)
	dirtyAccountsColl := db.Collection(mongocore.CollectionUserBuildStatsDirtyAccounts)
	dirtyRefsColl := db.Collection(mongocore.CollectionCorpBuildStatsDirtyRefs)

	var archivedDoc models.Job
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("restore archived job %s", jobID)
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		return archivedColl.FindOne(ctx, bson.M{"_id": jobID, "_meta.accountID": accountID}).Decode(&archivedDoc)
	}); err != nil {
		metrics.Error("not_found")
		http.Error(w, "Archived job not found", http.StatusNotFound)
		return
	}

	now := time.Now().UTC()
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		archivedDoc.MetaData.LastModified = now
		archivedDoc.MetaData.LastUpdatedBy = accountID
		archivedDoc.MetaData.AccountID = accountID
		_, e := liveColl.UpdateOne(
			ctx,
			bson.M{"_id": archivedDoc.JobID, "_meta.accountID": accountID},
			bson.M{"$set": archivedDoc, "$unset": mongocore.UserJobDocumentsUpsertUnset},
			options.Update().SetUpsert(true),
		)
		return e
	}); err != nil {
		metrics.Error("database_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to restore live job document", err)
		return
	}

	snapshotID := mongocore.ArchivedJobStatsDocumentID(accountID, archivedDoc.JobID)
	var snapshotDoc models.ArchivedJobStats
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		return snapshotColl.FindOne(ctx, bson.M{"_id": snapshotID}).Decode(&snapshotDoc)
	}); err != nil {
		// Fallback to user snapshot; missing snapshot is acceptable.
		_ = mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
			return userSnapshotColl.FindOne(ctx, bson.M{"_id": snapshotID}).Decode(&snapshotDoc)
		})
	}
	h, _ := authzhmac.NewFromEnv()
	refs := corpRefsFromSnapshot(&snapshotDoc, h)

	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		_, e := snapshotColl.UpdateOne(
			ctx,
			bson.M{"_id": snapshotID},
			bson.M{"$set": bson.M{"revoked": true, "revokedAt": now}},
			options.Update().SetUpsert(false),
		)
		return e
	}); err != nil {
		// Snapshot may not exist yet for a just-archived or never-processed job; treat as non-fatal.
		logs.WarnCtx(ctx, "archived restore: corp_archived_job_stats revoke failed (continuing)",
			"job_id", archivedDoc.JobID, "account_id", accountID, "snapshot_id", snapshotID, "error", err)
	}
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		_, e := userSnapshotColl.UpdateOne(
			ctx,
			bson.M{"_id": snapshotID},
			bson.M{"$set": bson.M{"revoked": true, "revokedAt": now}},
			options.Update().SetUpsert(false),
		)
		return e
	}); err != nil {
		logs.WarnCtx(ctx, "archived restore: user_archived_job_stats revoke failed (continuing)",
			"job_id", archivedDoc.JobID, "account_id", accountID, "snapshot_id", snapshotID, "error", err)
	}

	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		_, e := archivedColl.DeleteOne(ctx, bson.M{"_id": jobID, "_meta.accountID": accountID})
		return e
	}); err != nil {
		metrics.Error("database_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to remove archived job", err)
		return
	}
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		return markDirtyAccount(ctx, dirtyAccountsColl, accountID, now)
	}); err != nil {
		logs.WarnCtx(ctx, "archived restore: mark dirty account failed (continuing)",
			"job_id", archivedDoc.JobID, "account_id", accountID, "error", err)
	}
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		return markDirtyCorpRefs(ctx, dirtyRefsColl, refs, now)
	}); err != nil {
		logs.WarnCtx(ctx, "archived restore: mark dirty corp refs failed (continuing)",
			"job_id", archivedDoc.JobID, "account_id", accountID, "corp_refs", refs, "error", err)
	}

	w.WriteHeader(http.StatusNoContent)
	metrics.Success()
}
