package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// QueuedOwner is one owner waiting for a statistics rebuild, together with the
// claim token that was current when it was read.
type QueuedOwner struct {
	Owner models.StatsOwner
	Claim int64
	// QueuedAt is when the owner first became outstanding, not when it was last
	// changed, so a debounce measures the longest anything has waited.
	QueuedAt time.Time
}

// QueueOwnerRebuild records that an owner's build statistics need recalculating.
//
// queuedAt is preserved across re-queues so the wait time reflects when the work
// first became outstanding, but claim is bumped every time. A rebuild clears the
// owner only if the claim it read is still current, so a change arriving while
// that rebuild is in flight leaves the owner queued rather than being dropped.
func (m *Mongo) QueueOwnerRebuild(ctx context.Context, owner models.StatsOwner, now time.Time, opts ...RetryOption) error {
	if m == nil || m.AccountRebuildQueue == nil {
		return fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return err
	}
	coll, err := m.AccountRebuildQueue.requireColl()
	if err != nil {
		return err
	}

	return Retry(ctx, applyRetryOptions("QueueOwnerRebuild", opts), func() error {
		_, uerr := coll.UpdateOne(
			ctx,
			queuedOwnerFilter(owner),
			queueOwnerRebuildUpdate(owner, now),
			options.UpdateOne().SetUpsert(true),
		)
		return uerr
	})
}

// QueueAccountRebuild queues an account, the owner kind every caller outside the
// corporation work uses.
func (m *Mongo) QueueAccountRebuild(ctx context.Context, accountID string, now time.Time, opts ...RetryOption) error {
	return m.QueueOwnerRebuild(ctx, models.AccountStatsOwner(accountID), now, opts...)
}

// ListQueuedOwners returns owners waiting for a statistics rebuild with the claim
// token to pass back to ClearQueuedOwners.
//
// eligibleBefore drops entries that have not waited long enough yet: because
// queuedAt is not moved by a re-queue, that is a longest-wait bound rather than a
// sliding one, so an owner changing continuously is still rebuilt on schedule. A
// zero time reads everything waiting.
func (m *Mongo) ListQueuedOwners(ctx context.Context, eligibleBefore time.Time, opts ...RetryOption) ([]QueuedOwner, error) {
	if m == nil || m.AccountRebuildQueue == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	coll, err := m.AccountRebuildQueue.requireColl()
	if err != nil {
		return nil, err
	}

	filter := bson.M{}
	if !eligibleBefore.IsZero() {
		filter["queuedAt"] = bson.M{"$lte": eligibleBefore.UTC()}
	}

	var out []QueuedOwner
	err = Retry(ctx, applyRetryOptions("ListQueuedOwners", opts), func() error {
		out = nil
		cursor, findErr := coll.Find(ctx, filter)
		if findErr != nil {
			return findErr
		}
		defer cursor.Close(ctx)

		for cursor.Next(ctx) {
			var row struct {
				ID       string    `bson:"_id"`
				Claim    int64     `bson:"claim"`
				QueuedAt time.Time `bson:"queuedAt"`
			}
			if decErr := cursor.Decode(&row); decErr != nil {
				return decErr
			}
			owner, perr := models.ParseStatsOwnerKey(row.ID)
			if perr != nil {
				// An entry nothing can address cannot be rebuilt or cleared by
				// key, so it is skipped rather than failing the whole read.
				continue
			}
			out = append(out, QueuedOwner{Owner: owner, Claim: row.Claim, QueuedAt: row.QueuedAt})
		}
		return cursor.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ClearQueuedOwner removes one owner whose rebuild has completed, but only where
// the claim still matches the one read at the start of that rebuild.
//
// Reports whether the entry was removed: false means the owner was re-queued
// mid-rebuild and keeps its place, so the request that arrived is not lost.
func (m *Mongo) ClearQueuedOwner(ctx context.Context, queued QueuedOwner, opts ...RetryOption) (bool, error) {
	if m == nil || m.AccountRebuildQueue == nil {
		return false, fmt.Errorf("mongo handle is required")
	}
	if err := queued.Owner.Validate(); err != nil {
		return false, err
	}
	coll, err := m.AccountRebuildQueue.requireColl()
	if err != nil {
		return false, err
	}

	var deleted int64
	err = Retry(ctx, applyRetryOptions("ClearQueuedOwner", opts), func() error {
		deleted = 0
		result, derr := coll.DeleteOne(ctx, clearQueuedOwnerFilter(queued))
		if derr != nil {
			return derr
		}
		if result != nil {
			deleted = result.DeletedCount
		}
		return nil
	})
	if err != nil {
		return false, err
	}
	return deleted > 0, nil
}

// ClearQueuedOwners clears a set of owners, reporting how many were removed.
//
// The difference against len(owners) is how many were re-queued mid-rebuild and
// remain outstanding.
func (m *Mongo) ClearQueuedOwners(ctx context.Context, owners []QueuedOwner, opts ...RetryOption) (int64, error) {
	if m == nil || m.AccountRebuildQueue == nil {
		return 0, fmt.Errorf("mongo handle is required")
	}
	if len(owners) == 0 {
		return 0, nil
	}
	coll, err := m.AccountRebuildQueue.requireColl()
	if err != nil {
		return 0, err
	}

	writes := make([]mongo.WriteModel, 0, len(owners))
	for _, queued := range owners {
		if queued.Owner.Validate() != nil {
			continue
		}
		writes = append(writes, mongo.NewDeleteOneModel().
			SetFilter(clearQueuedOwnerFilter(queued)))
	}
	if len(writes) == 0 {
		return 0, nil
	}

	var deleted int64
	err = Retry(ctx, applyRetryOptions("ClearQueuedOwners", opts), func() error {
		deleted = 0
		result, berr := coll.BulkWrite(ctx, writes, options.BulkWrite().SetOrdered(false))
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

// queuedOwnerFilter selects one owner's queue entry.
func queuedOwnerFilter(owner models.StatsOwner) bson.M {
	return bson.M{"_id": owner.Key()}
}

// queueOwnerRebuildUpdate preserves the first queuedAt while bumping the claim on
// every request, so wait time measures the oldest outstanding request and a
// request arriving mid-rebuild still invalidates that rebuild's claim.
//
// The owner is written out as well as being the key, so the queue can be read
// without every consumer parsing ids.
func queueOwnerRebuildUpdate(owner models.StatsOwner, now time.Time) bson.M {
	return bson.M{
		"$setOnInsert": bson.M{"queuedAt": now.UTC(), "owner": owner},
		"$inc":         bson.M{"claim": 1},
	}
}

// clearQueuedOwnerFilter matches only an entry still on the claim the rebuild
// read, so an owner re-queued mid-rebuild survives the clear.
func clearQueuedOwnerFilter(queued QueuedOwner) bson.M {
	return bson.M{"_id": queued.Owner.Key(), "claim": queued.Claim}
}
