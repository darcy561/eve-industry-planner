package indexing

import (
	"context"
	"fmt"

	mongocore "eve-industry-planner/shared/core/mongo"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const accountDocMetaAccountIDIdxName = "meta_accountID_1"

// EnsureUserAccountDocumentsIndexes creates indexes on _meta.accountID for `users` and
// `application_settings` (aligned with jobs / archived ownership queries).
func EnsureUserAccountDocumentsIndexes(ctx context.Context, client *mongo.Client) error {
	if client == nil {
		return fmt.Errorf("mongo client is nil")
	}
	db := client.Database(mongocore.DatabaseName)
	for _, collName := range []string{mongocore.CollectionUsers, mongocore.CollectionApplicationSettings} {
		coll := db.Collection(collName)
		_, err := coll.Indexes().CreateOne(ctx, mongo.IndexModel{
			Keys:    bson.D{{Key: "_meta.accountID", Value: 1}},
			Options: options.Index().SetName(accountDocMetaAccountIDIdxName),
		})
		if err != nil && !isMongoIndexAlreadyCompatible(err) {
			return fmt.Errorf("create %s index _meta.accountID: %w", collName, err)
		}
	}
	return nil
}
