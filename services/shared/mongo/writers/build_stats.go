package writers

import (
	"context"
	"fmt"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// BuildStatsArchivePair is one ordered pair: upsert/update build_stats then mark archivedJobs.
// Callers prepare filters/updates (including $inc / $push); this package only runs the bulk.
type BuildStatsArchivePair struct {
	StatsFilter bson.M
	StatsUpdate bson.M
	JobFilter   bson.M
	JobUpdate   bson.M
}

// ApplyBuildStatsArchiveBatch writes stats+mark pairs in order under retry.
// Empty pairs is a no-op. Preserves per-job pairing (never "all stats then all marks").
func ApplyBuildStatsArchiveBatch(ctx context.Context, m *eipmongo.Mongo, opName string, pairs []BuildStatsArchivePair) error {
	if len(pairs) == 0 {
		return nil
	}
	if m == nil {
		return fmt.Errorf("ApplyBuildStatsArchiveBatch: mongo is required")
	}
	if opName == "" {
		opName = "build_stats archive batch"
	}
	bulk := m.Bulk()
	for _, p := range pairs {
		bulk.UpdateOne(m.AccountProductionTotals, p.StatsFilter, p.StatsUpdate, eipmongo.Upsert())
		bulk.UpdateOne(m.ArchivedJobs, p.JobFilter, p.JobUpdate)
	}
	_, err := RunOrdered(ctx, opName, bulk)
	return err
}
