package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Document _id builders for the statistics collections. These are the contract
// between the workers that write and the API that reads; build every _id here
// rather than formatting one at a call site.

// BuildStatsDocumentID is the Mongo _id for collection build_stats: accountID|typeID.
// Must stay in sync with worker archived-jobs aggregation (ProcessBuildStats).
func BuildStatsDocumentID(accountID string, typeID int) string {
	return fmt.Sprintf("%s|%d", accountID, typeID)
}

// UserRollupMonthlyDocumentID is the _id for user_rollup_buckets: accountID|typeID|YYYY-MM.
func UserRollupMonthlyDocumentID(accountID string, typeID, year, month int) string {
	return fmt.Sprintf("%s|%d|%04d-%02d", accountID, typeID, year, month)
}

// ArchivedJobStatsDocumentID is the _id for user_archived_job_stats: accountID|jobID.
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

// PruneAccountRollupBuckets removes an account's buckets that a rebuild did not
// produce. A wholesale rebuild replaces the whole set, so a month that no longer
// has activity has to disappear rather than keep its previous totals.
func (m *Mongo) PruneAccountRollupBuckets(ctx context.Context, accountID string, keepDocIDs []string, opts ...RetryOption) (int64, error) {
	if m == nil || m.UserRollupBuckets == nil {
		return 0, fmt.Errorf("mongo handle is required")
	}
	if accountID == "" {
		return 0, fmt.Errorf("accountID is required")
	}
	coll, err := m.UserRollupBuckets.requireColl()
	if err != nil {
		return 0, err
	}

	filter := bson.M{"accountID": accountID}
	if len(keepDocIDs) > 0 {
		filter["_id"] = bson.M{"$nin": keepDocIDs}
	}

	var deleted int64
	err = Retry(ctx, applyRetryOptions("PruneAccountRollupBuckets", opts), func() error {
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
