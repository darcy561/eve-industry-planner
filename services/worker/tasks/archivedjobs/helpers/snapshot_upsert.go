package helpers

import (
	"context"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// UpsertArchivedJobStatsSnapshot writes doc to primary (corp or user snapshot collection), increments version,
// and deletes a stale row with the same _id from mirror (the other snapshot collection).
func UpsertArchivedJobStatsSnapshot(ctx context.Context, primary, mirror *mongo.Collection, doc models.ArchivedJobStats, retry mongocore.RetryConfig) error {
	return mongocore.RetryMongoOperation(ctx, retry, func() error {
		encoded, err := bson.Marshal(doc)
		if err != nil {
			return err
		}
		setDoc := bson.M{}
		if err := bson.Unmarshal(encoded, &setDoc); err != nil {
			return err
		}
		delete(setDoc, "version")
		filter := bson.M{"_id": doc.ID}
		update := bson.M{"$set": setDoc, "$inc": bson.M{"version": 1}}
		if _, err := primary.UpdateOne(ctx, filter, update, options.Update().SetUpsert(true)); err != nil {
			return err
		}
		_, _ = mirror.DeleteOne(ctx, bson.M{"_id": doc.ID})
		return nil
	})
}
