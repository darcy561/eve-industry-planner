package mongo

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type dirtyQueueDoc struct {
	ID string `bson:"_id"`
}

// listAllDirtyQueueIDs returns _id from a dirty-queue collection (oldest touched first).
func listAllDirtyQueueIDs(ctx context.Context, client *mongo.Client, collection string) ([]string, error) {
	if client == nil {
		return nil, fmt.Errorf("mongo client is nil")
	}
	coll := client.Database(DatabaseName).Collection(collection)
	opts := options.Find().SetSort(bson.D{{Key: "touchedAt", Value: 1}})
	cur, err := coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var docs []dirtyQueueDoc
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(docs))
	for _, d := range docs {
		if d.ID != "" {
			out = append(out, d.ID)
		}
	}
	return out, nil
}

// ListAllDirtyAccountIDs returns every queued account in user_build_stats_dirty_accounts (oldest touched first).
func ListAllDirtyAccountIDs(ctx context.Context, client *mongo.Client) ([]string, error) {
	return listAllDirtyQueueIDs(ctx, client, CollectionUserBuildStatsDirtyAccounts)
}

// ListAllDirtyCorpRefs returns every queued corp ref in corp_build_stats_dirty_refs (oldest touched first).
func ListAllDirtyCorpRefs(ctx context.Context, client *mongo.Client) ([]string, error) {
	return listAllDirtyQueueIDs(ctx, client, CollectionCorpBuildStatsDirtyRefs)
}
