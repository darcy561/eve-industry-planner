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

func BulkUpsertGroups(ctx context.Context, collection *mongo.Collection, accountID string, groups []models.Group, now time.Time, sessionID, wsClientID string) (*mongo.BulkWriteResult, int, error) {
	if collection == nil || accountID == "" {
		return nil, 0, fmt.Errorf("BulkUpsertGroups: invalid arguments")
	}
	bulkOps := make([]mongo.WriteModel, 0, len(groups))
	failedCount := 0
	for _, group := range groups {
		if group.GroupID == "" {
			failedCount++
			continue
		}
		group.MetaData.LastModified = now
		group.MetaData.LastUpdatedBy = accountID
		group.MetaData.AccountID = accountID
		ApplyMetaSessionClient(&group.MetaData.MetaData, sessionID, wsClientID)
		if group.MetaData.CreatedAt.IsZero() {
			group.MetaData.CreatedAt = now
		}
		group.AccountID = accountID
		bulkOps = append(bulkOps, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": group.GroupID, "_meta.accountID": accountID}).
			SetUpdate(bson.M{"$set": group}).
			SetUpsert(true))
	}
	if len(bulkOps) == 0 {
		return nil, failedCount, nil
	}
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("bulk upsert %d groups", len(bulkOps))
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
