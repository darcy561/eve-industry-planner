package helpers

import (
	"testing"

	"eve-industry-planner/shared/shared/models"
)

func TestClassifyArchivedJobStatsSegment_ChainBeatsRetainedFlag(t *testing.T) {
	doc := models.ArchivedJobStats{
		IsProductionChain:  true,
		RetainedStockBuild: true,
	}
	if g, e := ClassifyArchivedJobStatsSegment(doc), SegmentProductionChain; g != e {
		t.Fatalf("chain intermediates are never stock; got %v want %v", g, e)
	}
}

func TestClassifyArchivedJobStatsSegment_Chain(t *testing.T) {
	doc := models.ArchivedJobStats{IsProductionChain: true}
	if g, e := ClassifyArchivedJobStatsSegment(doc), SegmentProductionChain; g != e {
		t.Fatalf("got %v want %v", g, e)
	}
}

func TestClassifyArchivedJobStatsSegment_StandaloneSale(t *testing.T) {
	doc := models.ArchivedJobStats{
		IsProductionChain: false,
		TransactionLines: []models.ArchivedJobTransactionLine{
			{Amount: 1.0},
		},
	}
	if g, e := ClassifyArchivedJobStatsSegment(doc), SegmentStandaloneRecordedSale; g != e {
		t.Fatalf("got %v want %v", g, e)
	}
}

func TestClassifyArchivedJobStatsSegment_InferredRetained(t *testing.T) {
	doc := models.ArchivedJobStats{IsProductionChain: false}
	if g, e := ClassifyArchivedJobStatsSegment(doc), SegmentRetainedStock; g != e {
		t.Fatalf("got %v want %v", g, e)
	}
}

func TestClassifyArchivedJobStatsSegment_TerminalSaleBeatsRetainedFlag(t *testing.T) {
	doc := models.ArchivedJobStats{
		IsProductionChain:  false,
		RetainedStockBuild: true,
		TransactionLines: []models.ArchivedJobTransactionLine{
			{Amount: 1.0},
		},
	}
	if g, e := ClassifyArchivedJobStatsSegment(doc), SegmentStandaloneRecordedSale; g != e {
		t.Fatalf("recorded sale/fee activity wins over retained flag: got %v want %v", g, e)
	}
}
