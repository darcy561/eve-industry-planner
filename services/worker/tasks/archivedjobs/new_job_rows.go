package archivedjobs

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/archivestats"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// newRowsResult reports what one pass over newly archived jobs produced.
type newRowsResult struct {
	Rows    []models.ArchivedJobStats
	Skipped int
}

// writeRowsForNewlyArchivedJobs turns archived jobs that have no statistics row
// into rows, leaving them uncounted.
//
// The fold's work list is the rows themselves, so a job whose row does not exist
// yet is invisible to it: archiving would save the job, queue the fold, and the
// fold would find nothing outstanding and clear the entry. Creating the row is
// what puts a newly archived job into the fold's reach.
//
// The rows are written uncounted, so the fold that follows in the same task picks
// them up. Writing them counted would file the job as already in the aggregates
// it has not reached.
func writeRowsForNewlyArchivedJobs(ctx context.Context, mongo *eipmongo.Mongo, accountID string, known []models.ArchivedJobStats, now time.Time) (newRowsResult, error) {
	var out newRowsResult

	have := make(map[string]struct{}, len(known))
	for _, row := range known {
		if !row.Revoked && row.JobID != "" {
			have[row.JobID] = struct{}{}
		}
	}

	err := mongo.EachArchivedJobWithoutStatsRow(ctx, accountID, have, func(job models.Job) error {
		row, rerr := archivestats.NewAccountRow(job, now)
		if rerr != nil {
			// The job stays without a row and is offered again next pass. Failing
			// here would strand every other new job behind one bad document.
			out.Skipped++
			return nil
		}
		out.Rows = append(out.Rows, row)
		return nil
	})
	if err != nil {
		return out, fmt.Errorf("read newly archived jobs: %w", err)
	}
	if len(out.Rows) == 0 {
		return out, nil
	}

	if err := mongo.WriteStatsRows(ctx, out.Rows, rebuildUpsertBatch); err != nil {
		return out, fmt.Errorf("write rows for newly archived jobs: %w", err)
	}
	return out, nil
}
