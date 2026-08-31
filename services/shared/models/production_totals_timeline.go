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

// Negated returns m with every measure reversed, which is what removing a
// contribution adds.
//
// Subtracting is the same arithmetic as adding, so a removal is expressed by
// negating what was contributed rather than by a second implementation that
// could disagree with it.
func (m SalesMeasures) Negated() SalesMeasures {
	m.TransactionCount = -m.TransactionCount
	m.QuantitySold = -m.QuantitySold
	m.SalesTotal = -m.SalesTotal
	m.QuantityProduced = -m.QuantityProduced
	m.JobCostTotal = -m.JobCostTotal
	m.MaterialCostTotal = -m.MaterialCostTotal
	m.InventionCostTotal = -m.InventionCostTotal
	m.InstallCostTotal = -m.InstallCostTotal
	m.ExtrasTotal = -m.ExtrasTotal
	m.TransactionFeeTotal = -m.TransactionFeeTotal
	m.BrokersFeeTotal = -m.BrokersFeeTotal
	m.ProfitLoss = -m.ProfitLoss

	if len(m.ExtraCategoryTotals) > 0 {
		negated := make(map[string]float64, len(m.ExtraCategoryTotals))
		for category, value := range m.ExtraCategoryTotals {
			negated[category] = -value
		}
		m.ExtraCategoryTotals = negated
	}
	return m
}

// CalendarMonth is the time key shared by every monthly bucket and timeline entry.
type CalendarMonth struct {
	Year  int `bson:"year" json:"year"`
	Month int `bson:"month" json:"month"`
}

// ordinal packs the month into one comparable integer.
func (m CalendarMonth) ordinal() int { return m.Year*12 + m.Month }

// Before reports whether m is an earlier month than other.
func (m CalendarMonth) Before(other CalendarMonth) bool {
	return m.ordinal() < other.ordinal()
}

// IsZero reports whether the month is unset.
func (m CalendarMonth) IsZero() bool { return m == CalendarMonth{} }

// StatsBucketKey identifies one monthly bucket: an item type in a calendar month,
// separated by whether its output was consumed by a parent build.
type StatsBucketKey struct {
	TypeID            int
	IsProductionChain bool
	CalendarMonth
}

// StatsDelta is what one archived job adds to, or removes from, the documents an
// owner's statistics are kept in.
//
// It lives here rather than beside either the fold that derives it or the write
// that applies it, because both need to name it and neither may import the other.
type StatsDelta struct {
	Buckets map[StatsBucketKey]StatsBucketDelta
	Totals  map[StatsTypeKey]StatsTypeDelta
}

// StatsTypeKey addresses one item type's share of a contribution, within the
// segment the rows are credited to.
//
// The segment is part of the key because rows of the same type can sit in
// different ones — a build sold on the market and one consumed by a parent job —
// and merging them on type alone would credit only whichever came last.
type StatsTypeKey struct {
	TypeID  int
	Segment string
}

// StatsBucketDelta is one bucket's share of a contribution.
//
// Rows counts the rows behind the measures, and decides when a bucket is empty:
// subtracting float64 leaves a residue rather than zero, so a bucket that should
// be gone would never match a test for zero money. A count is exact, and it
// carries its own direction rather than being inferred from the signs.
type StatsBucketDelta struct {
	Measures SalesMeasures
	Rows     int64
}

// StatsTypeDelta is one item type's share of a row's contribution.
//
// BuildRows counts the rows behind the measures. Emptiness is decided on it
// rather than on the money: subtracting float64 leaves a residue rather than
// zero, so a document that should be gone would never match a test for zero and
// would accumulate instead.
type StatsTypeDelta struct {
	JobType   int
	Measures  BuildMeasures
	SoldQty   float64
	BuildRows int64
}

// Negated returns the delta that undoes this one.
func (d StatsDelta) Negated() StatsDelta {
	out := StatsDelta{
		Buckets: make(map[StatsBucketKey]StatsBucketDelta, len(d.Buckets)),
		Totals:  make(map[StatsTypeKey]StatsTypeDelta, len(d.Totals)),
	}
	for key, bucket := range d.Buckets {
		out.Buckets[key] = StatsBucketDelta{Measures: bucket.Measures.Negated(), Rows: -bucket.Rows}
	}
	for key, total := range d.Totals {
		total.Measures = total.Measures.Negated()
		total.SoldQty = -total.SoldQty
		total.BuildRows = -total.BuildRows
		out.Totals[key] = total
	}
	return out
}

// IsZero reports whether the delta would change nothing.
func (d StatsDelta) IsZero() bool {
	return len(d.Buckets) == 0 && len(d.Totals) == 0
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
	// ContributingRows counts the statistics rows folded into this bucket. It
	// decides emptiness, which a sum of float money cannot: subtraction leaves a
	// residue rather than zero.
	ContributingRows int64 `bson:"contributingRows"`
}

// CorpTimelineMonthBucket is a pre-aggregated calendar month for a corporation and item type.
type CorpTimelineMonthBucket struct {
	ID            string `bson:"_id"`
	CorpRef       string `bson:"corpRef"`
	TypeID        int    `bson:"typeID"`
	CalendarMonth `bson:",inline"`
	SalesMeasures `bson:",inline"`
}
