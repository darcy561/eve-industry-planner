package mongo

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// UnprocessedArchivedJobFilter matches archived jobs not yet aggregated into build_stats.
// Partial-index friendly: $or of equality/null clauses on root and _meta.archiveProcessed.
func UnprocessedArchivedJobFilter() bson.M {
	return bson.M{"$or": []any{
		bson.M{"_meta.archiveProcessed": nil, "archiveProcessed": nil},
		bson.M{"_meta.archiveProcessed": nil, "archiveProcessed": false},
		bson.M{"_meta.archiveProcessed": false, "archiveProcessed": nil},
		bson.M{"_meta.archiveProcessed": false, "archiveProcessed": false},
	}}
}

// ArchivedJobAccountFilter scopes archivedJobs to _meta.accountID.
func ArchivedJobAccountFilter(accountID string) bson.M {
	return bson.M{"_meta.accountID": accountID}
}

// DistinctUnprocessedArchivedAccountIDs returns distinct account IDs with unprocessed archived jobs.
func (m *Mongo) DistinctUnprocessedArchivedAccountIDs(ctx context.Context) ([]string, error) {
	if m == nil || m.ArchivedJobs == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	coll := m.ArchivedJobs.Collection()
	if coll == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	var raw []any
	if err := coll.Distinct(ctx, "_meta.accountID", UnprocessedArchivedJobFilter()).Decode(&raw); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		id, ok := v.(string)
		if !ok || id == "" {
			continue
		}
		out = append(out, id)
	}
	return out, nil
}
