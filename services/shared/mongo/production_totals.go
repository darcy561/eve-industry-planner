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

// AccountProductionTotalsDocumentID is the _id for account_production_totals:
// accountID|typeID. One document per item type an account has built.
func AccountProductionTotalsDocumentID(accountID string, typeID int) string {
	return fmt.Sprintf("%s|%d", accountID, typeID)
}

// AccountTimelineMonthDocumentID is the _id for account_timeline_months:
// accountID|typeID|YYYY-MM, with a |chain segment on the production-chain bucket.
func AccountTimelineMonthDocumentID(accountID string, typeID, year, month int, isProductionChain bool) string {
	id := fmt.Sprintf("%s|%d|%04d-%02d", accountID, typeID, year, month)
	if isProductionChain {
		return id + "|chain"
	}
	return id
}

// ArchivedJobStatsDocumentID is the _id for account_archived_job_stats: accountID|jobID.
func ArchivedJobStatsDocumentID(accountID, jobID string) string {
	return fmt.Sprintf("%s|%s", accountID, jobID)
}

// LoadAccountArchivedJobs reads every archived job for an account, which is the
// input a wholesale statistics rebuild folds.
func (m *Mongo) LoadAccountArchivedJobs(ctx context.Context, accountID string, opts ...RetryOption) ([]models.Job, error) {
	if m == nil || m.ArchivedJobs == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	if accountID == "" {
		return nil, fmt.Errorf("accountID is required")
	}
	coll, err := m.ArchivedJobs.requireColl()
	if err != nil {
		return nil, err
	}

	var out []models.Job
	err = Retry(ctx, applyRetryOptions("LoadAccountArchivedJobs", opts), func() error {
		out = nil
		cursor, findErr := coll.Find(ctx, ArchivedJobAccountFilter(accountID))
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

// LoadAccountArchivedJobStats reads an account's existing statistics rows,
// including revoked ones, so a rebuild can tell a job it has already seen from
// one it has not.
func (m *Mongo) LoadAccountArchivedJobStats(ctx context.Context, accountID string, opts ...RetryOption) ([]models.ArchivedJobStats, error) {
	if m == nil || m.ArchivedJobStats == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	if accountID == "" {
		return nil, fmt.Errorf("accountID is required")
	}
	coll, err := m.ArchivedJobStats.requireColl()
	if err != nil {
		return nil, err
	}

	var out []models.ArchivedJobStats
	err = Retry(ctx, applyRetryOptions("LoadAccountArchivedJobStats", opts), func() error {
		out = nil
		cursor, findErr := coll.Find(ctx, bson.M{"accountID": accountID})
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

// RevokeAccountArchivedJobStats marks rows whose job is no longer archived. Rows
// are revoked rather than deleted so a later rebuild can tell a removed job from
// one it has never processed, and so a job restored from the archive keeps its
// history.
func (m *Mongo) RevokeAccountArchivedJobStats(ctx context.Context, accountID string, keepDocIDs []string, now time.Time, opts ...RetryOption) (int64, error) {
	if m == nil || m.ArchivedJobStats == nil {
		return 0, fmt.Errorf("mongo handle is required")
	}
	if accountID == "" {
		return 0, fmt.Errorf("accountID is required")
	}
	coll, err := m.ArchivedJobStats.requireColl()
	if err != nil {
		return 0, err
	}

	filter := bson.M{"accountID": accountID, "revoked": bson.M{"$ne": true}}
	if len(keepDocIDs) > 0 {
		filter["_id"] = bson.M{"$nin": keepDocIDs}
	}

	var revoked int64
	err = Retry(ctx, applyRetryOptions("RevokeAccountArchivedJobStats", opts), func() error {
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

// PruneAccountTimelineMonths removes an account's buckets that a rebuild did not
// produce. A wholesale rebuild replaces the whole set, so a month that no longer
// has activity has to disappear rather than keep its previous totals.
func (m *Mongo) PruneAccountTimelineMonths(ctx context.Context, accountID string, keepDocIDs []string, opts ...RetryOption) (int64, error) {
	if m == nil || m.AccountTimelineMonths == nil {
		return 0, fmt.Errorf("mongo handle is required")
	}
	if accountID == "" {
		return 0, fmt.Errorf("accountID is required")
	}
	coll, err := m.AccountTimelineMonths.requireColl()
	if err != nil {
		return 0, err
	}

	filter := bson.M{"accountID": accountID}
	if len(keepDocIDs) > 0 {
		filter["_id"] = bson.M{"$nin": keepDocIDs}
	}

	var deleted int64
	err = Retry(ctx, applyRetryOptions("PruneAccountTimelineMonths", opts), func() error {
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

// PruneAccountProductionTotals removes an account's lifetime totals for item
// types the rebuild no longer produces.
//
// Deleted rather than revoked, unlike the per-job rows: a totals document is
// derived and holds no history of its own, so an item type with no remaining
// jobs has nothing left to say. The per-job rows keep their revoked marker,
// which is where a removed job's history survives.
func (m *Mongo) PruneAccountProductionTotals(ctx context.Context, accountID string, keepDocIDs []string, opts ...RetryOption) (int64, error) {
	if m == nil || m.AccountProductionTotals == nil {
		return 0, fmt.Errorf("mongo handle is required")
	}
	if accountID == "" {
		return 0, fmt.Errorf("accountID is required")
	}
	coll, err := m.AccountProductionTotals.requireColl()
	if err != nil {
		return 0, err
	}

	filter := bson.M{"accountID": accountID}
	if len(keepDocIDs) > 0 {
		filter["_id"] = bson.M{"$nin": keepDocIDs}
	}

	var deleted int64
	err = Retry(ctx, applyRetryOptions("PruneAccountProductionTotals", opts), func() error {
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

// LoadAccountProductionTotals reads an account's lifetime totals, one row per
// item type, sorted by item type so a response is ordered the same way twice.
//
// typeID narrows to a single item when non-zero, which is the read the archive
// dialogue makes for one blueprint.
func (m *Mongo) LoadAccountProductionTotals(ctx context.Context, accountID string, typeID int, opts ...RetryOption) ([]models.ProductionTotalsRow, error) {
	if m == nil || m.AccountProductionTotals == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	if accountID == "" {
		return nil, fmt.Errorf("accountID is required")
	}
	coll, err := m.AccountProductionTotals.requireColl()
	if err != nil {
		return nil, err
	}

	filter := bson.M{"accountID": accountID}
	if typeID != 0 {
		filter["typeID"] = typeID
	}

	var out []models.ProductionTotalsRow
	err = Retry(ctx, applyRetryOptions("LoadAccountProductionTotals", opts), func() error {
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
