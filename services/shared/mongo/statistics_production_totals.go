package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// ProductionTotalsDocumentID is the _id for production_totals:
// {ownerKey}|typeID. One document per item type an owner has built.
func ProductionTotalsDocumentID(owner models.Owner, typeID int) string {
	return fmt.Sprintf("%s|%d", owner.Key(), typeID)
}

// TimelineMonthDocumentID is the _id for timeline_months:
// {ownerKey}|typeID|YYYY-MM, with a |chain segment on the production-chain bucket.
func TimelineMonthDocumentID(owner models.Owner, typeID, year, month int, isProductionChain bool) string {
	id := fmt.Sprintf("%s|%d|%04d-%02d", owner.Key(), typeID, year, month)
	if isProductionChain {
		return id + "|chain"
	}
	return id
}

// ArchivedJobStatsDocumentID is the _id for archived_job_stats: the same {ownerKey}|jobID the
// archived job itself is stored under, so a row and the job it was derived from share one id.
func ArchivedJobStatsDocumentID(owner models.Owner, jobID string) string {
	return OwnerScopedDocumentID(owner, jobID)
}

// EachOwnerArchivedJob walks an owner's archived jobs, handing each to fn.
func (m *Mongo) EachOwnerArchivedJob(ctx context.Context, owner models.Owner, fn func(models.Job) error) error {
	if m == nil || m.ArchivedJobs == nil {
		return fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return err
	}
	if fn == nil {
		return fmt.Errorf("a visitor is required")
	}
	coll, err := m.ArchivedJobs.requireColl()
	if err != nil {
		return err
	}

	cursor, err := coll.Find(ctx, OwnerFilter(owner))
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var job models.Job
		if decErr := cursor.Decode(&job); decErr != nil {
			return decErr
		}
		if fnErr := fn(job); fnErr != nil {
			return fnErr
		}
	}
	return cursor.Err()
}

// LoadArchivedJobStats reads an owner's existing statistics rows, including revoked ones, so a
// rebuild can tell a job it has already seen from one it has not.
func (m *Mongo) LoadArchivedJobStats(ctx context.Context, owner models.Owner, opts ...RetryOption) ([]models.ArchivedJobStats, error) {
	if m == nil || m.StatisticsRows == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return nil, err
	}
	rows, err := findAll[models.ArchivedJobStats](ctx, m.StatisticsRows, applyRetryOptions("LoadArchivedJobStats", opts), OwnerFilter(owner))
	if err != nil {
		return nil, err
	}
	return upgradeStatsRows(rows), nil
}

// RevokeArchivedJobStats marks rows whose job is no longer archived.
func (m *Mongo) RevokeArchivedJobStats(ctx context.Context, owner models.Owner, keepDocIDs []string, now time.Time, opts ...RetryOption) (int64, error) {
	if m == nil || m.StatisticsRows == nil {
		return 0, fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return 0, err
	}
	coll, err := m.StatisticsRows.requireColl()
	if err != nil {
		return 0, err
	}

	filter := OwnerFilter(owner, bson.M{"revoked": bson.M{"$ne": true}})
	if len(keepDocIDs) > 0 {
		filter["_id"] = bson.M{"$nin": keepDocIDs}
	}

	var revoked int64
	err = Retry(ctx, applyRetryOptions("RevokeArchivedJobStats", opts), func() error {
		revoked = 0
		res, uerr := coll.UpdateMany(ctx, filter, bson.M{"$set": bson.M{"revoked": true, "revokedAt": now}})
		if uerr != nil {
			return uerr
		}
		if res != nil {
			revoked = res.ModifiedCount
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return revoked, nil
}

// PruneTimelineMonths removes an owner's buckets that a rebuild did not produce.
func (m *Mongo) PruneTimelineMonths(ctx context.Context, owner models.Owner, keepDocIDs []string, opts ...RetryOption) (int64, error) {
	if m == nil || m.StatisticsTimeline == nil {
		return 0, fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return 0, err
	}
	coll, err := m.StatisticsTimeline.requireColl()
	if err != nil {
		return 0, err
	}

	filter := OwnerFilter(owner)
	if len(keepDocIDs) > 0 {
		filter["_id"] = bson.M{"$nin": keepDocIDs}
	}

	var deleted int64
	err = Retry(ctx, applyRetryOptions("PruneTimelineMonths", opts), func() error {
		deleted = 0
		res, derr := coll.DeleteMany(ctx, filter)
		if derr != nil {
			return derr
		}
		if res != nil {
			deleted = res.DeletedCount
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return deleted, nil
}

// PruneProductionTotals removes an owner's lifetime totals for item types the rebuild no longer
// produces.
func (m *Mongo) PruneProductionTotals(ctx context.Context, owner models.Owner, keepDocIDs []string, opts ...RetryOption) (int64, error) {
	if m == nil || m.StatisticsTotals == nil {
		return 0, fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return 0, err
	}
	coll, err := m.StatisticsTotals.requireColl()
	if err != nil {
		return 0, err
	}

	filter := OwnerFilter(owner)
	if len(keepDocIDs) > 0 {
		filter["_id"] = bson.M{"$nin": keepDocIDs}
	}

	var deleted int64
	err = Retry(ctx, applyRetryOptions("PruneProductionTotals", opts), func() error {
		deleted = 0
		res, derr := coll.DeleteMany(ctx, filter)
		if derr != nil {
			return derr
		}
		if res != nil {
			deleted = res.DeletedCount
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return deleted, nil
}

// LoadProductionTotals reads an owner's lifetime totals, one row per item type, sorted by item type
// so a response is ordered the same way twice.
func (m *Mongo) LoadProductionTotals(ctx context.Context, owner models.Owner, typeID int, opts ...RetryOption) ([]models.ProductionTotalsRow, error) {
	if m == nil || m.StatisticsTotals == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return nil, err
	}
	filter := OwnerFilter(owner)
	if typeID != 0 {
		filter["typeID"] = typeID
	}
	return findAll[models.ProductionTotalsRow](ctx, m.StatisticsTotals, applyRetryOptions("LoadProductionTotals", opts), filter,
		options.Find().SetSort(bson.D{{Key: "typeID", Value: 1}}))
}

// LoadTimelineMonths reads an owner's stored monthly buckets, the
// documents a reconcile compares its fold against.
func (m *Mongo) LoadTimelineMonths(ctx context.Context, owner models.Owner, opts ...RetryOption) ([]models.TimelineMonthBucket, error) {
	if m == nil || m.StatisticsTimeline == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return nil, err
	}
	return findAll[models.TimelineMonthBucket](ctx, m.StatisticsTimeline, applyRetryOptions("LoadTimelineMonths", opts), OwnerFilter(owner))
}
