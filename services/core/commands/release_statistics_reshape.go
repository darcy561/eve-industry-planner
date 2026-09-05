package commands

import (
	"context"
	"fmt"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// derivedStatisticsCollections hold nothing that is not computed from the
// archived jobs.
var derivedStatisticsCollections = []string{
	eipmongo.CollectionArchivedJobStats,
	eipmongo.CollectionAccountTimelineMonths,
	eipmongo.CollectionAccountProductionTotals,
}

// preReleaseSnapshotSuffix names a copy of a collection as it stood before this
// release reshaped it. Derived from the live name rather than written out, so a
// collection rename carries its snapshot with it.
const preReleaseSnapshotSuffix = "_pre_0_9_0"

// snapshotDerivedStatistics copies the statistics documents as they stand before
// the rebuild rewrites them.
//
// The documents are derived — every row, bucket and total is reproduced from the
// archived jobs, and the release queues every owner for a rebuild — so they are
// regenerated rather than converted. Regenerating in place is not possible: a
// document id now leads with the owner key, and Mongo refuses an update to `_id`.
//
// Nothing is deleted here. The rebuild writes the new documents alongside the old
// ones, which are left for an operator to remove once the figures have been
// checked. They are inert in the meantime: every query filters on the owner, and
// a document written before this release has none, so nothing reads them.
//
// Re-running is safe and does not overwrite a snapshot: a collection whose
// snapshot already holds documents has been through this step, and is left alone.
func snapshotDerivedStatistics(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	reports := make([]string, 0, len(derivedStatisticsCollections))

	for _, name := range derivedStatisticsCollections {
		report, err := snapshotThenEmpty(ctx, clients, name, dryRun)
		if err != nil {
			return "", fmt.Errorf("%s: %w", name, err)
		}
		reports = append(reports, report)
	}

	out := ""
	for i, r := range reports {
		if i > 0 {
			out += "; "
		}
		out += r
	}
	return out, nil
}

func snapshotThenEmpty(ctx context.Context, clients *stackservices.Clients, name string, dryRun bool) (string, error) {
	source := clients.Mongo.Coll(name)
	target := name + preReleaseSnapshotSuffix

	taken, err := clients.Mongo.Coll(target).CountDocuments(ctx, bson.M{})
	if err != nil {
		return "", fmt.Errorf("count %s: %w", target, err)
	}
	if taken > 0 {
		return fmt.Sprintf("%s already copied (%d in %s)", name, taken, target), nil
	}

	held, err := source.CountDocuments(ctx, bson.M{})
	if err != nil {
		return "", fmt.Errorf("count: %w", err)
	}
	if held == 0 {
		return fmt.Sprintf("%s is empty", name), nil
	}
	if dryRun {
		return fmt.Sprintf("%s: %d would copy to %s", name, held, target), nil
	}

	// $out copies server-side, so no document travels through this process.
	cursor, err := source.Aggregate(ctx, mongodriver.Pipeline{bson.D{{Key: "$out", Value: target}}})
	if err != nil {
		return "", fmt.Errorf("copy to %s: %w", target, err)
	}
	if err := cursor.Close(ctx); err != nil {
		return "", fmt.Errorf("copy to %s: %w", target, err)
	}

	// A short copy is reported rather than passed over: it is the one outcome that
	// would leave an operator believing there is a complete copy to fall back on.
	copied, err := clients.Mongo.Coll(target).CountDocuments(ctx, bson.M{})
	if err != nil {
		return "", fmt.Errorf("count %s: %w", target, err)
	}
	if copied != held {
		return "", fmt.Errorf("%s holds %d of %d documents", target, copied, held)
	}
	return fmt.Sprintf("%s: %d copied to %s", name, copied, target), nil
}
