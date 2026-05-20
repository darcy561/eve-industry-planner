package statistics

import (
	"net/http/httptest"
	"testing"

	"eve-industry-planner/shared/models"
)

func TestAggregateRollupFromArchivedDocs_FiltersByWindow(t *testing.T) {
	r := httptest.NewRequest("GET", "/?year=2026&month=2", nil)
	window, err := parseRollupWindow(r)
	if err != nil {
		t.Fatal(err)
	}
	docs := []models.ArchivedJobStats{
		{
			TypeID: 10,
			TransactionLines: []models.ArchivedJobTransactionLine{
				{Year: 2026, Month: 1, Quantity: 1, Amount: 10, Tax: 1, Profit: 3},
				{Year: 2026, Month: 2, Quantity: 2, Amount: 20, Tax: 2, Profit: 5},
			},
			FeeLines: []models.ArchivedJobFeeLine{
				{Year: 2026, Month: 2, Amount: 0.5},
				{Year: 2026, Month: 3, Amount: 99},
			},
		},
		{TypeID: 20, TransactionLines: []models.ArchivedJobTransactionLine{
			{Year: 2026, Month: 2, Quantity: 1, Amount: 5, Tax: 0, Profit: 1},
		}},
	}
	totals, byType := aggregateRollupFromArchivedDocs(docs, window)
	if totals.TransactionCount != 2 || totals.QuantitySold != 3 || totals.SalesTotal != 25 || totals.TransactionFeeTotal != 2 {
		t.Fatalf("totals=%+v", totals)
	}
	if totals.BrokersFeeTotal != 0.5 || totals.ProfitLoss != 5.5 {
		t.Fatalf("fee/profit totals=%+v", totals)
	}
	if len(byType) != 2 || byType[0].TypeID != 10 || byType[1].TypeID != 20 {
		t.Fatalf("byType=%+v", byType)
	}
}
