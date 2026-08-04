package mongoget

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

func LoadGroupsByAccount(ctx context.Context, collection *mongo.Collection, accountID string) ([]models.Group, error) {
	if collection == nil || accountID == "" {
		return nil, fmt.Errorf("LoadGroupsByAccount: invalid arguments")
	}
	filter := bson.M{"_meta.accountID": accountID}
	retryCfg := defaultRetryConfig(fmt.Sprintf("find groups for account %s", accountID))
	var cursor *mongo.Cursor
	if err := retryMongoOperation(ctx, retryCfg, func() error {
		var err error
		cursor, err = collection.Find(ctx, filter)
		return err
	}); err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var groups []models.Group
	if err := cursor.All(ctx, &groups); err != nil {
		return nil, err
	}
	return groups, nil
}

func LoadGroupByID(ctx context.Context, collection *mongo.Collection, accountID, groupID string) (models.Group, error) {
	if collection == nil || accountID == "" || groupID == "" {
		return models.Group{}, fmt.Errorf("LoadGroupByID: invalid arguments")
	}
	filter := bson.M{"_id": groupID, "_meta.accountID": accountID}
	retryCfg := defaultRetryConfig(fmt.Sprintf("find group %s for account %s", groupID, accountID))
	var group models.Group
	if err := retryMongoOperation(ctx, retryCfg, func() error {
		return collection.FindOne(ctx, filter).Decode(&group)
	}); err != nil {
		return models.Group{}, err
	}
	return group, nil
}
