package indexing

import (
	"context"
	"fmt"

	mongocore "eve-industry-planner/shared/core/mongo"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// archivedJobsUnprocessedIdx supports:
//   - build_stats worker: Find on { _meta.accountID } + UnprocessedArchivedJobFilter, sort by _id
//   - distinct _meta.accountID for unprocessed jobs (same partial filter as the query)
//
// Older deployments may still have index "accountID_1__id_1_unprocessed_archived_jobs"; drop it manually after
// documents use _meta.accountID (this code only ensures the new index exists).
const archivedJobsUnprocessedIdxName = "meta_accountID_1__id_1_unprocessed_archived_jobs"

// EnsureArchivedJobsIndexes creates indexes used by the archived-jobs → build_stats pipeline.
// Safe to call on every startup (idempotent).
func EnsureArchivedJobsIndexes(ctx context.Context, client *mongo.Client) error {
	if client == nil {
		return fmt.Errorf("mongo client is nil")
	}
	coll := client.Database(mongocore.DatabaseName).Collection(mongocore.CollectionArchivedJobs)
	_, err := coll.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "_meta.accountID", Value: 1}, {Key: "_id", Value: 1}},
		Options: options.Index().
			SetName(archivedJobsUnprocessedIdxName).
			SetPartialFilterExpression(mongocore.UnprocessedArchivedJobFilter()),
	})
	if err != nil && !isMongoIndexAlreadyCompatible(err) {
		return fmt.Errorf("create archivedJobs partial index: %w", err)
	}
	return nil
}
