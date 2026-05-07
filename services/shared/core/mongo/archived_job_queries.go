package mongo

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
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

// CorpArchivedJobCorpRefFilter scopes corp_archivedJobs to one opaque corp ref (HMAC), stored as _meta.corpRef.
func CorpArchivedJobCorpRefFilter(corpRef string) bson.M {
	return bson.M{"_meta.corpRef": corpRef}
}

// UnprocessedCorpArchivedJobFilter is UnprocessedArchivedJobFilter combined with a non-empty _meta.corpRef
// (distinct / snapshot workers should not pick up rows missing ownership).
func UnprocessedCorpArchivedJobFilter() bson.M {
	return bson.M{"$and": bson.A{
		UnprocessedArchivedJobFilter(),
		bson.M{"_meta.corpRef": bson.M{"$gt": ""}},
	}}
}

// DistinctUnprocessedArchivedAccountIDs returns distinct non-empty _meta.accountID values that have
// at least one matching document in archivedJobs.
func DistinctUnprocessedArchivedAccountIDs(ctx context.Context, client *mongo.Client) ([]string, error) {
	if client == nil {
		return nil, fmt.Errorf("mongo client is nil")
	}
	coll := client.Database(DatabaseName).Collection(CollectionArchivedJobs)
	raw, err := coll.Distinct(ctx, "_meta.accountID", UnprocessedArchivedJobFilter())
	if err != nil {
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

// DistinctUnprocessedCorpArchivedCorpRefs returns distinct non-empty _meta.corpRef values in corp_archivedJobs
// that still need snapshot processing.
func DistinctUnprocessedCorpArchivedCorpRefs(ctx context.Context, client *mongo.Client) ([]string, error) {
	if client == nil {
		return nil, fmt.Errorf("mongo client is nil")
	}
	coll := client.Database(DatabaseName).Collection(CollectionCorpArchivedJobs)
	raw, err := coll.Distinct(ctx, "_meta.corpRef", UnprocessedCorpArchivedJobFilter())
	if err != nil {
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

// DistinctArchivedJobStatsAccountIDs returns distinct non-empty accountID values from corp_archived_job_stats
// and user_archived_job_stats (union), for scheduler fan-out alongside unprocessed archivedJobs.
func DistinctArchivedJobStatsAccountIDs(ctx context.Context, client *mongo.Client) ([]string, error) {
	if client == nil {
		return nil, fmt.Errorf("mongo client is nil")
	}
	set := map[string]struct{}{}
	for _, name := range []string{CollectionCorpArchivedJobStats, CollectionUserArchivedJobStats} {
		coll := client.Database(DatabaseName).Collection(name)
		raw, err := coll.Distinct(ctx, "accountID", bson.M{})
		if err != nil {
			return nil, err
		}
		for _, v := range raw {
			s, ok := v.(string)
			if !ok || s == "" {
				continue
			}
			set[s] = struct{}{}
		}
	}
	out := make([]string, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	return out, nil
}
