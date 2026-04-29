package mongoget

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func LoadWatchlistDeprecated(ctx context.Context, collection *mongo.Collection, accountID string) (bson.M, error) {
	if collection == nil || accountID == "" {
		return nil, fmt.Errorf("LoadWatchlistDeprecated: invalid arguments")
	}
	var raw bson.M
	retryCfg := defaultRetryConfig(fmt.Sprintf("find watchlist deprecated %s", accountID))
	if err := retryMongoOperation(ctx, retryCfg, func() error {
		return collection.FindOne(ctx, bson.M{"_id": accountID}).Decode(&raw)
	}); err != nil {
		return nil, err
	}
	return raw, nil
}
