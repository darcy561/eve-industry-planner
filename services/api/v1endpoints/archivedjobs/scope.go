package archivedjobs

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// archiveScope names which archive a request addresses: its collections and the
// planner whose documents they hold.
type archiveScope struct {
	Owner models.Owner

	jobs  *eipmongo.Docs
	stats *eipmongo.Docs

	// relinksESI is true only for an account's own archive; ESI ownership is per
	// account, so a shared planner's archive reclaims no ids.
	relinksESI bool
}

// plannerArchiveScope addresses one planner's archive.
func plannerArchiveScope(m *eipmongo.Mongo, owner models.Owner) (archiveScope, error) {
	if m == nil {
		return archiveScope{}, fmt.Errorf("mongo handle is required")
	}
	if owner.IsZero() {
		return archiveScope{}, fmt.Errorf("owner is required")
	}
	return archiveScope{
		Owner:      owner,
		jobs:       m.ArchivedJobs,
		stats:      m.StatisticsRows,
		relinksESI: owner.Kind == models.OwnerAccount,
	}, nil
}

// filter returns a fresh ownership predicate for this archive.
//
// Fresh rather than shared: callers add their own terms to it, and a shared map
// would carry one request's predicate into the next.
func (s archiveScope) filter() bson.M {
	if s.Owner.IsZero() {
		return bson.M{}
	}
	return eipmongo.OwnerFilter(s.Owner)
}

// queueRebuild asks for this archive's statistics to be recalculated.
func (s archiveScope) queueRebuild(ctx context.Context, m *eipmongo.Mongo, now time.Time) error {
	if m == nil || s.Owner.IsZero() {
		return fmt.Errorf("queueRebuild: invalid arguments")
	}
	return m.QueueOwnerWork(ctx, s.Owner, eipmongo.StatsWorkDelta, now)
}

func (s archiveScope) jobsCollection() (*mongodriver.Collection, error) {
	if s.jobs == nil {
		return nil, fmt.Errorf("archive collection is required")
	}
	coll := s.jobs.Collection()
	if coll == nil {
		return nil, fmt.Errorf("archive collection is required")
	}
	return coll, nil
}

func (s archiveScope) statsCollection() (*mongodriver.Collection, error) {
	if s.stats == nil {
		return nil, fmt.Errorf("archive statistics collection is required")
	}
	coll := s.stats.Collection()
	if coll == nil {
		return nil, fmt.Errorf("archive statistics collection is required")
	}
	return coll, nil
}

func (s archiveScope) statsID(jobID string) string {
	if s.Owner.IsZero() {
		return ""
	}
	return eipmongo.ArchivedJobStatsDocumentID(s.Owner, jobID)
}
