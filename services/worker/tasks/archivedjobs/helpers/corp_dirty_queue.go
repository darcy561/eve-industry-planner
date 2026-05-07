package helpers

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// DirtyCorpRefDocument is a row in the corp_build_stats dirty-refs queue.
type DirtyCorpRefDocument struct {
	ID        string    `bson:"_id"`
	TouchedAt time.Time `bson:"touchedAt"`
}

// MarkDirtyCorpRefs upserts touchedAt for each corp ref so ProcessDirtyCorpBuildStats can rebuild aggregates.
func MarkDirtyCorpRefs(ctx context.Context, dirtyRefsColl *mongo.Collection, refs []string) error {
	if len(refs) == 0 {
		return nil
	}
	now := time.Now().UTC()
	writes := make([]mongo.WriteModel, 0, len(refs))
	for _, ref := range refs {
		if ref == "" {
			continue
		}
		writes = append(writes, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": ref}).
			SetUpdate(bson.M{"$set": DirtyCorpRefDocument{ID: ref, TouchedAt: now}}).
			SetUpsert(true))
	}
	if len(writes) == 0 {
		return nil
	}
	_, err := dirtyRefsColl.BulkWrite(ctx, writes, options.BulkWrite().SetOrdered(false))
	return err
}

// FetchDirtyCorpRefs returns up to maxRefs queue rows ordered by touchedAt (oldest first).
func FetchDirtyCorpRefs(ctx context.Context, dirtyRefsColl *mongo.Collection, maxRefs int) ([]string, error) {
	opts := options.Find().SetLimit(int64(maxRefs)).SetSort(bson.D{{Key: "touchedAt", Value: 1}})
	cur, err := dirtyRefsColl.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var docs []DirtyCorpRefDocument
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	refs := make([]string, 0, len(docs))
	for _, doc := range docs {
		if doc.ID != "" {
			refs = append(refs, doc.ID)
		}
	}
	return refs, nil
}
