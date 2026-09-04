package mongo

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// StatisticsOwners returns every owner that has statistics rows.
//
// The rows are the authority for what an owner's aggregates should be, so an
// owner that has rows is an owner worth reconciling — including one whose
// aggregate documents have gone missing entirely, which reading the aggregates
// instead would never find.
func (m *Mongo) StatisticsOwners(ctx context.Context, opts ...RetryOption) ([]models.Owner, error) {
	if m == nil || m.ArchivedJobStats == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	ids, err := m.ArchivedJobStats.DistinctStrings(ctx, "accountID", nil, opts...)
	if err != nil {
		return nil, fmt.Errorf("list statistics owners: %w", err)
	}
	out := make([]models.Owner, 0, len(ids))
	for _, id := range ids {
		out = append(out, models.AccountOwner(id))
	}
	return out, nil
}

// OwnersDueForReconcile returns the owners whose last reconcile is older than
// dueBefore, oldest first, up to limit.
//
// An owner with no stamp has never been reconciled and sorts ahead of every
// stamped one, so a newly seen owner is taken on the next tick rather than
// waiting out a window. Ordering by stamp is what keeps load flat without the
// tick and the window having to agree on anything: an owner reconciled now is
// not due again until the window has passed, so the population spreads itself.
func (m *Mongo) OwnersDueForReconcile(ctx context.Context, dueBefore time.Time, limit int, opts ...RetryOption) ([]models.Owner, error) {
	if limit <= 0 {
		return nil, nil
	}
	owners, err := m.StatisticsOwners(ctx, opts...)
	if err != nil {
		return nil, err
	}
	stamps, err := m.reconcileStamps(ctx, opts...)
	if err != nil {
		return nil, err
	}

	due := make([]models.Owner, 0, len(owners))
	for _, owner := range owners {
		if at, stamped := stamps[owner.Key()]; stamped && !at.Before(dueBefore.UTC()) {
			continue
		}
		due = append(due, owner)
	}
	slices.SortFunc(due, func(a, b models.Owner) int {
		at, bt := stamps[a.Key()], stamps[b.Key()]
		if !at.Equal(bt) {
			return at.Compare(bt)
		}
		return cmp.Compare(a.Key(), b.Key())
	})
	if len(due) > limit {
		due = due[:limit]
	}
	return due, nil
}

// StampOwnerReconciled records that an owner's aggregates were just rewritten
// from its rows, which is what takes it out of the due set until the window has
// passed again.
func (m *Mongo) StampOwnerReconciled(ctx context.Context, owner models.Owner, now time.Time, opts ...RetryOption) error {
	if m == nil || m.AccountReconcileRota == nil {
		return fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return err
	}
	coll, err := m.AccountReconcileRota.requireColl()
	if err != nil {
		return err
	}
	return Retry(ctx, applyRetryOptions("StampOwnerReconciled", opts), func() error {
		_, uerr := coll.UpdateOne(ctx,
			bson.M{"_id": owner.Key()},
			bson.M{"$set": bson.M{"reconciledAt": now.UTC()}},
			options.UpdateOne().SetUpsert(true),
		)
		return uerr
	})
}

// reconcileStamps reads when each owner was last reconciled.
func (m *Mongo) reconcileStamps(ctx context.Context, opts ...RetryOption) (map[string]time.Time, error) {
	if m == nil || m.AccountReconcileRota == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	coll, err := m.AccountReconcileRota.requireColl()
	if err != nil {
		return nil, err
	}

	out := map[string]time.Time{}
	err = Retry(ctx, applyRetryOptions("reconcileStamps", opts), func() error {
		clear(out)
		cursor, ferr := coll.Find(ctx, bson.M{})
		if ferr != nil {
			return ferr
		}
		defer cursor.Close(ctx)
		for cursor.Next(ctx) {
			var row struct {
				ID           string    `bson:"_id"`
				ReconciledAt time.Time `bson:"reconciledAt"`
			}
			if decErr := cursor.Decode(&row); decErr != nil {
				return decErr
			}
			out[row.ID] = row.ReconciledAt
		}
		return cursor.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
