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
type StatsWork string

const (
	StatsWorkDelta   StatsWork = "delta"
	StatsWorkRebuild StatsWork = "rebuild"
)

// QueuedOwner is one owner waiting for statistics work, together with the claim
// token that was current when it was read.
type QueuedOwner struct {
	Owner    models.Owner
	Work     StatsWork
	Claim    int64
	QueuedAt time.Time
}

// QueueOwnerWork records that an owner has statistics work outstanding.
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
		_, uerr = coll.UpdateOne(ctx,
			bson.M{"_id": owner.Key(), "work": string(StatsWorkDelta)},
			bson.M{"$set": bson.M{"work": string(StatsWorkRebuild)}},
		)
		return uerr
	})
}

// ListQueuedOwners returns owners waiting for statistics work with the claim token to pass back to
// ClearQueuedOwner.
func (m *Mongo) ListQueuedOwners(ctx context.Context, eligibleBefore time.Time, opts ...RetryOption) ([]QueuedOwner, error) {
	if m == nil || m.StatisticsRebuildQueue == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	filter := bson.M{}
	if !eligibleBefore.IsZero() {
		filter["queuedAt"] = bson.M{"$lte": eligibleBefore.UTC()}
	}
	rows, err := findAll[struct {
		ID       string    `bson:"_id"`
		Claim    int64     `bson:"claim"`
		Work     string    `bson:"work"`
		QueuedAt time.Time `bson:"queuedAt"`
	}](ctx, m.StatisticsRebuildQueue, applyRetryOptions("ListQueuedOwners", opts), filter)
	if err != nil {
		return nil, err
	}
	var out []QueuedOwner
	for _, row := range rows {
		owner, perr := models.ParseOwnerKey(row.ID)
		if perr != nil {
			continue
		}
		work := StatsWork(row.Work)
		if work != StatsWorkDelta && work != StatsWorkRebuild {
			work = StatsWorkRebuild
		}
		out = append(out, QueuedOwner{Owner: owner, Work: work, Claim: row.Claim, QueuedAt: row.QueuedAt})
	}
	return out, nil
}

// ClearQueuedOwner removes one owner whose work has completed, but only where the claim still
// matches the one that work was dispatched with.
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

// OwnerClaimIsCurrent reports whether the owner's entry is still the one this task was dispatched
// from.
func (m *Mongo) OwnerClaimIsCurrent(ctx context.Context, queued QueuedOwner, opts ...RetryOption) (bool, error) {
	if m == nil || m.StatisticsRebuildQueue == nil {
		return false, fmt.Errorf("mongo handle is required")
	}
	if err := queued.Owner.Validate(); err != nil {
		return false, err
	}
	_, err := findOne[bson.M](ctx, m.StatisticsRebuildQueue, applyRetryOptions("OwnerClaimIsCurrent", opts), clearQueuedOwnerFilter(queued),
		options.FindOne().SetProjection(bson.M{"_id": 1}))
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// BumpOwnerClaim invalidates whatever an owner's queued work was dispatched with, without queueing
// anything itself.
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
type RecalculationState string

const (
	// RecalculationCurrent means the figures are as good as the archive.
	RecalculationCurrent RecalculationState = ""
	// RecalculationRunning means a full rebuild is outstanding.
	RecalculationRunning RecalculationState = "recalculating"
	// RecalculationFailed means that rebuild ran out of attempts.
	RecalculationFailed RecalculationState = "failed"
)

// ownerWorkFailureCeiling is how many recorded failures make a rebuild failed rather than pending.
const ownerWorkFailureCeiling = 1

// OwnerRecalculationState reports whether an owner is waiting on a rebuild, and whether that
// rebuild has given up.
func (m *Mongo) OwnerRecalculationState(ctx context.Context, owner models.Owner, opts ...RetryOption) (RecalculationState, error) {
	if m == nil || m.StatisticsRebuildQueue == nil {
		return RecalculationCurrent, fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return RecalculationCurrent, err
	}
	row, err := findOne[struct {
		Work     string `bson:"work"`
		Failures int64  `bson:"failures"`
	}](ctx, m.StatisticsRebuildQueue, applyRetryOptions("OwnerRecalculationState", opts), queuedOwnerFilter(owner))
	switch {
	case errors.Is(err, mongo.ErrNoDocuments):
		return RecalculationCurrent, nil
	case err != nil:
		return RecalculationCurrent, err
	case StatsWork(row.Work) == StatsWorkDelta:
		return RecalculationCurrent, nil
	case row.Failures >= ownerWorkFailureCeiling:
		return RecalculationFailed, nil
	default:
		return RecalculationRunning, nil
	}
}

// RecordOwnerWorkFailure records that an owner's work stopped without finishing.
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

// queueOwnerWorkUpdate keeps the first queuedAt and bumps the claim on every request, so a request
// arriving mid-rebuild invalidates that rebuild's claim.
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
