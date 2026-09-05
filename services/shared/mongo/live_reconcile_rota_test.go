package mongo_test

import (
	"context"
	"slices"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"
)

const rotaScratchAccount = "eip-parity-rota-account"

// The rota has to hold two properties against real data: an owner that has never
// been reconciled is due at once, and one just reconciled is not due again until
// the window has passed. Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_reconcileRota_dueTimeDecidesTurn(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(rotaScratchAccount)
	mongolive.ScratchAccount(t, mongo, rotaScratchAccount)

	// The rota is driven by who has rows, so the owner has to have one.
	row := models.ArchivedJobStats{
		ID:        eipmongo.ArchivedJobStatsDocumentID(models.AccountOwner(rotaScratchAccount), "job-rota-1"),
		Owner:     models.AccountOwner(rotaScratchAccount),
		JobID:     "job-rota-1",
		TypeID:    34,
		CostMonth: models.CalendarMonth{Year: 2026, Month: 5},
	}
	if _, err := mongo.StatisticsRows.UpsertStructPreservingMeta(ctx, row, row.ID); err != nil {
		t.Fatalf("seed row: %v", err)
	}

	// A generous limit: dev holds hundreds of real owners and this asserts
	// membership rather than position among them.
	const wide = 100000
	now := time.Now().UTC()

	held := func(t *testing.T, dueBefore time.Time) bool {
		t.Helper()
		due, err := mongo.OwnersDueForReconcile(ctx, dueBefore, wide)
		if err != nil {
			t.Fatalf("OwnersDueForReconcile: %v", err)
		}
		return slices.ContainsFunc(due, func(o models.Owner) bool { return o.ID == rotaScratchAccount })
	}

	if !held(t, now) {
		t.Fatal("an owner that has never been reconciled should be due")
	}

	if err := mongo.StampOwnerReconciled(ctx, owner, now); err != nil {
		t.Fatalf("StampOwnerReconciled: %v", err)
	}
	if held(t, now.Add(-24*time.Hour)) {
		t.Fatal("an owner reconciled just now is not due again inside the window")
	}
	if !held(t, now.Add(time.Hour)) {
		t.Fatal("an owner whose stamp predates the window is due again")
	}
}

// An owner with no stamp outranks a stamped one, so a newly seen owner is taken
// on the next tick rather than waiting behind the whole population.
func TestLive_reconcileRota_neverReconciledOutranksAStampedOwner(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	const fresh = rotaScratchAccount + "-fresh"
	const stamped = rotaScratchAccount + "-stamped"
	mongolive.ScratchAccount(t, mongo, fresh)
	mongolive.ScratchAccount(t, mongo, stamped)

	for _, id := range []string{fresh, stamped} {
		row := models.ArchivedJobStats{
			ID:        eipmongo.ArchivedJobStatsDocumentID(models.AccountOwner(id), "job-rota-order"),
			Owner:     models.AccountOwner(id),
			JobID:     "job-rota-order",
			TypeID:    34,
			CostMonth: models.CalendarMonth{Year: 2026, Month: 5},
		}
		if _, err := mongo.StatisticsRows.UpsertStructPreservingMeta(ctx, row, row.ID); err != nil {
			t.Fatalf("seed row for %s: %v", id, err)
		}
	}

	now := time.Now().UTC()
	// Stamped long enough ago to still be due, so both owners are in the listing
	// and only their order separates them.
	if err := mongo.StampOwnerReconciled(ctx, models.AccountOwner(stamped), now.Add(-48*time.Hour)); err != nil {
		t.Fatalf("StampOwnerReconciled: %v", err)
	}

	due, err := mongo.OwnersDueForReconcile(ctx, now.Add(-24*time.Hour), 100000)
	if err != nil {
		t.Fatalf("OwnersDueForReconcile: %v", err)
	}
	freshAt := slices.IndexFunc(due, func(o models.Owner) bool { return o.ID == fresh })
	stampedAt := slices.IndexFunc(due, func(o models.Owner) bool { return o.ID == stamped })
	if freshAt < 0 || stampedAt < 0 {
		t.Fatalf("both owners should be due; fresh at %d, stamped at %d", freshAt, stampedAt)
	}
	if freshAt > stampedAt {
		t.Fatal("an owner reconciled two days ago was offered before one never reconciled at all")
	}
}
