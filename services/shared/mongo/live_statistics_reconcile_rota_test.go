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

func TestLive_reconcileRota_dueTimeDecidesTurn(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(rotaScratchAccount)
	mongolive.ScratchAccount(t, mongo, rotaScratchAccount)

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
