package indexing

import (
	"context"
	"fmt"

	mongocore "eve-industry-planner/shared/core/mongo"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	ujdPlannerIdxName = "ujd_meta_accountID_displayOnPlanner_1"
	ujdGroupIdxName   = "ujd_meta_accountID_groupID_1"
)

// EnsureUserJobDocumentsIndexes creates indexes for planner and by-group queries.
// changeStreamPreAndPostImages for this collection is applied at Mongo bootstrap by
// scripts/mongo-setup.sh (CHANGE_STREAM_PREIMAGE_COLLECTIONS).
func EnsureUserJobDocumentsIndexes(ctx context.Context, client *mongo.Client) error {
	if client == nil {
		return fmt.Errorf("mongo client is nil")
	}
	db := client.Database(mongocore.DatabaseName)
	coll := db.Collection(mongocore.CollectionUserJobDocuments)

	indexes := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "_meta.accountID", Value: 1},
				{Key: "displayOnPlanner", Value: 1},
			},
			Options: options.Index().SetName(ujdPlannerIdxName),
		},
		{
			Keys: bson.D{
				{Key: "_meta.accountID", Value: 1},
				{Key: "groupID", Value: 1},
			},
			Options: options.Index().SetName(ujdGroupIdxName),
		},
	}

	for _, im := range indexes {
		_, err := coll.Indexes().CreateOne(ctx, im)
		if err != nil && !isMongoIndexAlreadyCompatible(err) {
			name := ""
			if im.Options != nil && im.Options.Name != nil {
				name = *im.Options.Name
			}
			return fmt.Errorf("create user_job_documents index %s: %w", name, err)
		}
	}
	return nil
}
