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
	Owner models.Owner
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
func (m *Mongo) QueueOwnerWork(ctx context.Context, owner models.Owner, work StatsWork, now time.Time, opts ...RetryOption) error {
	if m == nil || m.StatisticsRebuildQueue == nil {
		return fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return err
	}
	coll, err := m.StatisticsRebuildQueue.requireColl()
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
	if m == nil || m.StatisticsRebuildQueue == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	coll, err := m.StatisticsRebuildQueue.requireColl()
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
			owner, perr := models.ParseOwnerKey(row.ID)
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
	if m == nil || m.StatisticsRebuildQueue == nil {
		return false, fmt.Errorf("mongo handle is required")
	}
	if err := queued.Owner.Validate(); err != nil {
		return false, err
	}
	coll, err := m.StatisticsRebuildQueue.requireColl()
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
	if m == nil || m.StatisticsRebuildQueue == nil {
		return false, fmt.Errorf("mongo handle is required")
	}
	if err := queued.Owner.Validate(); err != nil {
		return false, err
	}
	coll, err := m.StatisticsRebuildQueue.requireColl()
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
func (m *Mongo) BumpOwnerClaim(ctx context.Context, owner models.Owner, opts ...RetryOption) error {
	if m == nil || m.StatisticsRebuildQueue == nil {
		return fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return err
	}
	coll, err := m.StatisticsRebuildQueue.requireColl()
	if err != nil {
		return err
	}
	return Retry(ctx, applyRetryOptions("BumpOwnerClaim", opts), func() error {
		_, uerr := coll.UpdateOne(ctx, queuedOwnerFilter(owner), bson.M{"$inc": bson.M{"claim": 1}})
		return uerr
	})
}

// RecalculationState is what a read tells a client about work it is waiting on.
//
// Only a rebuild is reported. After a fold became the routine path, an owner is
// in the queue briefly every time a job is archived, so reporting mere
// membership would announce a recalculation for ordinary new jobs — the opposite
// of what this is for. A fold's latency is seconds, the notification already
// covers it, and there is nothing a user could do about one.
type RecalculationState string

const (
	// RecalculationCurrent means the figures are as good as the archive.
	RecalculationCurrent RecalculationState = ""
	// RecalculationRunning means a full rebuild is outstanding, so the figures on
	// screen predate a change to how they are derived.
	RecalculationRunning RecalculationState = "recalculating"
	// RecalculationFailed means that rebuild ran out of attempts. Without it a
	// permanently failing owner shows a spinner that never resolves.
	RecalculationFailed RecalculationState = "failed"
)

// ownerWorkFailureCeiling is how many recorded failures make a rebuild failed
// rather than pending.
//
// One is enough: a failure is only recorded once asynq has exhausted its own
// retries, so the entry is written by work that has already tried and stopped.
const ownerWorkFailureCeiling = 1

// OwnerRecalculationState reports whether an owner is waiting on a rebuild, and
// whether that rebuild has given up.
//
// One lookup by `_id` on a small collection, at read time, rather than a flag
// stored on any statistics document — nothing has to remember to keep it in step
// with the queue, because it is read from the queue.
func (m *Mongo) OwnerRecalculationState(ctx context.Context, owner models.Owner, opts ...RetryOption) (RecalculationState, error) {
	if m == nil || m.StatisticsRebuildQueue == nil {
		return RecalculationCurrent, fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return RecalculationCurrent, err
	}
	coll, err := m.StatisticsRebuildQueue.requireColl()
	if err != nil {
		return RecalculationCurrent, err
	}

	state := RecalculationCurrent
	err = Retry(ctx, applyRetryOptions("OwnerRecalculationState", opts), func() error {
		state = RecalculationCurrent
		var row struct {
			Work     string `bson:"work"`
			Failures int64  `bson:"failures"`
		}
		derr := coll.FindOne(ctx, queuedOwnerFilter(owner)).Decode(&row)
		if errors.Is(derr, mongo.ErrNoDocuments) {
			return nil
		}
		if derr != nil {
			return derr
		}
		if StatsWork(row.Work) == StatsWorkDelta {
			return nil
		}
		if row.Failures >= ownerWorkFailureCeiling {
			state = RecalculationFailed
			return nil
		}
		state = RecalculationRunning
		return nil
	})
	if err != nil {
		return RecalculationCurrent, err
	}
	return state, nil
}

// RecordOwnerWorkFailure records that an owner's work stopped without finishing.
//
// The entry is left in place rather than cleared, so the work stays outstanding
// and a read can say the figures are stale. Recording it is what stops the
// retries: without a count, a permanently failing owner is dispatched, fails,
// and is dispatched again for as long as it exists.
func (m *Mongo) RecordOwnerWorkFailure(ctx context.Context, owner models.Owner, reason string, now time.Time, opts ...RetryOption) error {
	if m == nil || m.StatisticsRebuildQueue == nil {
		return fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return err
	}
	coll, err := m.StatisticsRebuildQueue.requireColl()
	if err != nil {
		return err
	}
	return Retry(ctx, applyRetryOptions("RecordOwnerWorkFailure", opts), func() error {
		_, uerr := coll.UpdateOne(ctx, queuedOwnerFilter(owner), bson.M{
			"$inc": bson.M{"failures": 1},
			"$set": bson.M{"lastError": reason, "lastFailedAt": now.UTC()},
		})
		return uerr
	})
}

// ClearOwnerWorkFailure forgets an owner's recorded failures.
//
// Called where work succeeded but could not clear its entry, because the owner
// was re-queued while it ran. The entry stands for the new request; the failures
// belong to a run that has since worked, and leaving them would report a failed
// recalculation for work that is merely outstanding.
func (m *Mongo) ClearOwnerWorkFailure(ctx context.Context, owner models.Owner, opts ...RetryOption) error {
	if m == nil || m.StatisticsRebuildQueue == nil {
		return fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return err
	}
	coll, err := m.StatisticsRebuildQueue.requireColl()
	if err != nil {
		return err
	}
	return Retry(ctx, applyRetryOptions("ClearOwnerWorkFailure", opts), func() error {
		_, uerr := coll.UpdateOne(ctx, queuedOwnerFilter(owner),
			bson.M{"$unset": bson.M{"failures": "", "lastError": "", "lastFailedAt": ""}})
		return uerr
	})
}

// queuedOwnerFilter selects one owner's queue entry.
func queuedOwnerFilter(owner models.Owner) bson.M {
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
