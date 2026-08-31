package archivestats

import (
	"testing"
	"time"

	"eve-industry-planner/shared/models"
)

// historyRow builds a row whose per-unit build cost is exactly costPerItem, with
// its costs filed under the given month. archivedAt is deliberately unrelated to
// that month: on imported history the two bear no relation to each other.
func historyRow(jobID string, costMonth int, costPerItem, produced float64) models.ArchivedJobStats {
	return models.ArchivedJobStats{
		ID:                "acct-1|" + jobID,
		AccountID:         "acct-1",
		JobID:             jobID,
		TypeID:            34,
		JobType:           1,
		TotalMaterialCost: costPerItem * produced,
		TotalProduced:     produced,
		CostMonth:         models.CalendarMonth{Year: 2026, Month: costMonth},
		ArchivedAt:        time.Date(2026, time.August, 31, 4, 0, 0, 0, time.UTC),
	}
}

func month26(m int) models.CalendarMonth {
	return models.CalendarMonth{Year: 2026, Month: m}
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
		historyRow("job-2", 4, 231, 1),
		historyRow("job-4", 9, 236, 1),
		historyRow("job-1", 2, 228, 1),
		historyRow("job-3", 6, 234, 1),
	}

	got := AccountBuildHistory(rows)

	if got.BuildCount != 4 {
		t.Fatalf("build count: got %d, want 4", got.BuildCount)
	}
	if got.FirstCostMonth != month26(2) {
		t.Errorf("first build: got %v, want %v", got.FirstCostMonth, month26(2))
	}
	if got.LastCostMonth != month26(9) || got.LastCostPerItem != 236 {
		t.Errorf("last build: got %v in %v, want 236 in %v", got.LastCostPerItem, got.LastCostMonth, month26(9))
	}
	if got.CheapestCostPerItem != 228 || got.CheapestCostMonth != month26(2) {
		t.Errorf("cheapest: got %v in %v, want 228 in %v", got.CheapestCostPerItem, got.CheapestCostMonth, month26(2))
	}
	if got.DearestCostPerItem != 236 || got.DearestCostMonth != month26(9) {
		t.Errorf("dearest: got %v in %v, want 236 in %v", got.DearestCostPerItem, got.DearestCostMonth, month26(9))
	}
}

// A revoked row describes a job that is no longer archived, so it cannot stand as
// a build the user made.
func TestAccountBuildHistorySkipsRevoked(t *testing.T) {
	t.Parallel()
	revoked := historyRow("job-cheap", 2, 10, 1)
	revoked.Revoked = true
	kept := historyRow("job-1", 4, 231, 1)

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

	if got.BuildCount != 0 || got.FirstCostMonth != (models.CalendarMonth{}) || got.LastCostPerItem != 0 {
		t.Fatalf("expected empty marks, got %+v", got)
	}
}

// Two builds sharing a timestamp or a cost must resolve the same way on every
// run, or a rebuild and an incremental update disagree about which is "last".
func TestAccountBuildHistoryTiesBreakOnJobID(t *testing.T) {
	t.Parallel()
	rows := []models.ArchivedJobStats{
		historyRow("job-b", 4, 200, 1),
		historyRow("job-a", 4, 200, 1),
	}
	reversed := []models.ArchivedJobStats{rows[1], rows[0]}

	if AccountBuildHistory(rows) != AccountBuildHistory(reversed) {
		t.Fatal("marks depend on row order")
	}
	if got := AccountBuildHistory(rows); got.LastCostMonth != month26(4) {
		t.Fatalf("last cost month: got %v, want %v", got.LastCostMonth, month26(4))
	}
}

// Imported history archives in an order unrelated to when the builds happened: on
// live data the most recently archived row carries costs from three years before
// the earliest archived one. Ordering on archive dates would make "last build" the
// last row written rather than the most recent build.
func TestAccountBuildHistoryOrdersOnCostMonthNotArchiveDate(t *testing.T) {
	t.Parallel()

	recentBuild := historyRow("job-early-archive", 5, 42_549, 1)
	recentBuild.ArchivedAt = time.Date(2026, time.May, 6, 0, 0, 0, 0, time.UTC)

	oldBuild := historyRow("job-late-archive", 1, 48_127, 1)
	oldBuild.ArchivedAt = time.Date(2026, time.August, 31, 0, 0, 0, 0, time.UTC)

	got := AccountBuildHistory([]models.ArchivedJobStats{recentBuild, oldBuild})

	if got.LastCostMonth != month26(5) {
		t.Fatalf("last cost month: got %v, want %v", got.LastCostMonth, month26(5))
	}
	if got.LastCostPerItem != 42_549 {
		t.Fatalf("last build cost: got %v, want the build with the later cost month", got.LastCostPerItem)
	}
	if got.FirstCostMonth != month26(1) {
		t.Fatalf("first cost month: got %v, want %v", got.FirstCostMonth, month26(1))
	}
}
