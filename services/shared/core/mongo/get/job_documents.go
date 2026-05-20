package mongoget

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func LoadJobByID(ctx context.Context, collection *mongo.Collection, accountID, jobID string) (models.Job, error) {
	if collection == nil || accountID == "" || jobID == "" {
		return models.Job{}, fmt.Errorf("LoadJobByID: invalid arguments")
	}
	filter := bson.M{"_meta.accountID": accountID, "_id": jobID}
	retryCfg := defaultRetryConfig(fmt.Sprintf("find job %s for account %s", jobID, accountID))
	var doc models.Job
	if err := retryMongoOperation(ctx, retryCfg, func() error {
		return collection.FindOne(ctx, filter).Decode(&doc)
	}); err != nil {
		return models.Job{}, err
	}
	return doc, nil
}

func LoadJobsByFilter(ctx context.Context, collection *mongo.Collection, accountID, label string, filter bson.M) ([]models.Job, error) {
	if collection == nil || accountID == "" || filter == nil {
		return nil, fmt.Errorf("LoadJobsByFilter: invalid arguments")
	}
	retryCfg := defaultRetryConfig(fmt.Sprintf("find %s for account %s", label, accountID))
	var cursor *mongo.Cursor
	if err := retryMongoOperation(ctx, retryCfg, func() error {
		var err error
		cursor, err = collection.Find(ctx, filter, options.Find().SetSort(bson.M{"_meta.lastModified": -1}))
		return err
	}); err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		return nil, err
	}
	return jobs, nil
}
