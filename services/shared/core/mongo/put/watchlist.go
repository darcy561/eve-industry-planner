package mongoput

import (
	"context"
	"fmt"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func UpsertWatchlistDeprecated(ctx context.Context, collection *mongo.Collection, accountID string, groups any, items any, now time.Time) (*mongo.UpdateResult, error) {
	if collection == nil || accountID == "" {
		return nil, fmt.Errorf("UpsertWatchlistDeprecated: invalid arguments")
	}
	doc := bson.M{
		"_id":    accountID,
		"groups": groups,
		"items":  items,
		"_meta": bson.M{
			"accountID":    accountID,
			"lastModified": now,
		},
	}
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("upsert watchlist deprecated %s", accountID)
	var result *mongo.UpdateResult
	err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		var opErr error
		result, opErr = collection.ReplaceOne(ctx, bson.M{"_id": accountID}, doc, options.Replace().SetUpsert(true))
		return opErr
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
