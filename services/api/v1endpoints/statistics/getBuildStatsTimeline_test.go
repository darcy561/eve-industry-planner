package statistics

import (
	"testing"

	"eve-industry-planner/shared/models"
)

func TestAggregateBuildStatsTimeline_SortsAndAggregates(t *testing.T) {
	docs := []models.ArchivedJobStats{
		{
			TransactionLines: []models.ArchivedJobTransactionLine{
				{Year: 2026, Month: 2, Quantity: 2, Amount: 20, Tax: 1, Profit: 5},
			},
			FeeLines: []models.ArchivedJobFeeLine{
				{Year: 2026, Month: 2, Amount: 0.5},
			},
		},
		{
			TransactionLines: []models.ArchivedJobTransactionLine{
				{Year: 2026, Month: 1, Quantity: 3, Amount: 30, Tax: 2, Profit: 7},
				{Year: 2026, Month: 2, Quantity: 1, Amount: 10, Tax: 0.5, Profit: 2},
			},
			FeeLines: []models.ArchivedJobFeeLine{
				{Year: 2026, Month: 1, Amount: 1.0},
			},
		},
	}

	out := aggregateBuildStatsTimeline(docs)
	if len(out) != 2 {
		t.Fatalf("expected 2 buckets, got %d", len(out))
	}
	if out[0].Year != 2026 || out[0].Month != 1 {
		t.Fatalf("expected first bucket 2026-01, got %d-%02d", out[0].Year, out[0].Month)
	}
	if out[1].Year != 2026 || out[1].Month != 2 {
		t.Fatalf("expected second bucket 2026-02, got %d-%02d", out[1].Year, out[1].Month)
	}

	jan := out[0]
	if jan.TransactionCount != 1 || jan.QuantitySold != 3 || jan.SalesTotal != 30 || jan.TransactionFeeTotal != 2 || jan.BrokersFeeTotal != 1.0 || jan.ProfitLoss != 6 {
		t.Fatalf("unexpected january aggregate: %+v", jan)
	}
	feb := out[1]
	if feb.TransactionCount != 2 || feb.QuantitySold != 3 || feb.SalesTotal != 30 || feb.TransactionFeeTotal != 1.5 || feb.BrokersFeeTotal != 0.5 || feb.ProfitLoss != 6.5 {
		t.Fatalf("unexpected february aggregate: %+v", feb)
	}
}
