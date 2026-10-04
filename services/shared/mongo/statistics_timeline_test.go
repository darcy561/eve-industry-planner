package mongo

import (
	"eve-industry-planner/shared/models"
	"fmt"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestMonthKeyStringIsZeroPadded(t *testing.T) {
	t.Parallel()

	if got := (MonthKey{Year: 2026, Month: 2}).String(); got != "2026-02" {
		t.Fatalf("MonthKey.String() = %q, want 2026-02", got)
	}
}

func TestCurrentMonthUsesUTC(t *testing.T) {
	t.Parallel()

	newYear := time.Date(2026, time.January, 1, 2, 0, 0, 0, time.UTC)
	if got := CurrentMonth(newYear.In(time.FixedZone("UTC-5", -5*3600))); got != (MonthKey{Year: 2026, Month: 1}) {
		t.Fatalf("CurrentMonth = %v, want 2026-01 regardless of the zone the caller passes", got)
	}
}

func TestAddMonthsCrossesYearBoundaries(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		start MonthKey
		delta int
		want  MonthKey
	}{
		{"back over new year", MonthKey{2026, 1}, -1, MonthKey{2025, 12}},
		{"forward over new year", MonthKey{2025, 12}, 1, MonthKey{2026, 1}},
		{"back a full year", MonthKey{2026, 6}, -12, MonthKey{2025, 6}},
		{"back several years", MonthKey{2026, 3}, -27, MonthKey{2023, 12}},
		{"no movement", MonthKey{2026, 7}, 0, MonthKey{2026, 7}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := tc.start.AddMonths(tc.delta); got != tc.want {
				t.Fatalf("%v.AddMonths(%d) = %v, want %v", tc.start, tc.delta, got, tc.want)
			}
			if got := tc.start.AddMonths(tc.delta); got.Month < 1 || got.Month > 12 {
				t.Fatalf("month %d is outside 1..12", got.Month)
			}
		})
	}
}

func TestMonthOrdinalOrdersAcrossYears(t *testing.T) {
	t.Parallel()

	dec := monthOrdinal(MonthKey{2025, 12})
	jan := monthOrdinal(MonthKey{2026, 1})
	feb := monthOrdinal(MonthKey{2026, 2})

	if !(dec < jan && jan < feb) {
		t.Fatalf("ordinals are not ascending across the year boundary: dec=%d jan=%d feb=%d", dec, jan, feb)
	}
	if jan-dec != 1 {
		t.Fatalf("December to January should be one step, got %d", jan-dec)
	}
}

func TestMonthKeyBefore(t *testing.T) {
	t.Parallel()

	if !(MonthKey{2025, 12}).Before(MonthKey{2026, 1}) {
		t.Fatal("December 2025 should be before January 2026")
	}
	if (MonthKey{2026, 3}).Before(MonthKey{2026, 3}) {
		t.Fatal("a month is not before itself")
	}
	if (MonthKey{2026, 4}).Before(MonthKey{2026, 3}) {
		t.Fatal("April should not be before March")
	}
}

func TestTimelineRangeFilterOmitsTypeWhenUnset(t *testing.T) {
	t.Parallel()

	all := timelineRangeFilter(TimelineQuery{Owner: models.AccountOwner("acct-1")})
	if _, ok := all["typeID"]; ok {
		t.Fatal("typeID must be absent when unset, or the month view would read one type instead of summing every type")
	}

	one := timelineRangeFilter(TimelineQuery{Owner: models.AccountOwner("acct-1"), TypeID: 34})
	if one["typeID"] != 34 {
		t.Fatalf("typeID = %v, want 34", one["typeID"])
	}
	if one[FieldMetaOwnerKind] != models.OwnerAccount || one[FieldMetaOwnerID] != "acct-1" {
		t.Fatal("the owner filter must survive alongside the type filter")
	}
}

func TestSumMeasuresGroupOmitsExtraCategoryTotals(t *testing.T) {
	t.Parallel()

	group := sumMeasuresGroup("$typeID")
	if _, ok := group["extraCategoryTotals"]; ok {
		t.Fatal("extraCategoryTotals cannot be summed by $sum; fold with SalesMeasures.Plus instead")
	}
	if len(group) != len(summableMeasureFields())+1 {
		t.Fatalf("group has %d entries for %d measures plus _id", len(group), len(summableMeasureFields()))
	}
	for _, measure := range []string{
		"salesTotal", "jobCostTotal", "profitLoss", "transactionCount", "quantitySold",
		"transactionFeeTotal", "brokersFeeTotal",
		"materialCostTotal", "inventionCostTotal", "installCostTotal", "extrasTotal",
	} {
		if _, ok := group[measure]; !ok {
			t.Fatalf("%s is missing from the group stage, so it would come back zero", measure)
		}
	}
}

func TestMonthlyGroupCollectsExtraCategoryTotals(t *testing.T) {
	t.Parallel()

	group := extraCategoryTotalsPush(sumMeasuresGroup(bson.M{"year": "$year", "month": "$month"}))
	push, ok := group[extraCategoryTotalsField]
	if !ok {
		t.Fatal("the monthly group drops extraCategoryTotals, so the extras chart has nothing to draw")
	}
	if want := (bson.M{"$push": "$extraCategoryTotals"}); fmt.Sprint(push) != fmt.Sprint(want) {
		t.Fatalf("collected with %v, want %v", push, want)
	}
}

func TestMonthFoldSumsExtrasByCategory(t *testing.T) {
	t.Parallel()

	row := timelineMonthAggregateRow{
		Year: 2026, Month: 3,
		SalesTotal: 100,
		ExtraCategoryTotals: []map[string]float64{
			{"1": 10, "2": 5},
			{"1": 2.5},
			{},
		},
	}

	folded := row.fold()

	if folded.SalesTotal != 100 || folded.Year != 2026 || folded.Month != 3 {
		t.Fatalf("folding changed the summed measures: %+v", folded)
	}
	if got := folded.ExtraCategoryTotals["1"]; got != 12.5 {
		t.Fatalf("category 1 = %v, want the buckets summed to 12.5", got)
	}
	if got := folded.ExtraCategoryTotals["2"]; got != 5 {
		t.Fatalf("category 2 = %v, want 5", got)
	}
}

func TestMonthFoldLeavesExtrasUnsetWhenThereAreNone(t *testing.T) {
	t.Parallel()

	row := timelineMonthAggregateRow{
		SalesTotal: 10,
	}

	if folded := row.fold(); folded.ExtraCategoryTotals != nil {
		t.Fatalf("extraCategoryTotals = %v, want nil", folded.ExtraCategoryTotals)
	}
}

func TestTimelineQueriesRejectBadInput(t *testing.T) {
	t.Parallel()

	var nilMongo *Mongo
	ctx := t.Context()

	if _, err := nilMongo.TimelineMonths(ctx, TimelineQuery{Owner: models.AccountOwner("acct-1")}); err == nil {
		t.Fatal("expected an error without a mongo handle")
	}

	m := &Mongo{}
	if _, err := m.TimelineMonths(ctx, TimelineQuery{}); err == nil {
		t.Fatal("expected an error without an accountID")
	}

	backwards := TimelineQuery{Owner: models.AccountOwner("acct-1"), From: MonthKey{2026, 8}, To: MonthKey{2026, 6}}
	if _, err := m.TimelineMonths(ctx, backwards); err == nil {
		t.Fatal("expected an error when the range ends before it starts")
	}
	if _, err := m.TimelineItems(ctx, backwards, "", false, 10, 0); err == nil {
		t.Fatal("expected an error when the item range ends before it starts")
	}
}

func TestTimelineItemsRejectsUnknownSortField(t *testing.T) {
	t.Parallel()

	m := &Mongo{}
	q := TimelineQuery{Owner: models.AccountOwner("acct-1"), From: MonthKey{2026, 7}, To: MonthKey{2026, 8}}

	if _, err := m.TimelineItems(t.Context(), q, "_id", false, 10, 0); err == nil {
		t.Fatal("expected an error for a field outside the sortable set")
	}
	for _, measure := range TimelineSortableMeasures() {
		if !timelineSortable[measure] {
			t.Fatalf("%s is advertised as sortable but not accepted", measure)
		}
	}
}

func TestTimelineItemsRejectsBadPaging(t *testing.T) {
	t.Parallel()

	m := &Mongo{}
	q := TimelineQuery{Owner: models.AccountOwner("acct-1"), From: MonthKey{2026, 7}, To: MonthKey{2026, 8}}

	if _, err := m.TimelineItems(t.Context(), q, "", false, 0, 0); err == nil {
		t.Fatal("expected an error for a non-positive limit: an unbounded page is the payload this view exists to avoid")
	}
	if _, err := m.TimelineItems(t.Context(), q, "", false, 10, -1); err == nil {
		t.Fatal("expected an error for a negative offset")
	}
}

func TestTimelineFilterNamesTheOwnerFields(t *testing.T) {
	t.Parallel()

	filter := timelineRangeFilter(TimelineQuery{Owner: models.AccountOwner("acct-1")})

	if filter[FieldMetaOwnerKind] != models.OwnerAccount {
		t.Errorf("owner.kind = %v, want the account kind", filter[FieldMetaOwnerKind])
	}
	if filter[FieldMetaOwnerID] != "acct-1" {
		t.Errorf("owner.id = %v, want the account id", filter[FieldMetaOwnerID])
	}
	if _, stale := filter["accountID"]; stale {
		t.Error("the filter still names accountID, which no bucket carries")
	}
}

func TestMonthKeyStartIsTheFirstInstantOfTheMonthInUTC(t *testing.T) {
	t.Parallel()

	got := MonthKey{Year: 2026, Month: 2}.Start()

	if want := time.Date(2026, time.February, 1, 0, 0, 0, 0, time.UTC); !got.Equal(want) || got.Location() != time.UTC {
		t.Errorf("Start = %v, want %v", got, want)
	}
}
