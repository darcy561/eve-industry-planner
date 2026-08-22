package models

import "maps"

// SalesMeasures is the set of totals every sales-scoped aggregate carries —
// rollup responses and the pre-aggregated monthly buckets behind them.
type SalesMeasures struct {
	TransactionCount    int64              `bson:"transactionCount" json:"transactionCount"`
	QuantitySold        float64            `bson:"quantitySold" json:"quantitySold"`
	SalesTotal          float64            `bson:"salesTotal" json:"salesTotal"`
	JobCostTotal        float64            `bson:"jobCostTotal" json:"jobCostTotal"`
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
	m.JobCostTotal += src.JobCostTotal
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

// BuildStatsTimelineBucket is one calendar month of an account's sales.
type BuildStatsTimelineBucket struct {
	CalendarMonth `bson:",inline"`
	SalesMeasures `bson:",inline"`
}

// BuildStatsRollupTotals sums sales lines across a resolved period.
type BuildStatsRollupTotals struct {
	SalesMeasures `bson:",inline"`
}

// BuildStatsRollupByType is one item type's share of a rollup.
type BuildStatsRollupByType struct {
	TypeID int `json:"typeID"`
	BuildStatsRollupTotals
}

// BuildStatsRollupPeriodMeta describes the time window resolved from query parameters.
type BuildStatsRollupPeriodMeta struct {
	Kind      string `json:"kind"` // month|year|range|years
	Year      int    `json:"year,omitempty"`
	Month     int    `json:"month,omitempty"`
	FromYear  int    `json:"fromYear,omitempty"`
	FromMonth int    `json:"fromMonth,omitempty"`
	ToYear    int    `json:"toYear,omitempty"`
	ToMonth   int    `json:"toMonth,omitempty"`
	Years     []int  `json:"years,omitempty"`
}

// BuildStatsRollupResponse is the rollup read for either scope.
type BuildStatsRollupResponse struct {
	Period BuildStatsRollupPeriodMeta `json:"period"`
	// TypeID is set when the client asked for a single item type; ByType is then omitted.
	TypeID *int                     `json:"typeID,omitempty"`
	Totals BuildStatsRollupTotals   `json:"totals"`
	ByType []BuildStatsRollupByType `json:"byType,omitempty"`
}

// CorpRollupOwnedLane marks corp-owned rows in corp_rollup_buckets.
const CorpRollupOwnedLane = "~"

// UserRollupMonthlyBucket is a pre-aggregated calendar month for an account and item type.
type UserRollupMonthlyBucket struct {
	ID            string `bson:"_id"`
	AccountID     string `bson:"accountID"`
	TypeID        int    `bson:"typeID"`
	CalendarMonth `bson:",inline"`
	SalesMeasures `bson:",inline"`
}

// CorpRollupMonthlyBucket is a pre-aggregated calendar month for a corporation and item type.
// Lane is CorpRollupOwnedLane for corpRef-only rows, otherwise the accountID of the linked account.
type CorpRollupMonthlyBucket struct {
	ID            string `bson:"_id"`
	CorpRef       string `bson:"corpRef"`
	Lane          string `bson:"lane"`
	TypeID        int    `bson:"typeID"`
	CalendarMonth `bson:",inline"`
	SalesMeasures `bson:",inline"`
}
