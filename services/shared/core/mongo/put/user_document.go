package mongoput

import (
	"context"
	"fmt"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// UpsertUserAccountDocument writes users with _meta-preserving upsert.
// If wsClientID is present and the first write fails, it retries once with empty _meta.clientID.
func UpsertUserAccountDocument(ctx context.Context, collection *mongo.Collection, accountID string, doc models.UserAccountDocument) (result *mongo.UpdateResult, retriedWithoutWSClientID bool, err error) {
	if collection == nil || accountID == "" {
		return nil, false, fmt.Errorf("UpsertUserAccountDocument: invalid arguments")
	}
	doUpsert := func(d models.UserAccountDocument) (*mongo.UpdateResult, error) {
		return mongocore.UpsertStructByIDPreservingMetaWithRetry(
			ctx,
			collection,
			d,
			accountID,
			fmt.Sprintf("update user document %s", accountID),
		)
	}
	return upsertWithWSClientIDRetry(
		doc,
		doUpsert,
		func(d *models.UserAccountDocument) bool {
			if d.MetaData.ClientID == "" {
				return false
			}
			d.MetaData.ClientID = ""
			return true
		},
	)
}

// PatchUserAccountFields applies $set on the users row matching _id and _meta.accountID (no upsert).
func PatchUserAccountFields(ctx context.Context, collection *mongo.Collection, accountID string, set bson.M, operationName string) error {
	if collection == nil || accountID == "" {
		return fmt.Errorf("PatchUserAccountFields: collection and accountID are required")
	}
	if len(set) == 0 {
		return fmt.Errorf("PatchUserAccountFields: set is empty")
	}
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = operationName
	return mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		_, err := collection.UpdateOne(ctx,
			bson.M{"_id": accountID, "_meta.accountID": accountID},
			bson.M{"$set": set},
		)
		return err
	})
}
