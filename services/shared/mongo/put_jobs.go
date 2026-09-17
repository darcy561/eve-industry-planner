package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// BulkUpsertJobs upserts job documents into one planner (unordered BulkWrite).
// Intended for mongo.JobDocuments.
//
// owner is the planner the documents belong to; accountID is who wrote them, and
// the two differ whenever a member writes in a planner that is not their own.
func (d *Docs) BulkUpsertJobs(ctx context.Context, owner models.Owner, accountID string, jobs []models.Job, now time.Time, sessionID, wsClientID string) (*mongo.BulkWriteResult, int, error) {
	coll, err := d.requireColl()
	if err != nil || accountID == "" || owner.IsZero() {
		return nil, 0, fmt.Errorf("BulkUpsertJobs: invalid arguments")
	}
	bulkOps := make([]mongo.WriteModel, 0, len(jobs))
	failedCount := 0
	for _, job := range jobs {
		if job.JobID == "" {
			failedCount++
			continue
		}
		job.MetaData.LastModified = now
		job.MetaData.LastUpdatedBy = accountID
		job.MetaData.Owner = owner
		ApplyMetaSessionClient(&job.MetaData.MetaData, sessionID, wsClientID)
		update, uerr := SetDocumentWithRevision(job, JobDocumentsUpsertUnset)
		if uerr != nil {
			failedCount++
			continue
		}
		bulkOps = append(bulkOps, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": OwnerScopedDocumentID(owner, job.JobID)}).
			SetUpdate(update).
			SetUpsert(true))
	}
	if len(bulkOps) == 0 {
		return nil, failedCount, nil
	}
	var result *mongo.BulkWriteResult
	err = Retry(ctx, "BulkUpsertJobs", func() error {
		var opErr error
		result, opErr = coll.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
		return opErr
	})
	if err != nil {
		return nil, failedCount, err
	}
	return result, failedCount, nil
}
