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
	userRollupBucketQueryIdxName = "accountID_1_year_1_month_1_typeID_1"
	corpRollupBucketQueryIdxName = "corpRef_1_lane_1_year_1_month_1_typeID_1"
)

// EnsureRollupBucketIndexes indexes precomputed monthly rollup collections (statistics rollup handlers).
func EnsureRollupBucketIndexes(ctx context.Context, client *mongo.Client) error {
	if client == nil {
		return fmt.Errorf("mongo client is nil")
	}
	db := client.Database(mongocore.DatabaseName)

	userColl := db.Collection(mongocore.CollectionUserBuildStatsBuckets)
	userIdx := mongo.IndexModel{
		Keys: bson.D{
			{Key: "accountID", Value: 1},
			{Key: "year", Value: 1},
			{Key: "month", Value: 1},
			{Key: "typeID", Value: 1},
		},
		Options: options.Index().SetName(userRollupBucketQueryIdxName),
	}
	if _, err := userColl.Indexes().CreateOne(ctx, userIdx); err != nil && !isMongoIndexAlreadyCompatible(err) {
		return fmt.Errorf("create %s indexes: %w", mongocore.CollectionUserBuildStatsBuckets, err)
	}

	corpColl := db.Collection(mongocore.CollectionCorpRollupBuckets)
	corpIdx := mongo.IndexModel{
		Keys: bson.D{
			{Key: "corpRef", Value: 1},
			{Key: "lane", Value: 1},
			{Key: "year", Value: 1},
			{Key: "month", Value: 1},
			{Key: "typeID", Value: 1},
		},
		Options: options.Index().SetName(corpRollupBucketQueryIdxName),
	}
	if _, err := corpColl.Indexes().CreateOne(ctx, corpIdx); err != nil && !isMongoIndexAlreadyCompatible(err) {
		return fmt.Errorf("create %s indexes: %w", mongocore.CollectionCorpRollupBuckets, err)
	}
	return nil
}
