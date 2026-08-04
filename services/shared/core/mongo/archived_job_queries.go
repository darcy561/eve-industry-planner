package mongo

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// UnprocessedArchivedJobFilter matches archived job documents not yet aggregated into build_stats
// (same semantics as Firebase archievedJobs "archiveProcessed == false").
//
// Partial indexes on some deployments reject $nor, $ne (internally $not), and nested $or. This filter
// is a top-level $or of four AND-clauses (multiple keys in one doc = implicit $and), using only equality
// and BSON null ({field: null} matches missing or null). Excludes docs with archiveProcessed == true
// under _meta or at root (legacy).
func UnprocessedArchivedJobFilter() bson.M {
	return bson.M{"$or": []any{
		bson.M{"_meta.archiveProcessed": nil, "archiveProcessed": nil},
		bson.M{"_meta.archiveProcessed": nil, "archiveProcessed": false},
		bson.M{"_meta.archiveProcessed": false, "archiveProcessed": nil},
		bson.M{"_meta.archiveProcessed": false, "archiveProcessed": false},
	}}
}

// ArchivedJobAccountFilter scopes archivedJobs queries to a single account via _meta.accountID
// (canonical ownership field for this collection; top-level accountID is not used).
func ArchivedJobAccountFilter(accountID string) bson.M {
	return bson.M{"_meta.accountID": accountID}
}

// DistinctUnprocessedArchivedAccountIDs returns distinct non-empty _meta.accountID values that have
// at least one matching document in archivedJobs.
func DistinctUnprocessedArchivedAccountIDs(ctx context.Context, client *mongo.Client) ([]string, error) {
	if client == nil {
		return nil, fmt.Errorf("mongo client is nil")
	}
	coll := client.Database(DatabaseName).Collection(CollectionArchivedJobs)
	var raw []any
	if err := coll.Distinct(ctx, "_meta.accountID", UnprocessedArchivedJobFilter()).Decode(&raw); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		s, ok := v.(string)
		if !ok || s == "" {
			continue
		}
		out = append(out, s)
	}
	return out, nil
}
