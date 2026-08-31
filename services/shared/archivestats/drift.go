package archivestats

import (
	"math"

	"eve-industry-planner/shared/models"
)

// Money figures are compared with a relative tolerance, falling back to an
// absolute one near zero.
//
// Exact equality is the wrong test for them. Repeated `$inc` and a single
// summation do not produce identical float64s from the same inputs, so a strict
// comparison would report drift on every owner and mean nothing. Integer counts
// are compared exactly instead, and are the signal that actually distinguishes a
// bug from arithmetic.
const (
	moneyRelativeTolerance = 1e-9
	moneyAbsoluteTolerance = 1e-4
)

// MoneyMatches reports whether two money figures agree to within tolerance.
func MoneyMatches(a, b float64) bool {
	diff := math.Abs(a - b)
	if diff <= moneyAbsoluteTolerance {
		return true
	}
	scale := math.Max(math.Abs(a), math.Abs(b))
	return diff <= scale*moneyRelativeTolerance
}

// Drift is what one collection's stored documents disagreed about, before a
// reconcile overwrote them.
//
// It is a report, not a repair trigger: the reconcile writes its fold whether or
// not anything here is non-zero. Detecting drift and correcting it are separate
// so that a fault in the detection cannot stop the correction from happening.
type Drift struct {
	Missing   int     // folded but absent from storage
	Extra     int     // stored but not folded, so nothing contributes to it
	CountsOff int     // documents whose integer counts disagree
	MoneyOff  int     // documents whose money disagrees beyond tolerance
	WorstGap  float64 // largest absolute money difference seen
	Field     string  // the measure WorstGap was found on
}

// Any reports whether anything disagreed.
func (d Drift) Any() bool {
	return d.Missing > 0 || d.Extra > 0 || d.CountsOff > 0 || d.MoneyOff > 0
}

// CompareBuckets reports how stored monthly buckets differ from a fresh fold.
func CompareBuckets(stored, folded []models.AccountTimelineMonthBucket) Drift {
	var d Drift
	byID := make(map[string]models.AccountTimelineMonthBucket, len(stored))
	for _, doc := range stored {
		byID[doc.ID] = doc
	}
	for _, want := range folded {
		have, ok := byID[want.ID]
		if !ok {
			d.Missing++
			continue
		}
		delete(byID, want.ID)
		if have.ContributingRows != want.ContributingRows || have.TransactionCount != want.TransactionCount {
			d.CountsOff++
		}
		if !d.compareMoney(bucketMeasures(have), bucketMeasures(want)) {
			d.MoneyOff++
		}
	}
	d.Extra = len(byID)
	return d
}

// CompareTotals reports how stored lifetime totals differ from a fresh fold.
func CompareTotals(stored, folded []models.ProductionTotalsRow) Drift {
	var d Drift
	byID := make(map[string]models.ProductionTotalsRow, len(stored))
	for _, doc := range stored {
		byID[doc.ID] = doc
	}
	for _, want := range folded {
		have, ok := byID[want.ID]
		if !ok {
			d.Missing++
			continue
		}
		delete(byID, want.ID)
		if have.TotalJobs != want.TotalJobs {
			d.CountsOff++
		}
		if !d.compareMoney(totalMeasures(have), totalMeasures(want)) {
			d.MoneyOff++
		}
	}
	d.Extra = len(byID)
	return d
}

// compareMoney reports whether every named figure agrees, recording the widest
// gap it saw so a report can say how far out the worst document was.
func (d *Drift) compareMoney(have, want map[string]float64) bool {
	matched := true
	for field, wantValue := range want {
		haveValue := have[field]
		if MoneyMatches(haveValue, wantValue) {
			continue
		}
		matched = false
		if gap := math.Abs(haveValue - wantValue); gap > d.WorstGap {
			d.WorstGap, d.Field = gap, field
		}
	}
	return matched
}

func bucketMeasures(b models.AccountTimelineMonthBucket) map[string]float64 {
	return map[string]float64{
		"salesTotal":        b.SalesTotal,
		"jobCostTotal":      b.JobCostTotal,
		"profitLoss":        b.ProfitLoss,
		"quantitySold":      b.QuantitySold,
		"quantityProduced":  b.QuantityProduced,
		"materialCostTotal": b.MaterialCostTotal,
		"brokersFeeTotal":   b.BrokersFeeTotal,
	}
}

func totalMeasures(t models.ProductionTotalsRow) map[string]float64 {
	return map[string]float64{
		"salesTotal":     t.SalesTotal,
		"jobCostTotal":   t.JobCostTotal,
		"profitLoss":     t.ProfitLoss,
		"buildCostTotal": t.BuildCostTotal,
		"itemBuildCount": t.ItemBuildCount,
	}
}
