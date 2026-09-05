package archivedjobs

import (
	"slices"
	"testing"

	"eve-industry-planner/shared/models"
)

// jobHolding builds a job carrying the rows for the ids given, which is how a
// job holds an ESI entry.
func jobHolding(orders, linkedJobs, transactions []int64) models.Job {
	job := models.Job{}
	for _, id := range orders {
		job.Build.Sale.MarketOrders = append(job.Build.Sale.MarketOrders, models.MarketOrder{OrderID: int(id)})
	}
	for _, id := range linkedJobs {
		job.Build.Costs.LinkedJobs = append(job.Build.Costs.LinkedJobs, models.LinkedESIJob{JobID: int(id)})
	}
	for _, id := range transactions {
		job.Build.Sale.Transactions = append(job.Build.Sale.Transactions, models.Transaction{TransactionID: id})
	}
	return job
}

// A stale link would show the account holding something it does not, and the
// next save would claim it back from its owner.
func TestConflictedLinksAreStrippedFromTheJob(t *testing.T) {
	job := jobHolding([]int64{1, 2, 3}, []int64{10, 11}, []int64{20})
	conflicted := conflictIndex([]esiConflict{
		{Kind: esiLinkOrder, ID: 2, HeldBy: "job-other"},
		{Kind: esiLinkJob, ID: 11, HeldBy: "job-other"},
	})

	stripConflictedLinks(&job, conflicted)

	if !slices.Equal(job.LinkedOrderIDs(), []int64{1, 3}) {
		t.Fatalf("orders = %v, want [1 3]", job.LinkedOrderIDs())
	}
	if !slices.Equal(job.LinkedESIJobIDs(), []int64{10}) {
		t.Fatalf("linked jobs = %v, want [10]", job.LinkedESIJobIDs())
	}
	if !slices.Equal(job.LinkedTransactionIDs(), []int64{20}) {
		t.Fatalf("transactions = %v, want [20]", job.LinkedTransactionIDs())
	}
}

// Ids collide across the three series, so a conflict on one kind must not strip
// the same number from another.
func TestConflictsDoNotCrossLinkKinds(t *testing.T) {
	job := jobHolding([]int64{7}, []int64{7}, []int64{7})
	conflicted := conflictIndex([]esiConflict{{Kind: esiLinkOrder, ID: 7, HeldBy: "job-other"}})

	stripConflictedLinks(&job, conflicted)

	if len(job.LinkedOrderIDs()) != 0 {
		t.Fatalf("orders = %v, want the conflicted order removed", job.LinkedOrderIDs())
	}
	if !slices.Equal(job.LinkedESIJobIDs(), []int64{7}) {
		t.Fatalf("linked jobs = %v — an order conflict must not strip a job id", job.LinkedESIJobIDs())
	}
	if !slices.Equal(job.LinkedTransactionIDs(), []int64{7}) {
		t.Fatalf("transactions = %v — an order conflict must not strip a transaction id", job.LinkedTransactionIDs())
	}
}

// With nothing claimed elsewhere the job keeps every link it had.
func TestNoConflictsLeavesLinksUntouched(t *testing.T) {
	job := jobHolding([]int64{1, 2}, []int64{3}, nil)
	stripConflictedLinks(&job, conflictIndex(nil))

	if !slices.Equal(job.LinkedOrderIDs(), []int64{1, 2}) || !slices.Equal(job.LinkedESIJobIDs(), []int64{3}) {
		t.Fatalf("links changed with no conflicts: %v %v", job.LinkedOrderIDs(), job.LinkedESIJobIDs())
	}
}

// A restored set is merged before resolution, so it checks in one pass.
func TestLinkSetsMerge(t *testing.T) {
	a := esiLinkSet{Orders: []int64{1}, Jobs: []int64{10}}
	b := esiLinkSet{Orders: []int64{2}, Transactions: []int64{20}}

	merged := a.merge(b)

	if !slices.Equal(merged.Orders, []int64{1, 2}) {
		t.Fatalf("orders = %v", merged.Orders)
	}
	if !slices.Equal(merged.Jobs, []int64{10}) {
		t.Fatalf("jobs = %v", merged.Jobs)
	}
	if !slices.Equal(merged.Transactions, []int64{20}) {
		t.Fatalf("transactions = %v", merged.Transactions)
	}
}

// A job with no links short-circuits rather than querying.
func TestEmptyLinkSetIsEmpty(t *testing.T) {
	if !(esiLinkSet{}).empty() {
		t.Fatal("a zero link set should be empty")
	}
	if (esiLinkSet{Transactions: []int64{1}}).empty() {
		t.Fatal("a set with a transaction is not empty")
	}
}

// Tolerates a nil job so callers need no guard.
func TestLinksOfJob(t *testing.T) {
	if !esiLinksOf(nil).empty() {
		t.Fatal("a nil job should yield an empty set")
	}
	job := jobHolding([]int64{1}, []int64{2}, []int64{3})
	links := esiLinksOf(&job)
	if !slices.Equal(links.Orders, []int64{1}) || !slices.Equal(links.Jobs, []int64{2}) || !slices.Equal(links.Transactions, []int64{3}) {
		t.Fatalf("links = %+v", links)
	}
}
