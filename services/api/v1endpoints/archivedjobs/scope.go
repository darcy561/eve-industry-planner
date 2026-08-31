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

// archiveScope names which archive a request addresses: its collections, the
// ownership rule for its documents, and how its statistics are rebuilt.
type archiveScope struct {
	OwnerID string

	jobs  *eipmongo.Docs
	stats *eipmongo.Docs

	ownerFilter     func(ownerID string) bson.M
	statsDocumentID func(ownerID, jobID string) string
	queueRebuild    func(ctx context.Context, m *eipmongo.Mongo, ownerID string, now time.Time) error

	// relinksESI is true only for the account archive; ESI ownership is per account.
	relinksESI bool
}

// accountArchiveScope addresses an account's own archive.
func accountArchiveScope(m *eipmongo.Mongo, accountID string) (archiveScope, error) {
	if m == nil {
		return archiveScope{}, fmt.Errorf("mongo handle is required")
	}
	if accountID == "" {
		return archiveScope{}, fmt.Errorf("accountID is required")
	}
	return archiveScope{
		OwnerID:         accountID,
		jobs:            m.ArchivedJobs,
		stats:           m.ArchivedJobStats,
		ownerFilter:     eipmongo.ArchivedJobAccountFilter,
		statsDocumentID: eipmongo.ArchivedJobStatsDocumentID,
		queueRebuild: func(ctx context.Context, m *eipmongo.Mongo, ownerID string, now time.Time) error {
			return m.QueueOwnerWork(ctx, models.AccountStatsOwner(ownerID), eipmongo.StatsWorkDelta, now)
		},
		relinksESI: true,
	}, nil
}

// filter returns a fresh ownership predicate for this archive.
func (s archiveScope) filter() bson.M {
	if s.ownerFilter == nil {
		return bson.M{}
	}
	return s.ownerFilter(s.OwnerID)
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
	if s.statsDocumentID == nil {
		return ""
	}
	return s.statsDocumentID(s.OwnerID, jobID)
}
