package archivedjobs

import (
	"slices"
	"testing"

	"eve-industry-planner/shared/models"
)

// A stale link would show the account holding something it does not, and the
// next save would claim it back from its owner.
func TestConflictedLinksAreStrippedFromTheJob(t *testing.T) {
	job := models.Job{
		APIOrders:       []int{1, 2, 3},
		APIJobs:         []int{10, 11},
		APITransactions: []int{20},
	}
	conflicted := conflictIndex([]esiConflict{
		{Kind: esiLinkOrder, ID: 2, HeldBy: "job-other"},
		{Kind: esiLinkJob, ID: 11, HeldBy: "job-other"},
	})

	stripConflictedLinks(&job, conflicted)

	if !slices.Equal(job.APIOrders, []int{1, 3}) {
		t.Fatalf("apiOrders = %v, want [1 3]", job.APIOrders)
	}
	if !slices.Equal(job.APIJobs, []int{10}) {
		t.Fatalf("apiJobs = %v, want [10]", job.APIJobs)
	}
	if !slices.Equal(job.APITransactions, []int{20}) {
		t.Fatalf("apiTransactions = %v, want [20]", job.APITransactions)
	}
}

// Ids collide across the three series, so a conflict on one kind must not strip
// the same number from another.
func TestConflictsDoNotCrossLinkKinds(t *testing.T) {
	job := models.Job{
		APIOrders:       []int{7},
		APIJobs:         []int{7},
		APITransactions: []int{7},
	}
	conflicted := conflictIndex([]esiConflict{{Kind: esiLinkOrder, ID: 7, HeldBy: "job-other"}})

	stripConflictedLinks(&job, conflicted)

	if len(job.APIOrders) != 0 {
		t.Fatalf("apiOrders = %v, want the conflicted order removed", job.APIOrders)
	}
	if !slices.Equal(job.APIJobs, []int{7}) {
		t.Fatalf("apiJobs = %v — an order conflict must not strip a job id", job.APIJobs)
	}
	if !slices.Equal(job.APITransactions, []int{7}) {
		t.Fatalf("apiTransactions = %v — an order conflict must not strip a transaction id", job.APITransactions)
	}
}

// With nothing claimed elsewhere the job keeps every link it had.
func TestNoConflictsLeavesLinksUntouched(t *testing.T) {
	job := models.Job{APIOrders: []int{1, 2}, APIJobs: []int{3}}
	stripConflictedLinks(&job, conflictIndex(nil))

	if !slices.Equal(job.APIOrders, []int{1, 2}) || !slices.Equal(job.APIJobs, []int{3}) {
		t.Fatalf("links changed with no conflicts: %v %v", job.APIOrders, job.APIJobs)
	}
}

// A restored set is merged before resolution, so it checks in one pass.
func TestLinkSetsMerge(t *testing.T) {
	a := esiLinkSet{Orders: []int{1}, Jobs: []int{10}}
	b := esiLinkSet{Orders: []int{2}, Transactions: []int{20}}

	merged := a.merge(b)

	if !slices.Equal(merged.Orders, []int{1, 2}) {
		t.Fatalf("orders = %v", merged.Orders)
	}
	if !slices.Equal(merged.Jobs, []int{10}) {
		t.Fatalf("jobs = %v", merged.Jobs)
	}
	if !slices.Equal(merged.Transactions, []int{20}) {
		t.Fatalf("transactions = %v", merged.Transactions)
	}
}

// A job with no links short-circuits rather than querying.
func TestEmptyLinkSetIsEmpty(t *testing.T) {
	if !(esiLinkSet{}).empty() {
		t.Fatal("a zero link set should be empty")
	}
	if (esiLinkSet{Transactions: []int{1}}).empty() {
		t.Fatal("a set with a transaction is not empty")
	}
}

// Tolerates a nil job so callers need no guard.
func TestLinksOfJob(t *testing.T) {
	if !esiLinksOf(nil).empty() {
		t.Fatal("a nil job should yield an empty set")
	}
	links := esiLinksOf(&models.Job{APIOrders: []int{1}, APIJobs: []int{2}, APITransactions: []int{3}})
	if !slices.Equal(links.Orders, []int{1}) || !slices.Equal(links.Jobs, []int{2}) || !slices.Equal(links.Transactions, []int{3}) {
		t.Fatalf("links = %+v", links)
	}
}
