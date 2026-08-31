package archivestats

import (
	"testing"
	"time"

	"eve-industry-planner/shared/models"
)

func at(day int) time.Time {
	return time.Date(2026, time.March, day, 12, 0, 0, 0, time.UTC)
}

// historyRow builds a row whose per-unit build cost is exactly costPerItem.
func historyRow(jobID string, day int, costPerItem, produced float64) models.ArchivedJobStats {
	return models.ArchivedJobStats{
		ID:                "acct-1|" + jobID,
		AccountID:         "acct-1",
		JobID:             jobID,
		TypeID:            34,
		JobType:           1,
		TotalMaterialCost: costPerItem * produced,
		TotalProduced:     produced,
		ArchivedAt:        at(day),
	}
}

func TestBuildCostPerItemExcludesSaleSideFees(t *testing.T) {
	t.Parallel()
	row := historyRow("job-1", 2, 100, 4)
	row.FeeLines = []models.ArchivedJobFeeLine{{Amount: 999}}
	row.TransactionLines = []models.ArchivedJobTransactionLine{{Amount: 5000, Tax: 250, Quantity: 4}}

	got, ok := BuildCostPerItem(row)
	if !ok {
		t.Fatal("expected a per-unit cost")
	}
	if got != 100 {
		t.Fatalf("broker and transaction fees reached build cost: got %v, want 100", got)
	}
}

func TestBuildCostPerItemReportsNoOutput(t *testing.T) {
	t.Parallel()
	if _, ok := BuildCostPerItem(historyRow("job-1", 2, 100, 0)); ok {
		t.Fatal("a row that produced nothing has no per-unit cost")
	}
}

func TestAccountBuildHistoryMarks(t *testing.T) {
	t.Parallel()
	rows := []models.ArchivedJobStats{
		historyRow("job-2", 9, 231, 1),
		historyRow("job-4", 27, 236, 1),
		historyRow("job-1", 2, 228, 1),
		historyRow("job-3", 18, 234, 1),
	}

	got := AccountBuildHistory(rows)

	if got.BuildCount != 4 {
		t.Fatalf("build count: got %d, want 4", got.BuildCount)
	}
	if !got.FirstBuildAt.Equal(at(2)) {
		t.Errorf("first build: got %v, want %v", got.FirstBuildAt, at(2))
	}
	if !got.LastBuildAt.Equal(at(27)) || got.LastCostPerItem != 236 {
		t.Errorf("last build: got %v at %v, want 236 at %v", got.LastCostPerItem, got.LastBuildAt, at(27))
	}
	if got.CheapestCostPerItem != 228 || !got.CheapestBuildAt.Equal(at(2)) {
		t.Errorf("cheapest: got %v at %v, want 228 at %v", got.CheapestCostPerItem, got.CheapestBuildAt, at(2))
	}
	if got.DearestCostPerItem != 236 || !got.DearestBuildAt.Equal(at(27)) {
		t.Errorf("dearest: got %v at %v, want 236 at %v", got.DearestCostPerItem, got.DearestBuildAt, at(27))
	}
}

// A revoked row describes a job that is no longer archived, so it cannot stand as
// a build the user made.
func TestAccountBuildHistorySkipsRevoked(t *testing.T) {
	t.Parallel()
	revoked := historyRow("job-cheap", 2, 10, 1)
	revoked.Revoked = true
	kept := historyRow("job-1", 9, 231, 1)

	got := AccountBuildHistory([]models.ArchivedJobStats{revoked, kept})

	if got.BuildCount != 1 {
		t.Fatalf("build count: got %d, want 1", got.BuildCount)
	}
	if got.CheapestCostPerItem != 231 {
		t.Fatalf("a revoked row reached the marks: cheapest %v", got.CheapestCostPerItem)
	}
}

// Chain intermediates are builds of the item and carry their own cost, so they
// stand as history for an item only ever built that way.
func TestAccountBuildHistoryCountsChainBuilds(t *testing.T) {
	t.Parallel()
	chain := historyRow("job-1", 3, 180, 2)
	chain.IsProductionChain = true

	got := AccountBuildHistory([]models.ArchivedJobStats{chain})

	if got.BuildCount != 1 {
		t.Fatalf("build count: got %d, want 1", got.BuildCount)
	}
	if got.LastCostPerItem != 180 || got.CheapestCostPerItem != 180 {
		t.Fatalf("chain build missing from marks: last %v, cheapest %v",
			got.LastCostPerItem, got.CheapestCostPerItem)
	}
}

func TestAccountBuildHistoryEmptyWithoutBuilds(t *testing.T) {
	t.Parallel()
	noOutput := historyRow("job-1", 2, 100, 0)

	got := AccountBuildHistory([]models.ArchivedJobStats{noOutput})

	if got.BuildCount != 0 || !got.FirstBuildAt.IsZero() || got.LastCostPerItem != 0 {
		t.Fatalf("expected empty marks, got %+v", got)
	}
}

// Two builds sharing a timestamp or a cost must resolve the same way on every
// run, or a rebuild and an incremental update disagree about which is "last".
func TestAccountBuildHistoryTiesBreakOnJobID(t *testing.T) {
	t.Parallel()
	rows := []models.ArchivedJobStats{
		historyRow("job-b", 9, 200, 1),
		historyRow("job-a", 9, 200, 1),
	}
	reversed := []models.ArchivedJobStats{rows[1], rows[0]}

	if AccountBuildHistory(rows) != AccountBuildHistory(reversed) {
		t.Fatal("marks depend on row order")
	}
	if got := AccountBuildHistory(rows); got.LastBuildAt != at(9) {
		t.Fatalf("last build at: got %v, want %v", got.LastBuildAt, at(9))
	}
}
