package indexing

import (
	"context"
	"fmt"

	mongocore "eve-industry-planner/shared/core/mongo"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const userWatchlistDeprecatedMetaAccountIDIdxName = "uwd_meta_accountID_1"

// EnsureUserWatchlistDeprecatedIndexes creates an index for account-scoped queries on the deprecated watchlist collection.
// changeStreamPreAndPostImages is enabled at Mongo bootstrap by scripts/mongo-setup.sh.
func EnsureUserWatchlistDeprecatedIndexes(ctx context.Context, client *mongo.Client) error {
	if client == nil {
		return fmt.Errorf("mongo client is nil")
	}
	db := client.Database(mongocore.DatabaseName)
	coll := db.Collection(mongocore.CollectionUserWatchlistDeprecated)
	_, err := coll.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "_meta.accountID", Value: 1}},
		Options: options.Index().SetName(userWatchlistDeprecatedMetaAccountIDIdxName),
	})
	if err != nil && !isMongoIndexAlreadyCompatible(err) {
		return fmt.Errorf("create user_watchlist_deprecated index _meta.accountID: %w", err)
	}
	return nil
}
