package helpers

import "eve-industry-planner/shared/models"

// ArchivedJobStatsSegment partitions archived snapshot rows for aggregate breakdown
// (aligned with the Blueprint Archive dialog and Mongo build_stats.breakdown).
type ArchivedJobStatsSegment int

const (
	// SegmentProductionChain — job has parent links (output assumed to feed the next chain step, not “stock”).
	SegmentProductionChain ArchivedJobStatsSegment = iota
	// SegmentRetainedStock — non-chain job: explicit retained flag, or inferred stock (no sale/fees on this row).
	SegmentRetainedStock
	// SegmentStandaloneRecordedSale — non-chain job with recorded sale or broker-fee lines (market-facing).
	SegmentStandaloneRecordedSale
)

// DocHasRecordedSaleOrFeeActivity mirrors frontend archivedJobHasRecordedSaleOrFeeActivity.
func DocHasRecordedSaleOrFeeActivity(doc *models.ArchivedJobStats) bool {
	if doc == nil {
		return false
	}
	for _, t := range doc.TransactionLines {
		if t.Amount != 0 || t.Quantity != 0 {
			return true
		}
	}
	for _, f := range doc.FeeLines {
		if f.Amount != 0 {
			return true
		}
	}
	return false
}

// ClassifyArchivedJobStatsSegment assigns one segment per snapshot.
// Production-chain rows are intermediate steps (output to the next job). Terminal rows
// are market if this archive has sale/fee activity, otherwise retained stock (inferred).
// RetainedStockBuild on the document is kept for UI/audit but does not change the bucket
// when sale lines exist (market wins).
func ClassifyArchivedJobStatsSegment(doc models.ArchivedJobStats) ArchivedJobStatsSegment {
	if doc.IsProductionChain {
		return SegmentProductionChain
	}
	if DocHasRecordedSaleOrFeeActivity(&doc) {
		return SegmentStandaloneRecordedSale
	}
	return SegmentRetainedStock
}
