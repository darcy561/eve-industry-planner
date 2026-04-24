package indexing

import (
	"context"
	"fmt"

	mongocore "eve-industry-planner/shared/core/mongo"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const userJobGroupsMetaAccountIDIdxName = "ujg_meta_accountID_1"

// EnsureUserJobGroupsIndexes creates indexes for user_job_groups list queries by account.
// changeStreamPreAndPostImages (collMod) for this collection is applied at Mongo bootstrap by
// scripts/mongo-setup.sh (CHANGE_STREAM_PREIMAGE_COLLECTIONS); the app Mongo user must not collMod.
func EnsureUserJobGroupsIndexes(ctx context.Context, client *mongo.Client) error {
	if client == nil {
		return fmt.Errorf("mongo client is nil")
	}
	db := client.Database(mongocore.DatabaseName)
	coll := db.Collection(mongocore.CollectionUserJobGroups)
	_, err := coll.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "_meta.accountID", Value: 1}},
		Options: options.Index().SetName(userJobGroupsMetaAccountIDIdxName),
	})
	if err != nil && !isMongoIndexAlreadyCompatible(err) {
		return fmt.Errorf("create user_job_groups index _meta.accountID: %w", err)
	}
	return nil
}
