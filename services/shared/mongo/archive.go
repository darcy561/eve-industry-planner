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
func (m *Mongo) DistinctUnprocessedArchivedAccountIDs(ctx context.Context, opts ...RetryOption) ([]string, error) {
	if m == nil || m.ArchivedJobs == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	return m.ArchivedJobs.DistinctStrings(
		ctx,
		"_meta.accountID",
		UnprocessedArchivedJobFilter(),
		append([]RetryOption{WithOpName("DistinctUnprocessedArchivedAccountIDs")}, opts...)...,
	)
}
