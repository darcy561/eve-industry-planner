package helpers

import (
	"testing"

	authzhmac "eve-industry-planner/shared/core/crypto/authzhmac/helper"
	corecrypto "eve-industry-planner/shared/core/crypto/aesgcm"
	"eve-industry-planner/shared/core/sealedfields"
	"eve-industry-planner/shared/core/sealedfields/entityids"
	"eve-industry-planner/shared/models"
)

func TestAccumulateCorpBuildStats(t *testing.T) {
	keyring, err := corecrypto.NewKeyring("v1", []byte("1234567890123456"), nil)
	if err != nil {
		t.Fatalf("NewKeyring: %v", err)
	}
	h, err := authzhmac.New("v1", []byte("1234567890123456"))
	if err != nil {
		t.Fatalf("authzhmac.New: %v", err)
	}

	plaintext, err := entityids.Build(
		[]models.MarketOrder{{OrderID: 1, CorporationID: 777}},
		[]models.Transaction{{TransactionID: 1001, CorporationID: 777}},
		nil,
	)
	if err != nil {
		t.Fatalf("entityids.Build: %v", err)
	}
	sealedDoc, err := sealedfields.Seal(keyring, entityids.Domain, entityids.PayloadVersion, plaintext, entityids.EntityIDsFields)
	if err != nil {
		t.Fatalf("sealedfields.Seal: %v", err)
	}

	docs := []models.ArchivedJobStats{
		{
			TypeID:          34,
			TotalProduced:   10,
			TotalBuildCosts: 55,
			TotalInstallCost: 10,
			TotalExtras:     5,
			Sealed:          sealedDoc,
			TransactionLines: []models.ArchivedJobTransactionLine{
				{TransactionID: 1001, OrderID: 1, CorpStatus: "corp_known", Year: 2026, Month: 5, Quantity: 2, Amount: 20, Tax: 1, Profit: 4},
				{TransactionID: 2002, OrderID: 2, CorpStatus: "corp_unknown", Year: 2026, Month: 5, Quantity: 1, Amount: 10, Tax: 1, Profit: 1},
			},
			FeeLines: []models.ArchivedJobFeeLine{
				{OrderID: 1, CorpStatus: "corp_known", Year: 2026, Month: 5, Amount: 0.5},
			},
		},
	}

	lifetimes, buckets := AccumulateCorpBuildStats(docs, keyring, h)
	if len(lifetimes) != 1 {
		t.Fatalf("expected 1 lifetime row, got %d", len(lifetimes))
	}
	if len(buckets) != 1 {
		t.Fatalf("expected 1 bucket row, got %d", len(buckets))
	}

	corpRef, err := h.RefFromCorporationID(777)
	if err != nil {
		t.Fatalf("RefFromCorporationID: %v", err)
	}
	lk := CorpLifetimeKey{CorpRef: corpRef, TypeID: 34}
	row := lifetimes[lk]
	if row == nil {
		t.Fatalf("missing lifetime row")
	}
	if row.TotalJobs != 1 || row.ItemBuildCount != 10 || row.BuildCostTotal != 55 || row.JobCostTotal != 70 {
		t.Fatalf("unexpected lifetime build totals: %+v", row)
	}
	wantLifetimeNet := 20.0 - 0.5 - 1.0 - 70.0 // sales − fees − job cost (job = 55+10+5)
	if row.SalesTotal != 20 || row.TransactionFeeTotal != 1 || row.BrokersFeeTotal != 0.5 || row.ProfitLoss != wantLifetimeNet {
		t.Fatalf("unexpected lifetime sales totals: %+v", row)
	}
	sum := models.AddBuildStatsSegmentTotals(
		models.AddBuildStatsSegmentTotals(row.Breakdown.ProductionChain, row.Breakdown.RetainedStock),
		row.Breakdown.StandaloneRecordedSale,
	)
	if sum.TotalJobs != row.TotalJobs || sum.ItemBuildCount != row.ItemBuildCount || sum.BuildCostTotal != row.BuildCostTotal ||
		sum.JobCostTotal != row.JobCostTotal || sum.SalesTotal != row.SalesTotal || sum.TransactionFeeTotal != row.TransactionFeeTotal ||
		sum.BrokersFeeTotal != row.BrokersFeeTotal || sum.ProfitLoss != row.ProfitLoss {
		t.Fatalf("breakdown segments do not sum to headline row: row=%+v breakdown=%+v sum=%+v", row, row.Breakdown, sum)
	}
	if row.Breakdown.StandaloneRecordedSale.TotalJobs != 1 {
		t.Fatalf("expected sale activity in standalone segment, got %+v", row.Breakdown)
	}

	bk := CorpBucketKey{CorpRef: corpRef, TypeID: 34, Year: 2026, Month: 5}
	b := buckets[bk]
	if b == nil {
		t.Fatalf("missing bucket row")
	}
	wantBucketNet := 20.0 - 0.5 - 1.0 // timeline buckets have no allocated job cost
	if b.TransactionCount != 1 || b.QuantitySold != 2 || b.SalesTotal != 20 || b.TransactionFeeTotal != 1 || b.BrokersFeeTotal != 0.5 || b.ProfitLoss != wantBucketNet {
		t.Fatalf("unexpected bucket totals: %+v", b)
	}
}

func TestAccumulateCorpBuildStats_ResolvedCorpIDWithoutSealedMaps(t *testing.T) {
	h, err := authzhmac.New("v1", []byte("1234567890123456"))
	if err != nil {
		t.Fatalf("authzhmac.New: %v", err)
	}
	docs := []models.ArchivedJobStats{
		{
			TypeID:            10,
			TotalProduced:     3,
			TotalBuildCosts:   9,
			TotalInstallCost:  0,
			TotalExtras:       0,
			Sealed:            nil,
			TransactionLines: []models.ArchivedJobTransactionLine{
				{
					TransactionID: 1, CorpStatus: "corp_known", ResolvedCorpID: 444,
					Year: 2026, Month: 3, Quantity: 1, Amount: 30, Tax: 1, Profit: 5,
				},
			},
			FeeLines: []models.ArchivedJobFeeLine{
				{OrderID: 9, CorpStatus: "corp_known", ResolvedCorpID: 444, Year: 2026, Month: 3, Amount: 2},
			},
		},
	}
	lifetimes, buckets := AccumulateCorpBuildStats(docs, nil, h)
	if len(lifetimes) != 1 || len(buckets) != 1 {
		t.Fatalf("expected 1 lifetime and 1 bucket, got lifetimes=%d buckets=%d", len(lifetimes), len(buckets))
	}
	corpRef, err := h.RefFromCorporationID(444)
	if err != nil {
		t.Fatalf("RefFromCorporationID: %v", err)
	}
	lk := CorpLifetimeKey{CorpRef: corpRef, TypeID: 10}
	if lifetimes[lk] == nil {
		t.Fatalf("missing lifetime aggregate for corp ref")
	}
	bk := CorpBucketKey{CorpRef: corpRef, TypeID: 10, Year: 2026, Month: 3}
	if buckets[bk] == nil {
		t.Fatalf("missing bucket aggregate")
	}
}

func TestAccumulateCorpBuildStats_LinkedIndustryCorpIDsNoSales(t *testing.T) {
	h, err := authzhmac.New("v1", []byte("1234567890123456"))
	if err != nil {
		t.Fatalf("authzhmac.New: %v", err)
	}
	docs := []models.ArchivedJobStats{
		{
			TypeID:                  99,
			TotalProduced:           100,
			TotalBuildCosts:         400,
			TotalInstallCost:        50,
			TotalExtras:             10,
			TotalInventionCost:      0,
			LinkedIndustryCorpIDs:   []int{600001},
			TransactionLines:        nil,
			FeeLines:                nil,
		},
	}
	lifetimes, buckets := AccumulateCorpBuildStats(docs, nil, h)
	if len(buckets) != 0 {
		t.Fatalf("expected no timeline buckets without sale dates, got %d", len(buckets))
	}
	if len(lifetimes) != 1 {
		t.Fatalf("expected 1 lifetime row from linked industry corp, got %d", len(lifetimes))
	}
	corpRef, err := h.RefFromCorporationID(600001)
	if err != nil {
		t.Fatalf("RefFromCorporationID: %v", err)
	}
	lk := CorpLifetimeKey{CorpRef: corpRef, TypeID: 99}
	row := lifetimes[lk]
	if row == nil {
		t.Fatalf("missing lifetime row")
	}
	if row.TotalJobs != 1 || row.ItemBuildCount != 100 || row.BuildCostTotal != 400 || row.JobCostTotal != 460 {
		t.Fatalf("unexpected lifetime build totals: %+v", row)
	}
	wantLinkedNet := -460.0 // 0 sales − 0 fees − job cost (400+50+10)
	if row.SalesTotal != 0 || row.ProfitLoss != wantLinkedNet {
		t.Fatalf("expected zero sales and net loss after job cost for no market activity: %+v", row)
	}
	sum := models.AddBuildStatsSegmentTotals(
		models.AddBuildStatsSegmentTotals(row.Breakdown.ProductionChain, row.Breakdown.RetainedStock),
		row.Breakdown.StandaloneRecordedSale,
	)
	if sum.TotalJobs != row.TotalJobs || sum.ItemBuildCount != row.ItemBuildCount || sum.BuildCostTotal != row.BuildCostTotal ||
		sum.JobCostTotal != row.JobCostTotal {
		t.Fatalf("breakdown segments do not sum to headline row: sum=%+v row=%+v", sum, row)
	}
	if row.Breakdown.RetainedStock.TotalJobs != 1 {
		t.Fatalf("expected linked-only job in retained segment, got %+v", row.Breakdown)
	}
	if !ArchivedJobStatsContributesToCorpBuildStats(docs[0], nil, h) {
		t.Fatalf("expected snapshot to contribute to corp_build_stats")
	}
}
