package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Document _id builders for the statistics collections. These are the contract
// between the workers that write and the API that reads; build every _id here
// rather than formatting one at a call site.

// The document ids of the three statistics collections all lead with the owner
// key, so a document says who owns it in its own name and a kind added later
// needs no new id format.

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

// ArchivedJobStatsDocumentID is the _id for archived_job_stats:
// {ownerKey}|jobID.
func ArchivedJobStatsDocumentID(owner models.Owner, jobID string) string {
	return fmt.Sprintf("%s|%s", owner.Key(), jobID)
}

// EachOwnerArchivedJob walks an owner's archived jobs, handing each to fn.
//
// A rebuild reduces every job to a much smaller row, so it never needs the jobs
// themselves all at once. Walking the cursor holds one job at a time instead of
// the whole archive, which is what makes many rebuilds safe to run concurrently.
//
// Not retried: a retry would restart the walk and hand fn jobs it has already
// seen, and only the caller knows whether that is safe.
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

	cursor, err := coll.Find(ctx, archivedJobsOwnedBy(owner))
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

// LoadArchivedJobStats reads an owner's existing statistics rows,
// including revoked ones, so a rebuild can tell a job it has already seen from
// one it has not.
func (m *Mongo) LoadArchivedJobStats(ctx context.Context, owner models.Owner, opts ...RetryOption) ([]models.ArchivedJobStats, error) {
	if m == nil || m.StatisticsRows == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return nil, err
	}
	coll, err := m.StatisticsRows.requireColl()
	if err != nil {
		return nil, err
	}

	var out []models.ArchivedJobStats
	err = Retry(ctx, applyRetryOptions("LoadArchivedJobStats", opts), func() error {
		out = nil
		cursor, findErr := coll.Find(ctx, bson.M{"owner.kind": owner.Kind, "owner.id": owner.ID})
		if findErr != nil {
			return findErr
		}
		defer cursor.Close(ctx)
		return cursor.All(ctx, &out)
	})
	if err != nil {
		return nil, err
	}
	return upgradeStatsRows(out), nil
}

// RevokeArchivedJobStats marks rows whose job is no longer archived. Rows
// are revoked rather than deleted so a later rebuild can tell a removed job from
// one it has never processed, and so a job restored from the archive keeps its
// history.
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

	filter := bson.M{"owner.kind": owner.Kind, "owner.id": owner.ID, "revoked": bson.M{"$ne": true}}
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

// PruneTimelineMonths removes an owner's buckets that a rebuild did not
// produce. A wholesale rebuild replaces the whole set, so a month that no longer
// has activity has to disappear rather than keep its previous totals.
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

	filter := bson.M{"owner.kind": owner.Kind, "owner.id": owner.ID}
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

// PruneProductionTotals removes an owner's lifetime totals for item
// types the rebuild no longer produces.
//
// Deleted rather than revoked, unlike the per-job rows: a totals document is
// derived and holds no history of its own, so an item type with no remaining
// jobs has nothing left to say. The per-job rows keep their revoked marker,
// which is where a removed job's history survives.
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

	filter := bson.M{"owner.kind": owner.Kind, "owner.id": owner.ID}
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

// LoadProductionTotals reads an owner's lifetime totals, one row per
// item type, sorted by item type so a response is ordered the same way twice.
//
// typeID narrows to a single item when non-zero, which is the read the archive
// dialogue makes for one blueprint.
func (m *Mongo) LoadProductionTotals(ctx context.Context, owner models.Owner, typeID int, opts ...RetryOption) ([]models.ProductionTotalsRow, error) {
	if m == nil || m.StatisticsTotals == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return nil, err
	}
	coll, err := m.StatisticsTotals.requireColl()
	if err != nil {
		return nil, err
	}

	filter := bson.M{"owner.kind": owner.Kind, "owner.id": owner.ID}
	if typeID != 0 {
		filter["typeID"] = typeID
	}

	var out []models.ProductionTotalsRow
	err = Retry(ctx, applyRetryOptions("LoadProductionTotals", opts), func() error {
		out = nil
		cursor, findErr := coll.Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "typeID", Value: 1}}))
		if findErr != nil {
			return findErr
		}
		defer cursor.Close(ctx)
		return cursor.All(ctx, &out)
	})
	if err != nil {
		return nil, err
	}
	return out, nil
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
	coll, err := m.StatisticsTimeline.requireColl()
	if err != nil {
		return nil, err
	}

	var out []models.TimelineMonthBucket
	err = Retry(ctx, applyRetryOptions("LoadTimelineMonths", opts), func() error {
		out = nil
		cursor, findErr := coll.Find(ctx, bson.M{"owner.kind": owner.Kind, "owner.id": owner.ID})
		if findErr != nil {
			return findErr
		}
		defer cursor.Close(ctx)
		return cursor.All(ctx, &out)
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// archivedJobsOwnedBy filters the archived jobs an owner holds.
//
// A job document names its account rather than an owner: the owner block on
// _meta is shared-planners Stage A, and until it lands only an account can hold
// one. A kind that cannot own a job document is refused here rather than
// matching nothing, which reads as an owner with an empty archive.
func archivedJobsOwnedBy(owner models.Owner) bson.M {
	if owner.Kind != models.OwnerAccount {
		return bson.M{"_meta.accountID": nil, "_id": bson.M{"$exists": false}}
	}
	return ArchivedJobAccountFilter(owner.ID)
}
