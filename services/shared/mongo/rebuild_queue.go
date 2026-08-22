package mongo

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// QueuedAccount is one account waiting for a statistics rebuild, together with the
// claim token that was current when it was read.
type QueuedAccount struct {
	AccountID string
	Claim     int64
}

// QueueAccountRebuild records that accountID's build statistics need recalculating.
//
// queuedAt is preserved across re-queues so the wait time reflects when the work
// first became outstanding, but claim is bumped every time. A rebuild clears the
// account only if the claim it read is still current, so a change arriving while
// that rebuild is in flight leaves the account queued rather than being dropped.
func (m *Mongo) QueueAccountRebuild(ctx context.Context, accountID string, now time.Time, opts ...RetryOption) error {
	if m == nil || m.AccountRebuildQueue == nil {
		return fmt.Errorf("mongo handle is required")
	}
	if accountID == "" {
		return fmt.Errorf("accountID is required")
	}
	coll, err := m.AccountRebuildQueue.requireColl()
	if err != nil {
		return err
	}

	return Retry(ctx, applyRetryOptions("QueueAccountRebuild", opts), func() error {
		_, uerr := coll.UpdateOne(
			ctx,
			bson.M{"_id": accountID},
			bson.M{
				"$setOnInsert": bson.M{"queuedAt": now},
				"$inc":         bson.M{"claim": 1},
			},
			options.UpdateOne().SetUpsert(true),
		)
		return uerr
	})
}

// ListQueuedAccounts returns every account waiting for a statistics rebuild with
// the claim token to pass back to ClearQueuedAccounts.
func (m *Mongo) ListQueuedAccounts(ctx context.Context, opts ...RetryOption) ([]QueuedAccount, error) {
	if m == nil || m.AccountRebuildQueue == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	coll, err := m.AccountRebuildQueue.requireColl()
	if err != nil {
		return nil, err
	}

	var out []QueuedAccount
	err = Retry(ctx, applyRetryOptions("ListQueuedAccounts", opts), func() error {
		out = nil
		cursor, findErr := coll.Find(ctx, bson.M{})
		if findErr != nil {
			return findErr
		}
		defer cursor.Close(ctx)

		for cursor.Next(ctx) {
			var row struct {
				ID    string `bson:"_id"`
				Claim int64  `bson:"claim"`
			}
			if decErr := cursor.Decode(&row); decErr != nil {
				return decErr
			}
			if row.ID == "" {
				continue
			}
			out = append(out, QueuedAccount{AccountID: row.ID, Claim: row.Claim})
		}
		return cursor.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ClearQueuedAccounts removes accounts whose rebuild has completed, but only where
// the claim still matches the one read at the start of that rebuild. An account
// re-queued in the meantime keeps its place, so no request is lost.
//
// The count returned is how many were cleared; the difference against len(accounts)
// is how many were re-queued mid-rebuild and remain outstanding.
func (m *Mongo) ClearQueuedAccounts(ctx context.Context, accounts []QueuedAccount, opts ...RetryOption) (int64, error) {
	if m == nil || m.AccountRebuildQueue == nil {
		return 0, fmt.Errorf("mongo handle is required")
	}
	if len(accounts) == 0 {
		return 0, nil
	}
	coll, err := m.AccountRebuildQueue.requireColl()
	if err != nil {
		return 0, err
	}

	models := make([]mongo.WriteModel, 0, len(accounts))
	for _, a := range accounts {
		if a.AccountID == "" {
			continue
		}
		models = append(models, mongo.NewDeleteOneModel().
			SetFilter(bson.M{"_id": a.AccountID, "claim": a.Claim}))
	}
	if len(models) == 0 {
		return 0, nil
	}

	var deleted int64
	err = Retry(ctx, applyRetryOptions("ClearQueuedAccounts", opts), func() error {
		deleted = 0
		result, berr := coll.BulkWrite(ctx, models, options.BulkWrite().SetOrdered(false))
		if berr != nil {
			return berr
		}
		if result != nil {
			deleted = result.DeletedCount
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return deleted, nil
}
