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

// BulkUpsertJobs upserts job documents for an account (unordered BulkWrite).
// Intended for mongo.JobDocuments.
func (d *Docs) BulkUpsertJobs(ctx context.Context, accountID string, jobs []models.Job, now time.Time, sessionID, wsClientID string) (*mongo.BulkWriteResult, int, error) {
	coll, err := d.requireColl()
	if err != nil || accountID == "" {
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
		job.MetaData.Owner = models.AccountOwner(accountID)
		ApplyMetaSessionClient(&job.MetaData.MetaData, sessionID, wsClientID)
		bulkOps = append(bulkOps, mongo.NewUpdateOneModel().
			SetFilter(bson.M{FieldMetaOwnerKind: models.OwnerAccount, FieldMetaOwnerID: accountID, "_id": job.JobID}).
			SetUpdate(bson.M{
				"$set":   job,
				"$unset": JobDocumentsUpsertUnset,
			}).
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
