package models

import (
	"encoding/json"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func bsonKeys(t *testing.T, v any) map[string]bson.RawValue {
	t.Helper()
	raw, err := bson.Marshal(v)
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}
	var doc bson.M
	if err := bson.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}
	out := map[string]bson.RawValue{}
	for k := range doc {
		out[k] = bson.RawValue{}
	}
	return out
}

func requireFlatKeys(t *testing.T, v any, want ...string) {
	t.Helper()
	keys := bsonKeys(t, v)
	for _, k := range want {
		if _, ok := keys[k]; !ok {
			t.Fatalf("%T: expected top-level bson key %q, got keys %v", v, k, keysOf(keys))
		}
	}
	for _, forbidden := range []string{"buildmeasures", "salesmeasures", "calendarmonth", "archivedjobcosttotals", "archivedjobline"} {
		if _, ok := keys[forbidden]; ok {
			t.Fatalf("%T: embedded struct leaked as nested key %q — inline tag missing", v, forbidden)
		}
	}
}

func keysOf(m map[string]bson.RawValue) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func TestBuildStatsRowPersistsFlat(t *testing.T) {
	row := BuildStatsRow{
		ID:            "acct|1234",
		TypeID:        1234,
		BuildMeasures: BuildMeasures{TotalJobs: 3, SalesTotal: 100},
	}
	requireFlatKeys(t, row, "_id", "typeID", "totalJobs", "salesTotal", "profitLoss", "dataSnapshots")
}

func TestSegmentTotalsPersistFlat(t *testing.T) {
	seg := BuildStatsSegmentTotals{
		BuildMeasures:     BuildMeasures{TotalJobs: 1},
		TotalSoldQuantity: 5,
	}
	requireFlatKeys(t, seg, "totalJobs", "totalSoldQuantity")
}

func TestRollupBucketsPersistFlat(t *testing.T) {
	user := UserRollupMonthlyBucket{
		ID:            "acct|1234|2026|8",
		AccountID:     "acct",
		TypeID:        1234,
		CalendarMonth: CalendarMonth{Year: 2026, Month: 8},
		SalesMeasures: SalesMeasures{TransactionCount: 2, SalesTotal: 50},
	}
	requireFlatKeys(t, user, "_id", "accountID", "typeID", "year", "month", "transactionCount", "salesTotal")

	corp := CorpRollupMonthlyBucket{
		ID:            "corpref|~|1234|2026|8",
		CorpRef:       "corpref",
		Lane:          CorpRollupOwnedLane,
		TypeID:        1234,
		CalendarMonth: CalendarMonth{Year: 2026, Month: 8},
		SalesMeasures: SalesMeasures{TransactionCount: 2},
	}
	requireFlatKeys(t, corp, "_id", "corpRef", "lane", "year", "month", "transactionCount")
}

func TestArchivedJobLinesPersistFlat(t *testing.T) {
	tx := ArchivedJobTransactionLine{
		TransactionID: 7712345678,
		ArchivedJobLine: ArchivedJobLine{
			CalendarMonth: CalendarMonth{Year: 2026, Month: 8},
			Amount:        100,
			CorpStatus:    CorpStatusCorpKnown,
		},
		Quantity: 2,
	}
	requireFlatKeys(t, tx, "transactionID", "year", "month", "amount", "corpStatus", "quantity")

	fee := ArchivedJobFeeLine{
		FeeID:           5500000001,
		ArchivedJobLine: ArchivedJobLine{Amount: -3, CorpStatus: CorpStatusPersonal},
	}
	requireFlatKeys(t, fee, "feeID", "amount", "corpStatus")
}

func TestArchivedJobStatsPersistsFlat(t *testing.T) {
	stats := ArchivedJobStats{
		ID:                    "acct|job-1",
		AccountID:             "acct",
		JobID:                 "job-1",
		ArchivedJobCostTotals: ArchivedJobCostTotals{TotalProduced: 10, TotalBuildCosts: 500},
	}
	requireFlatKeys(t, stats, "_id", "accountID", "jobID", "totalProduced", "totalBuildCosts")
}

func TestBuildStatsRowJSONStaysFlat(t *testing.T) {
	row := BuildStatsRow{
		TypeID:        1234,
		JobType:       1,
		BuildMeasures: BuildMeasures{TotalJobs: 3, SalesTotal: 100, ProfitLoss: 40},
		DataSnapshots: []BuildStatSnapshot{},
	}
	raw, err := json.Marshal(row)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}
	for _, k := range []string{"typeID", "jobType", "totalJobs", "salesTotal", "profitLoss", "dataSnapshots"} {
		if _, ok := out[k]; !ok {
			t.Fatalf("expected top-level JSON key %q in %s", k, raw)
		}
	}
	if _, ok := out["BuildMeasures"]; ok {
		t.Fatal("embedded measures leaked into JSON as a nested object")
	}
}

func TestBuildMeasuresPlus(t *testing.T) {
	got := BuildMeasures{TotalJobs: 2, SalesTotal: 100, ProfitLoss: 10}.
		Plus(BuildMeasures{TotalJobs: 3, SalesTotal: 50, ProfitLoss: -4})

	if got.TotalJobs != 5 {
		t.Fatalf("totalJobs = %d, want 5", got.TotalJobs)
	}
	if got.SalesTotal != 150 {
		t.Fatalf("salesTotal = %v, want 150", got.SalesTotal)
	}
	if got.ProfitLoss != 6 {
		t.Fatalf("profitLoss = %v, want 6", got.ProfitLoss)
	}
}

func TestBuildStatsRowPlusKeepsFirstJobType(t *testing.T) {
	got := BuildStatsRow{TypeID: 1234}.Plus(BuildStatsRow{JobType: 7, BuildMeasures: BuildMeasures{TotalJobs: 1}})
	if got.JobType != 7 {
		t.Fatalf("jobType = %d, want 7", got.JobType)
	}
	if got.TotalJobs != 1 {
		t.Fatalf("totalJobs = %d, want 1", got.TotalJobs)
	}

	got = got.Plus(BuildStatsRow{JobType: 9})
	if got.JobType != 7 {
		t.Fatalf("jobType = %d, want the first non-zero value 7", got.JobType)
	}
}

func TestBreakdownPlusSumsEverySegment(t *testing.T) {
	one := BuildStatsBreakdown{
		ProductionChain:        BuildStatsSegmentTotals{BuildMeasures: BuildMeasures{TotalJobs: 1}},
		RetainedStock:          BuildStatsSegmentTotals{BuildMeasures: BuildMeasures{TotalJobs: 2}},
		StandaloneRecordedSale: BuildStatsSegmentTotals{BuildMeasures: BuildMeasures{TotalJobs: 3}},
	}
	got := one.Plus(one)

	if got.ProductionChain.TotalJobs != 2 || got.RetainedStock.TotalJobs != 4 || got.StandaloneRecordedSale.TotalJobs != 6 {
		t.Fatalf("breakdown = %+v, want every segment doubled", got)
	}
}

func TestSalesMeasuresPlusMergesExtraCategories(t *testing.T) {
	a := SalesMeasures{
		SalesTotal:          100,
		ExtraCategoryTotals: map[string]float64{"shipping": 10, "tax": 5},
	}
	b := SalesMeasures{
		SalesTotal:          50,
		ExtraCategoryTotals: map[string]float64{"shipping": 3, "insurance": 7},
	}

	got := a.Plus(b)
	if got.SalesTotal != 150 {
		t.Fatalf("salesTotal = %v, want 150", got.SalesTotal)
	}
	want := map[string]float64{"shipping": 13, "tax": 5, "insurance": 7}
	for category, value := range want {
		if got.ExtraCategoryTotals[category] != value {
			t.Fatalf("%s = %v, want %v", category, got.ExtraCategoryTotals[category], value)
		}
	}

	// The operands must not be mutated by the merge.
	if a.ExtraCategoryTotals["shipping"] != 10 {
		t.Fatalf("Plus mutated its receiver's map: %v", a.ExtraCategoryTotals)
	}
	if b.ExtraCategoryTotals["shipping"] != 3 {
		t.Fatalf("Plus mutated its argument's map: %v", b.ExtraCategoryTotals)
	}
}

func TestEmptyBuildStatsRowIsSerialisable(t *testing.T) {
	raw, err := json.Marshal(EmptyBuildStatsRow(1234))
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}
	if out["typeID"] != float64(1234) {
		t.Fatalf("typeID = %v, want 1234", out["typeID"])
	}
	if snapshots, ok := out["dataSnapshots"].([]any); !ok || snapshots == nil {
		t.Fatalf("dataSnapshots = %v, want an empty array", out["dataSnapshots"])
	}
}
