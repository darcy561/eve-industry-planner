package mongoput

import (
	"context"
	"fmt"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func BulkUpsertJobDocuments(ctx context.Context, collection *mongo.Collection, accountID string, jobs []models.Job, now time.Time, sessionID, wsClientID string) (*mongo.BulkWriteResult, int, error) {
	if collection == nil || accountID == "" {
		return nil, 0, fmt.Errorf("BulkUpsertJobDocuments: invalid arguments")
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
		job.MetaData.AccountID = accountID
		ApplyMetaSessionClient(&job.MetaData.MetaData, sessionID, wsClientID)
		bulkOps = append(bulkOps, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": job.JobID, "_meta.accountID": accountID}).
			SetUpdate(bson.M{
				"$set": job,
				"$unset": bson.M{
					"accountID":        "",
					"deleted":          "",
					"deletedTimeStamp": "",
					"archived":         "",
					"archiveTimeStamp": "",
					"archiveProcessed": "",
				},
			}).
			SetUpsert(true))
	}
	if len(bulkOps) == 0 {
		return nil, failedCount, nil
	}
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("bulk upsert %d job documents", len(bulkOps))
	var result *mongo.BulkWriteResult
	err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		var opErr error
		result, opErr = collection.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
		return opErr
	})
	if err != nil {
		return nil, failedCount, err
	}
	return result, failedCount, nil
}
