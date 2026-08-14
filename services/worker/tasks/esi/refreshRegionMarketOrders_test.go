package tasks

import (
	"context"
	"testing"
)

func TestRefreshRegionMarketOrders_NilTask(t *testing.T) {
	if err := RefreshRegionMarketOrders(context.Background(), nil, &TaskDependencies{}); err == nil {
		t.Fatal("expected error for nil task")
	}
}

func TestRefreshRegionMarketOrders_MissingParameters(t *testing.T) {
	tests := []struct {
		name      string
		regionID  int32
		stationID int64
	}{
		{name: "no region", regionID: 0, stationID: 60003760},
		{name: "no station", regionID: 10000002, stationID: 0},
		{name: "neither", regionID: 0, stationID: 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			task := createMockTask("refreshRegionMarketOrders", map[string]any{
				"region_id":  tc.regionID,
				"station_id": tc.stationID,
			})

			err := RefreshRegionMarketOrders(context.Background(), task, &TaskDependencies{})
			if err == nil {
				t.Fatal("expected error for incomplete request")
			}
		})
	}
}

func TestPercentilePrice_FallsBackBelowMinimumSample(t *testing.T) {
	prices := []float64{10, 20, 30}
	fallback := 99.0

	if got := percentilePrice(prices, buyPercentile, fallback); got != fallback {
		t.Fatalf("percentilePrice with %d samples = %v, want fallback %v", len(prices), got, fallback)
	}
}

func TestPercentilePrice_NearestRank(t *testing.T) {
	// Ten prices: the 95th percentile is the highest, the 5th percentile the lowest.
	prices := []float64{5, 1, 9, 3, 7, 2, 8, 4, 10, 6}

	if got := percentilePrice(prices, buyPercentile, 0); got != 10 {
		t.Fatalf("buy percentile = %v, want 10", got)
	}
	if got := percentilePrice(prices, sellPercentile, 0); got != 1 {
		t.Fatalf("sell percentile = %v, want 1", got)
	}
}

func TestPercentilePrice_DoesNotMutateInput(t *testing.T) {
	prices := []float64{30, 10, 20, 50, 40}
	original := append([]float64(nil), prices...)

	percentilePrice(prices, buyPercentile, 0)

	for i := range original {
		if prices[i] != original[i] {
			t.Fatalf("percentilePrice mutated input at %d: got %v, want %v", i, prices[i], original[i])
		}
	}
}

func TestBuildMarketPriceEntry_BestPrices(t *testing.T) {
	acc := &typePriceAccumulator{
		buyPrices:  []float64{100, 120, 90},
		sellPrices: []float64{200, 180, 250},
	}

	entry := buildMarketPriceEntry(acc, 1234)

	if entry.Buy != 120 {
		t.Fatalf("Buy = %v, want highest buy 120", entry.Buy)
	}
	if entry.Sell != 180 {
		t.Fatalf("Sell = %v, want lowest sell 180", entry.Sell)
	}
	if entry.LastUpdated != 1234 {
		t.Fatalf("LastUpdated = %v, want 1234", entry.LastUpdated)
	}
	// Below the percentile sample floor, both percentiles report the best price.
	if entry.BuyP95 != entry.Buy || entry.SellP05 != entry.Sell {
		t.Fatalf("small sample percentiles = (%v, %v), want best prices (%v, %v)",
			entry.BuyP95, entry.SellP05, entry.Buy, entry.Sell)
	}
}

func TestBuildMarketPriceEntry_EmptyBookSide(t *testing.T) {
	acc := &typePriceAccumulator{sellPrices: []float64{100}}

	entry := buildMarketPriceEntry(acc, 1)

	if entry.Buy != 0 || entry.BuyP95 != 0 {
		t.Fatalf("missing buy side = (%v, %v), want zeros", entry.Buy, entry.BuyP95)
	}
	if entry.Sell != 100 {
		t.Fatalf("Sell = %v, want 100", entry.Sell)
	}
}

func TestBuildMarketPriceEntry_PercentileExcludesOutliers(t *testing.T) {
	// Outliers are excluded once the sample is large enough that the trimmed tail holds more
	// than one order: with 40 prices the top/bottom 5% is two orders, so a single absurd
	// quote on each side falls outside the reported percentile.
	buyPrices := make([]float64, 0, 40)
	sellPrices := make([]float64, 0, 40)
	for i := range 39 {
		buyPrices = append(buyPrices, 100+float64(i))
		sellPrices = append(sellPrices, 200+float64(i))
	}
	buyPrices = append(buyPrices, 10_000) // absurd bid
	sellPrices = append(sellPrices, 1)    // absurd ask

	entry := buildMarketPriceEntry(acc(buyPrices, sellPrices), 1)

	if entry.Buy != 10_000 {
		t.Fatalf("Buy = %v, want the outlying best bid 10000", entry.Buy)
	}
	if entry.BuyP95 >= entry.Buy {
		t.Fatalf("BuyP95 = %v should exclude the outlying bid %v", entry.BuyP95, entry.Buy)
	}
	if entry.Sell != 1 {
		t.Fatalf("Sell = %v, want the outlying best ask 1", entry.Sell)
	}
	if entry.SellP05 <= entry.Sell {
		t.Fatalf("SellP05 = %v should exclude the outlying ask %v", entry.SellP05, entry.Sell)
	}
}

// acc builds an accumulator from raw buy and sell prices.
func acc(buyPrices, sellPrices []float64) *typePriceAccumulator {
	return &typePriceAccumulator{buyPrices: buyPrices, sellPrices: sellPrices}
}
