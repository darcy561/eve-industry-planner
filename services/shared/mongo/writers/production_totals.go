package writers

import (
	"context"
	"fmt"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// ProductionTotalsArchivePair is one ordered pair: upsert/update production_totals then mark archived_jobs.
// Callers prepare filters/updates (including $inc / $push); this package only runs the bulk.
type ProductionTotalsArchivePair struct {
	StatsFilter bson.M
	StatsUpdate bson.M
	JobFilter   bson.M
	JobUpdate   bson.M
}

// ApplyProductionTotalsArchiveBatch writes stats+mark pairs in order under retry.
// Empty pairs is a no-op. Preserves per-job pairing (never "all stats then all marks").
func ApplyProductionTotalsArchiveBatch(ctx context.Context, m *eipmongo.Mongo, opName string, pairs []ProductionTotalsArchivePair) error {
	if len(pairs) == 0 {
		return nil
	}
	if m == nil {
		return fmt.Errorf("ApplyProductionTotalsArchiveBatch: mongo is required")
	}
	if opName == "" {
		opName = "production_totals archive batch"
	}
	bulk := m.Bulk()
	for _, p := range pairs {
		bulk.UpdateOne(m.StatisticsTotals, p.StatsFilter, p.StatsUpdate, eipmongo.Upsert())
		bulk.UpdateOne(m.ArchivedJobs, p.JobFilter, p.JobUpdate)
	}
	_, err := RunOrdered(ctx, opName, bulk)
	return err
}
