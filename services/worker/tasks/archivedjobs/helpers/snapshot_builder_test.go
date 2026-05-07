package helpers

import (
	"testing"
	"time"

	"eve-industry-planner/shared/shared/models"
)

func TestParseLineDate(t *testing.T) {
	fallback := time.Date(2026, time.January, 2, 3, 4, 5, 0, time.UTC)
	got := parseLineDate("2026-05-01T12:00:00Z", fallback)
	if got.Year() != 2026 || got.Month() != time.May {
		t.Fatalf("unexpected RFC3339 parse result: %v", got)
	}
	got = parseLineDate("2026-05-01 12:00:00", fallback)
	if got.Year() != 2026 || got.Month() != time.May {
		t.Fatalf("unexpected fallback-format parse result: %v", got)
	}
	got = parseLineDate("not-a-date", fallback)
	if !got.Equal(fallback) {
		t.Fatalf("expected fallback date, got %v", got)
	}
}

func TestCorpStatusFor(t *testing.T) {
	tests := []struct {
		name   string
		isCorp bool
		corpID int
		want   string
	}{
		{name: "personal", isCorp: false, corpID: 0, want: "personal"},
		{name: "corp unknown", isCorp: true, corpID: 0, want: "corp_unknown"},
		{name: "corp known", isCorp: true, corpID: 42, want: "corp_known"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := corpStatusFor(tt.isCorp, tt.corpID)
			if got != tt.want {
				t.Fatalf("corpStatusFor(%v, %d) = %q, want %q", tt.isCorp, tt.corpID, got, tt.want)
			}
		})
	}
}

func TestBuildArchivedJobStatsSnapshot_Basic(t *testing.T) {
	job := models.Job{
		JobID:   "job-1",
		ItemID:  34,
		JobType: 1,
		Build: models.JobBuild{
			Products: models.JobProducts{TotalQuantity: 10},
			Costs: models.JobCosts{
				LinkedJobs: []models.LinkedESIJob{
					{JobID: 10, IsCorporation: true, CorporationID: 555},
				},
			},
			Sale: models.JobSale{
				MarketOrders: []models.MarketOrder{
					{OrderID: 1, IsCorporation: true, CorporationID: 555},
				},
				Transactions: []models.Transaction{
					{
						TransactionID: 1001,
						OrderID:       1,
						Date:          "2026-05-01T12:00:00Z",
						Quantity:      5,
						Amount:        50,
						Tax:           2,
						IsCorp:        true,
						CorporationID: 555,
					},
				},
				BrokersFee: []models.BrokerFee{
					{ID: 77, OrderID: 1, Date: "2026-05-02T00:00:00Z", Amount: 1.5},
				},
			},
		},
		MetaData: models.JobMetaData{
			MetaData: models.MetaData{AccountID: "acc-1"},
			ArchivedAt: time.Date(2026, time.May, 3, 0, 0, 0, 0, time.UTC),
		},
	}
	snap := models.BuildStatSnapshot{
		TotalProduced:      10,
		TotalJobCost:       100,
		TotalMaterialCost:  40,
		TotalInstallCost:   10,
		TotalExtras:        5,
		TotalInventionCost: 0,
		TotalBuildCosts:    55,
		TotalCostPerItem:   10,
	}

	out, err := BuildArchivedJobStatsSnapshot(job, snap)
	if err != nil {
		t.Fatalf("BuildArchivedJobStatsSnapshot: %v", err)
	}
	if out.AccountID != "acc-1" || out.JobID != "job-1" {
		t.Fatalf("unexpected IDs: account=%s job=%s", out.AccountID, out.JobID)
	}
	if len(out.TransactionLines) != 1 || out.TransactionLines[0].CorpStatus != "corp_known" {
		t.Fatalf("expected one corp_known transaction line, got %+v", out.TransactionLines)
	}
	if len(out.FeeLines) != 1 || out.FeeLines[0].CorpStatus != "corp_known" {
		t.Fatalf("expected one corp_known fee line, got %+v", out.FeeLines)
	}
	if out.UnsoldQuantity != 5 {
		t.Fatalf("unexpected unsoldQuantity %v", out.UnsoldQuantity)
	}
	if out.UnsoldCost != 50 {
		t.Fatalf("unexpected unsoldCost %v", out.UnsoldCost)
	}
	if len(out.LinkedIndustryCorpIDs) != 1 || out.LinkedIndustryCorpIDs[0] != 555 {
		t.Fatalf("linkedIndustryCorpIDs: %+v", out.LinkedIndustryCorpIDs)
	}
}

func TestBuildArchivedJobStatsSnapshot_LinkedIndustryCorpIDs_ProductionChainNoSales(t *testing.T) {
	job := models.Job{
		JobID:       "chain-intermediate",
		ItemID:      12345,
		JobType:     1,
		ParentJobs:  []string{"parent-job-doc-id"},
		Build: models.JobBuild{
			Products: models.JobProducts{TotalQuantity: 50},
			Costs: models.JobCosts{
				LinkedJobs: []models.LinkedESIJob{
					{JobID: 99001, CorporationID: 987654, IsCorporation: true},
				},
			},
			Sale: models.JobSale{},
		},
		MetaData: models.JobMetaData{
			MetaData:   models.MetaData{AccountID: "acc-chain"},
			ArchivedAt: time.Date(2026, time.June, 1, 0, 0, 0, 0, time.UTC),
		},
	}
	snap := models.BuildStatSnapshot{
		TotalProduced:      50,
		TotalJobCost:       200,
		TotalMaterialCost:  150,
		TotalInstallCost:   30,
		TotalExtras:        0,
		TotalInventionCost: 0,
		TotalBuildCosts:    180,
		TotalCostPerItem:   4,
	}

	out, err := BuildArchivedJobStatsSnapshot(job, snap)
	if err != nil {
		t.Fatalf("BuildArchivedJobStatsSnapshot: %v", err)
	}
	if !out.IsProductionChain {
		t.Fatalf("expected production chain snapshot")
	}
	if len(out.TransactionLines) != 0 || len(out.FeeLines) != 0 {
		t.Fatalf("expected no sale lines, got tx=%d fee=%d", len(out.TransactionLines), len(out.FeeLines))
	}
	if len(out.LinkedIndustryCorpIDs) != 1 || out.LinkedIndustryCorpIDs[0] != 987654 {
		t.Fatalf("linkedIndustryCorpIDs: %+v", out.LinkedIndustryCorpIDs)
	}
}

func TestBuildArchivedJobStatsSnapshot_LinkedJobInferenceLegacy(t *testing.T) {
	job := models.Job{
		JobID:   "job-hist",
		ItemID:  34,
		JobType: 1,
		Build: models.JobBuild{
			Products: models.JobProducts{TotalQuantity: 10},
			Costs: models.JobCosts{
				LinkedJobs: []models.LinkedESIJob{
					// Historic: corporation_id present but is_corporation omitted/false
					{JobID: 5001, IsCorporation: false, CorporationID: 888},
				},
			},
			Sale: models.JobSale{
				MarketOrders: []models.MarketOrder{
					{OrderID: 1, IsCorporation: false, CorporationID: 0},
				},
				Transactions: []models.Transaction{
					{
						TransactionID: 9001,
						OrderID:       1,
						Date:          "2026-05-01T12:00:00Z",
						Quantity:      10,
						Amount:        100,
						Tax:           1,
						IsCorp:        false,
						CorporationID: 0,
					},
				},
				BrokersFee: []models.BrokerFee{
					{ID: 1, OrderID: 1, Date: "2026-05-02T00:00:00Z", Amount: 0.25},
				},
			},
		},
		MetaData: models.JobMetaData{
			MetaData:   models.MetaData{AccountID: "acc-x"},
			ArchivedAt: time.Date(2026, time.May, 3, 0, 0, 0, 0, time.UTC),
		},
	}
	snap := models.BuildStatSnapshot{
		TotalProduced:     10,
		TotalJobCost:      50,
		TotalMaterialCost: 10,
		TotalInstallCost:  0,
		TotalExtras:       0,
		TotalInventionCost: 0,
		TotalBuildCosts:   10,
		TotalCostPerItem:  5,
	}
	out, err := BuildArchivedJobStatsSnapshot(job, snap)
	if err != nil {
		t.Fatalf("BuildArchivedJobStatsSnapshot: %v", err)
	}
	if len(out.TransactionLines) != 1 {
		t.Fatalf("expected 1 transaction line, got %+v", out.TransactionLines)
	}
	tx := out.TransactionLines[0]
	if tx.CorpStatus != "corp_known" || tx.ResolvedCorpID != 888 {
		t.Fatalf("expected corp_known + resolvedCorpID 888, got status=%s resolved=%d", tx.CorpStatus, tx.ResolvedCorpID)
	}
	if len(out.FeeLines) != 1 || out.FeeLines[0].CorpStatus != "corp_known" || out.FeeLines[0].ResolvedCorpID != 888 {
		t.Fatalf("unexpected fee line: %+v", out.FeeLines)
	}
}
