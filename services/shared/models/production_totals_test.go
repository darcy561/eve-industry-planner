package models

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

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

func TestProductionTotalsRowPersistsFlat(t *testing.T) {
	row := ProductionTotalsRow{
		ID:        "acct|1234",
		TypeID:    1234,
		TotalJobs: 3, SalesTotal: 100,
	}
	requireFlatKeys(t, row, "_id", "typeID", "totalJobs", "salesTotal", "profitLoss", "dataSnapshots")
}

func TestSegmentTotalsPersistFlat(t *testing.T) {
	seg := ArchiveSegmentTotals{
		TotalJobs:         1,
		TotalSoldQuantity: 5,
	}
	requireFlatKeys(t, seg, "totalJobs", "totalSoldQuantity")
}

func TestTimelineMonthBucketsPersistFlat(t *testing.T) {
	user := AccountTimelineMonthBucket{
		ID:        "acct|1234|2026|8",
		AccountID: "acct",
		TypeID:    1234,
		Year:      2026, Month: 8,
		TransactionCount: 2, SalesTotal: 50,
	}
	requireFlatKeys(t, user, "_id", "accountID", "typeID", "year", "month", "transactionCount", "salesTotal")

	corp := CorpTimelineMonthBucket{
		ID:      "corpref|~|1234|2026|8",
		CorpRef: "corpref",
		TypeID:  1234,
		Year:    2026, Month: 8,
		TransactionCount: 2,
	}
	requireFlatKeys(t, corp, "_id", "corpRef", "year", "month", "transactionCount")
}

func TestArchivedJobLinesPersistFlat(t *testing.T) {
	tx := ArchivedJobTransactionLine{
		TransactionID: 7712345678,
		Year:          2026, Month: 8,
		Amount:   100,
		Quantity: 2,
	}
	requireFlatKeys(t, tx, "transactionID", "year", "month", "amount", "quantity")

	fee := ArchivedJobFeeLine{
		FeeID:  5500000001,
		Amount: -3,
	}
	requireFlatKeys(t, fee, "feeID", "amount")
}

func TestArchivedJobStatsPersistsFlat(t *testing.T) {
	stats := ArchivedJobStats{
		ID:            "acct|job-1",
		AccountID:     "acct",
		JobID:         "job-1",
		TotalProduced: 10, TotalMaterialCost: 500,
	}
	requireFlatKeys(t, stats, "_id", "accountID", "jobID", "totalProduced", "totalMaterialCost")
}

func TestProductionTotalsRowJSONStaysFlat(t *testing.T) {
	row := ProductionTotalsRow{
		TypeID:    1234,
		JobType:   1,
		TotalJobs: 3, SalesTotal: 100, ProfitLoss: 40,
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

func TestProductionTotalsRowPlusKeepsFirstJobType(t *testing.T) {
	got := ProductionTotalsRow{TypeID: 1234}.Plus(ProductionTotalsRow{JobType: 7, TotalJobs: 1})
	if got.JobType != 7 {
		t.Fatalf("jobType = %d, want 7", got.JobType)
	}
	if got.TotalJobs != 1 {
		t.Fatalf("totalJobs = %d, want 1", got.TotalJobs)
	}

	got = got.Plus(ProductionTotalsRow{JobType: 9})
	if got.JobType != 7 {
		t.Fatalf("jobType = %d, want the first non-zero value 7", got.JobType)
	}
}

func TestBreakdownPlusSumsEverySegment(t *testing.T) {
	one := ProductionTotalsBreakdown{
		ProductionChain:        ArchiveSegmentTotals{BuildMeasures: BuildMeasures{TotalJobs: 1}},
		RetainedStock:          ArchiveSegmentTotals{BuildMeasures: BuildMeasures{TotalJobs: 2}},
		StandaloneRecordedSale: ArchiveSegmentTotals{BuildMeasures: BuildMeasures{TotalJobs: 3}},
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

// Folding an empty month into an accumulator must not hand back the
// accumulator’s own map. A fold that then writes to the result would
// otherwise corrupt the value it summed from.
func TestSalesMeasuresPlusNeverSharesAMap(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name string
		src  SalesMeasures
	}{
		{"empty src", SalesMeasures{}},
		{"nil src map", SalesMeasures{SalesTotal: 5}},
		{"populated src", SalesMeasures{ExtraCategoryTotals: map[string]float64{"tax": 1}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			base := SalesMeasures{ExtraCategoryTotals: map[string]float64{"shipping": 10}}

			got := base.Plus(tc.src)
			got.ExtraCategoryTotals["shipping"] = 999
			got.ExtraCategoryTotals["injected"] = 1

			if base.ExtraCategoryTotals["shipping"] != 10 {
				t.Fatalf("receiver shipping = %v, want 10 — the result aliased the receiver's map",
					base.ExtraCategoryTotals["shipping"])
			}
			if _, leaked := base.ExtraCategoryTotals["injected"]; leaked {
				t.Fatal("a key written to the result appeared on the receiver")
			}
			if len(base.ExtraCategoryTotals) != 1 {
				t.Fatalf("receiver map has %d entries, want 1", len(base.ExtraCategoryTotals))
			}
		})
	}
}

// The src operand must be left alone too.
func TestSalesMeasuresPlusDoesNotMutateSrc(t *testing.T) {
	t.Parallel()

	base := SalesMeasures{}
	src := SalesMeasures{ExtraCategoryTotals: map[string]float64{"tax": 5}}

	got := base.Plus(src)
	got.ExtraCategoryTotals["tax"] = 999

	if src.ExtraCategoryTotals["tax"] != 5 {
		t.Fatalf("src tax = %v, want 5 — the result aliased src's map", src.ExtraCategoryTotals["tax"])
	}
}

// Folding a sequence must accumulate, which is the pattern the aliasing bug
// silently broke.
func TestSalesMeasuresPlusAccumulatesAcrossAFold(t *testing.T) {
	t.Parallel()

	months := []SalesMeasures{
		{SalesTotal: 100, ExtraCategoryTotals: map[string]float64{"tax": 1}},
		{SalesTotal: 50},
		{SalesTotal: 25, ExtraCategoryTotals: map[string]float64{"tax": 2, "shipping": 3}},
	}

	var total SalesMeasures
	for _, m := range months {
		total = total.Plus(m)
	}

	if total.SalesTotal != 175 {
		t.Fatalf("SalesTotal = %v, want 175", total.SalesTotal)
	}
	if total.ExtraCategoryTotals["tax"] != 3 {
		t.Fatalf("tax = %v, want 3", total.ExtraCategoryTotals["tax"])
	}
	if total.ExtraCategoryTotals["shipping"] != 3 {
		t.Fatalf("shipping = %v, want 3", total.ExtraCategoryTotals["shipping"])
	}
	// The month that started the fold must be untouched by later additions.
	if months[0].ExtraCategoryTotals["tax"] != 1 || len(months[0].ExtraCategoryTotals) != 1 {
		t.Fatalf("the first month was mutated by the fold: %v", months[0].ExtraCategoryTotals)
	}
}

// These sub-documents are always stored, even when zero. Pinning that here means a
// change to how they are encoded — a pointer field, or the encoder's OmitZeroStruct
// being enabled — shows up as a failing test rather than as documents that silently
// stop carrying a key readers expect.
func TestZeroRowsStoreTheirStructFields(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name string
		doc  any
		want string
	}{
		{"ProductionTotalsRow", ProductionTotalsRow{ID: "acct|1"}, "breakdown"},
		{"CorpProductionTotalsRow", CorpProductionTotalsRow{ID: "acct|1"}, "breakdown"},
		{"ArchivedJobStats", ArchivedJobStats{}, "costMonth"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			keys := bsonKeys(t, tc.doc)
			if _, ok := keys[tc.want]; !ok {
				t.Fatalf("%s is absent from a zero %s; if it is now omitted, the field's tag and this test disagree",
					tc.want, tc.name)
			}
		})
	}
}

// bson ",omitempty" is a no-op on a struct-typed field in mongo-driver v2: it tests
// the zero value of primitives, maps, slices and pointers only, and the driver has
// no "omitzero". Carrying it on a struct field claims the sub-document is optional
// while it is always written, which is exactly the kind of tag a reader trusts.
//
// Pointer-to-struct fields are exempt: omitempty works on a nil pointer.
func TestNoStructFieldClaimsOmitempty(t *testing.T) {
	t.Parallel()

	for _, doc := range []any{
		ProductionTotalsRow{}, CorpProductionTotalsRow{}, ProductionTotalsBreakdown{}, ArchiveSegmentTotals{},
		ArchivedJobStats{}, ArchivedJobLine{}, ArchivedJobTransactionLine{}, ArchivedJobFeeLine{},
		TimelineTotals{}, ProductionTotalsTimelineBucket{}, AccountTimelineMonthBucket{},
	} {
		checkNoStructOmitempty(t, reflect.TypeOf(doc))
	}
}

func checkNoStructOmitempty(t *testing.T, typ reflect.Type) {
	t.Helper()
	if typ.Kind() != reflect.Struct {
		return
	}
	for field := range typ.Fields() {
		tag := field.Tag.Get("bson")
		if field.Type.Kind() == reflect.Struct && field.Type != reflect.TypeFor[time.Time]() &&
			strings.Contains(tag, ",omitempty") {
			t.Errorf("%s.%s is a struct with bson %q — omitempty does nothing here, so the tag misleads",
				typ.Name(), field.Name, tag)
		}
		if field.Type.Kind() == reflect.Struct {
			checkNoStructOmitempty(t, field.Type)
		}
	}
}
