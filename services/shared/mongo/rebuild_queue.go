package mongo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// StatsWork names what an owner is waiting for.
//
// The two differ in cost and in what they mean to a reader: a delta is seconds of
// work nobody needs to be told about, a rebuild re-derives everything and is
// worth reporting. One queue carries both because the claim protocol, the wait
// time and the dispatcher are per owner either way.
type StatsWork string

const (
	StatsWorkDelta   StatsWork = "delta"
	StatsWorkRebuild StatsWork = "rebuild"
)

// QueuedOwner is one owner waiting for statistics work, together with the claim
// token that was current when it was read.
type QueuedOwner struct {
	Owner models.StatsOwner
	Work  StatsWork
	Claim int64
	// QueuedAt is when the owner first became outstanding, not when it was last
	// changed, so a debounce measures the longest anything has waited.
	QueuedAt time.Time
}

// QueueOwnerWork records that an owner has statistics work outstanding.
//
// A rebuild supersedes a delta: it re-derives every row from its jobs and stamps
// them, so it already accounts for whatever the deltas would have applied.
// Upgrading an entry is therefore lossless, and the reverse never happens — a
// delta arriving against a queued rebuild leaves the rebuild in place.
func (m *Mongo) QueueOwnerWork(ctx context.Context, owner models.StatsOwner, work StatsWork, now time.Time, opts ...RetryOption) error {
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

	return Retry(ctx, applyRetryOptions("QueueOwnerWork", opts), func() error {
		_, uerr := coll.UpdateOne(
			ctx,
			queuedOwnerFilter(owner),
			queueOwnerWorkUpdate(work, now),
			options.UpdateOne().SetUpsert(true),
		)
		if uerr != nil || work != StatsWorkRebuild {
			return uerr
		}
		// Upgrade an entry already waiting on a delta. Separate from the upsert
		// because $setOnInsert cannot raise a field on a document that exists.
		_, uerr = coll.UpdateOne(ctx,
			bson.M{"_id": owner.Key(), "work": string(StatsWorkDelta)},
			bson.M{"$set": bson.M{"work": string(StatsWorkRebuild)}},
		)
		return uerr
	})
}

// ListQueuedOwners returns owners waiting for statistics work with the claim
// token to pass back to ClearQueuedOwner.
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
				Work     string    `bson:"work"`
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
			work := StatsWork(row.Work)
			if work != StatsWorkDelta && work != StatsWorkRebuild {
				// Rebuild is the safe reading of an unrecognised kind: it derives
				// every figure from the rows, so it covers whatever was meant.
				work = StatsWorkRebuild
			}
			out = append(out, QueuedOwner{Owner: owner, Work: work, Claim: row.Claim, QueuedAt: row.QueuedAt})
		}
		return cursor.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ClearQueuedOwner removes one owner whose work has completed, but only where the
// claim still matches the one that work was dispatched with.
//
// Reports whether the entry was removed: false means the owner was re-queued
// while the work ran and keeps its place, so the request that arrived is not
// lost.
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

// OwnerClaimIsCurrent reports whether the owner's entry is still the one this
// task was dispatched from.
//
// It shares its filter with [Mongo.ClearQueuedOwner], so a caller may write
// exactly when it would still be allowed to finish. False means the owner was
// re-queued, upgraded to a rebuild, or swept by one, and whatever took it on
// accounts for the same rows.
func (m *Mongo) OwnerClaimIsCurrent(ctx context.Context, queued QueuedOwner, opts ...RetryOption) (bool, error) {
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

	var current bool
	err = Retry(ctx, applyRetryOptions("OwnerClaimIsCurrent", opts), func() error {
		current = false
		ferr := coll.FindOne(ctx, clearQueuedOwnerFilter(queued)).Err()
		if errors.Is(ferr, mongo.ErrNoDocuments) {
			return nil
		}
		if ferr != nil {
			return ferr
		}
		current = true
		return nil
	})
	if err != nil {
		return false, err
	}
	return current, nil
}

// BumpOwnerClaim invalidates whatever an owner's queued work was dispatched
// with, without queueing anything itself.
//
// A writer that derives an owner's aggregates from its rows — a reconcile —
// accounts for every row a fold might be holding, so that fold must not also
// apply them. Bumping the claim is what the fold already reads as "something
// else took this owner on". There is no upsert: with no entry there is no work
// in flight to invalidate, and creating one would invent work nothing asked for.
func (m *Mongo) BumpOwnerClaim(ctx context.Context, owner models.StatsOwner, opts ...RetryOption) error {
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
	return Retry(ctx, applyRetryOptions("BumpOwnerClaim", opts), func() error {
		_, uerr := coll.UpdateOne(ctx, queuedOwnerFilter(owner), bson.M{"$inc": bson.M{"claim": 1}})
		return uerr
	})
}

// queuedOwnerFilter selects one owner's queue entry.
func queuedOwnerFilter(owner models.StatsOwner) bson.M {
	return bson.M{"_id": owner.Key()}
}

// queueOwnerWorkUpdate preserves the first queuedAt while bumping the claim on
// every request, so wait time measures the oldest outstanding request and a
// request arriving mid-rebuild still invalidates that rebuild's claim.
func queueOwnerWorkUpdate(work StatsWork, now time.Time) bson.M {
	return bson.M{
		"$setOnInsert": bson.M{"queuedAt": now.UTC(), "work": string(work)},
		"$inc":         bson.M{"claim": 1},
	}
}

// clearQueuedOwnerFilter matches only an entry still on the claim its work was
// dispatched with, so an owner re-queued while that work ran survives the clear.
func clearQueuedOwnerFilter(queued QueuedOwner) bson.M {
	return bson.M{"_id": queued.Owner.Key(), "claim": queued.Claim}
}
