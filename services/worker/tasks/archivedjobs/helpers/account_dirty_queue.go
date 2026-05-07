package helpers

import (
	"context"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// DirtyAccountDocument is a row in the user_build_stats dirty-accounts queue.
type DirtyAccountDocument struct {
	ID        string    `bson:"_id"`
	TouchedAt time.Time `bson:"touchedAt"`
}

// MarkDirtyAccountForRebuild upserts touchedAt so ProcessDirtyAccountBuildStats can rebuild aggregates.
func MarkDirtyAccountForRebuild(ctx context.Context, coll *mongo.Collection, accountID string) error {
	if strings.TrimSpace(accountID) == "" {
		return nil
	}
	_, err := coll.UpdateOne(ctx,
		bson.M{"_id": accountID},
		bson.M{"$set": DirtyAccountDocument{ID: accountID, TouchedAt: time.Now().UTC()}},
		options.Update().SetUpsert(true),
	)
	return err
}

// FetchDirtyAccountIDs returns up to maxAccounts queue rows ordered by touchedAt (oldest first).
func FetchDirtyAccountIDs(ctx context.Context, dirtyColl *mongo.Collection, maxAccounts int) ([]string, error) {
	opts := options.Find().SetLimit(int64(maxAccounts)).SetSort(bson.D{{Key: "touchedAt", Value: 1}})
	cur, err := dirtyColl.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var docs []DirtyAccountDocument
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(docs))
	for _, doc := range docs {
		if doc.ID != "" {
			out = append(out, doc.ID)
		}
	}
	return out, nil
}
