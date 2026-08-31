package models

import "maps"

// SalesMeasures is the set of totals every sales-scoped aggregate carries —
// timeline responses and the pre-aggregated monthly buckets behind them.
type SalesMeasures struct {
	TransactionCount int64   `bson:"transactionCount" json:"transactionCount"`
	QuantitySold     float64 `bson:"quantitySold" json:"quantitySold"`
	SalesTotal       float64 `bson:"salesTotal" json:"salesTotal"`
	QuantityProduced float64 `bson:"quantityProduced" json:"quantityProduced"` // makes cost per unit derivable from a month
	JobCostTotal     float64 `bson:"jobCostTotal" json:"jobCostTotal"`
	// What jobCostTotal is made of. Extras are not among them: they are carried
	// per category in ExtraCategoryTotals.
	MaterialCostTotal   float64            `bson:"materialCostTotal" json:"materialCostTotal"`
	InventionCostTotal  float64            `bson:"inventionCostTotal" json:"inventionCostTotal"`
	InstallCostTotal    float64            `bson:"installCostTotal" json:"installCostTotal"`
	ExtrasTotal         float64            `bson:"extrasTotal" json:"extrasTotal"`
	ExtraCategoryTotals map[string]float64 `bson:"extraCategoryTotals,omitempty" json:"extraCategoryTotals,omitempty"`
	TransactionFeeTotal float64            `bson:"transactionFeeTotal" json:"transactionFeeTotal"`
	BrokersFeeTotal     float64            `bson:"brokersFeeTotal" json:"brokersFeeTotal"`
	// ProfitLoss is salesTotal − brokersFeeTotal − transactionFeeTotal − jobCostTotal.
	ProfitLoss float64 `bson:"profitLoss" json:"profitLoss"`
}

// Plus returns m with src added, merging extra-category totals by category id.
//
// The returned value never shares a map with either operand, so an accumulator
// built by folding can be mutated without reaching back into what it summed.
func (m SalesMeasures) Plus(src SalesMeasures) SalesMeasures {
	m.TransactionCount += src.TransactionCount
	m.QuantitySold += src.QuantitySold
	m.SalesTotal += src.SalesTotal
	m.QuantityProduced += src.QuantityProduced
	m.JobCostTotal += src.JobCostTotal
	m.MaterialCostTotal += src.MaterialCostTotal
	m.InventionCostTotal += src.InventionCostTotal
	m.InstallCostTotal += src.InstallCostTotal
	m.ExtrasTotal += src.ExtrasTotal
	m.TransactionFeeTotal += src.TransactionFeeTotal
	m.BrokersFeeTotal += src.BrokersFeeTotal
	m.ProfitLoss += src.ProfitLoss

	if len(m.ExtraCategoryTotals) > 0 || len(src.ExtraCategoryTotals) > 0 {
		merged := make(map[string]float64, len(m.ExtraCategoryTotals)+len(src.ExtraCategoryTotals))
		maps.Copy(merged, m.ExtraCategoryTotals)
		for category, value := range src.ExtraCategoryTotals {
			merged[category] += value
		}
		m.ExtraCategoryTotals = merged
	}
	return m
}

// CalendarMonth is the time key shared by every monthly bucket and timeline entry.
type CalendarMonth struct {
	Year  int `bson:"year" json:"year"`
	Month int `bson:"month" json:"month"`
}

// ProductionTotalsTimelineBucket is one calendar month of an account's sales.
type ProductionTotalsTimelineBucket struct {
	CalendarMonth `bson:",inline"`
	SalesMeasures `bson:",inline"`
}

// TimelineTotals sums sales lines across a resolved window.
type TimelineTotals struct {
	SalesMeasures `bson:",inline"`
}

// AccountTimelineMonthBucket is a pre-aggregated calendar month for an account and item type.
type AccountTimelineMonthBucket struct {
	ID                string `bson:"_id"`
	AccountID         string `bson:"accountID"`
	TypeID            int    `bson:"typeID"`
	IsProductionChain bool   `bson:"isProductionChain"`
	CalendarMonth     `bson:",inline"`
	SalesMeasures     `bson:",inline"`
}

// CorpTimelineMonthBucket is a pre-aggregated calendar month for a corporation and item type.
type CorpTimelineMonthBucket struct {
	ID            string `bson:"_id"`
	CorpRef       string `bson:"corpRef"`
	TypeID        int    `bson:"typeID"`
	CalendarMonth `bson:",inline"`
	SalesMeasures `bson:",inline"`
}
