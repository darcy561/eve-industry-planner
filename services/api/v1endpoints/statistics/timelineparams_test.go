package statistics

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"eve-industry-planner/api/helper"
	eipmongo "eve-industry-planner/shared/mongo"
)

func requestWithQuery(t *testing.T, query string) *http.Request {
	t.Helper()
	return httptest.NewRequest(http.MethodGet, "/api/v1/statistics/account/timeline?"+query, nil)
}

func paramCode(t *testing.T, err error) string {
	t.Helper()
	pErr, ok := errors.AsType[helper.ParamError](err)
	if !ok {
		t.Fatalf("expected a helper.ParamError, got %v", err)
	}
	return pErr.Code
}

// The dashboard's month-on-month comparison is the bare endpoint with no
// parameters, so the default window has to be the current month and the one
// before it.
func TestDefaultWindowIsCurrentAndPreviousMonth(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.August, 22, 12, 0, 0, 0, time.UTC)
	window, err := resolveTimelineWindow(requestWithQuery(t, ""), now)
	if err != nil {
		t.Fatal(err)
	}
	if window.From != (eipmongo.MonthKey{Year: 2026, Month: 7}) {
		t.Fatalf("from = %v, want 2026-07", window.From)
	}
	if window.To != (eipmongo.MonthKey{Year: 2026, Month: 8}) {
		t.Fatalf("to = %v, want 2026-08", window.To)
	}
	if window.months() != 2 {
		t.Fatalf("default window covers %d months, want 2", window.months())
	}
	if !window.Defaulted {
		t.Fatal("the default window must be marked defaulted, or a client cannot tell it from a narrow explicit range")
	}
}

// Every January the default window crosses a year boundary, so this is the
// common case rather than an edge one.
func TestDefaultWindowCrossesTheYearBoundary(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.January, 4, 0, 0, 0, 0, time.UTC)
	window, err := resolveTimelineWindow(requestWithQuery(t, ""), now)
	if err != nil {
		t.Fatal(err)
	}
	if window.From != (eipmongo.MonthKey{Year: 2025, Month: 12}) {
		t.Fatalf("from = %v, want 2025-12", window.From)
	}
	if window.To != (eipmongo.MonthKey{Year: 2026, Month: 1}) {
		t.Fatalf("to = %v, want 2026-01", window.To)
	}
}

func TestExplicitWindowIsNotMarkedDefaulted(t *testing.T) {
	t.Parallel()

	window, err := resolveTimelineWindow(requestWithQuery(t, "from=2026-01&to=2026-03"), time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	if window.Defaulted {
		t.Fatal("an explicit range must not be reported as defaulted")
	}
	if window.months() != 3 {
		t.Fatalf("January to March covers %d months, want 3", window.months())
	}
}

// Half a range is rejected rather than half-defaulted: a caller asking for
// "since March" and silently getting "March to March" would read the result as
// missing data.
func TestHalfARangeIsRejected(t *testing.T) {
	t.Parallel()

	for _, query := range []string{"from=2026-01", "to=2026-03"} {
		_, err := resolveTimelineWindow(requestWithQuery(t, query), time.Now().UTC())
		if err == nil {
			t.Fatalf("%s: expected an error when only one bound is given", query)
		}
		if code := paramCode(t, err); code != "statistics_incomplete_range" {
			t.Fatalf("%s: code = %q, want statistics_incomplete_range", query, code)
		}
	}
}

func TestMalformedMonthsAreRejected(t *testing.T) {
	t.Parallel()

	cases := []string{
		"from=2026-1&to=2026-03",   // month not zero-padded
		"from=26-01&to=2026-03",    // two-digit year
		"from=2026-13&to=2026-14",  // month out of range
		"from=2026-00&to=2026-03",  // month zero
		"from=August&to=September", // not a date at all
		"from=2026-01-05&to=2026-03",
	}
	for _, query := range cases {
		_, err := resolveTimelineWindow(requestWithQuery(t, query), time.Now().UTC())
		if err == nil {
			t.Fatalf("%s: expected a rejection", query)
		}
		if code := paramCode(t, err); code != "statistics_invalid_month" {
			t.Fatalf("%s: code = %q, want statistics_invalid_month", query, code)
		}
	}
}

func TestReversedRangeIsRejected(t *testing.T) {
	t.Parallel()

	_, err := resolveTimelineWindow(requestWithQuery(t, "from=2026-08&to=2026-06"), time.Now().UTC())
	if err == nil {
		t.Fatal("expected an error when to precedes from")
	}
	if code := paramCode(t, err); code != "statistics_range_reversed" {
		t.Fatalf("code = %q, want statistics_range_reversed", code)
	}
}

// An over-long range is refused rather than trimmed: a silently shortened window
// is indistinguishable from missing data once it reaches a chart.
func TestOverlongRangeIsRejectedNotTruncated(t *testing.T) {
	t.Parallel()

	_, err := resolveTimelineWindow(requestWithQuery(t, "from=2000-01&to=2026-08"), time.Now().UTC())
	if err == nil {
		t.Fatal("expected an error for a range beyond the maximum")
	}
	if code := paramCode(t, err); code != "statistics_range_too_long" {
		t.Fatalf("code = %q, want statistics_range_too_long", code)
	}
}

func TestTypeIDIsOptionalAndValidated(t *testing.T) {
	t.Parallel()

	typeID, err := helper.ParseTypeID(requestWithQuery(t, ""), "statistics")
	if err != nil || typeID != 0 {
		t.Fatalf("absent typeID = %d, %v; want 0 with no error so every type is read", typeID, err)
	}

	typeID, err = helper.ParseTypeID(requestWithQuery(t, "typeID=34"), "statistics")
	if err != nil || typeID != 34 {
		t.Fatalf("typeID = %d, %v; want 34", typeID, err)
	}

	for _, query := range []string{"typeID=0", "typeID=-1", "typeID=abc"} {
		if _, err := helper.ParseTypeID(requestWithQuery(t, query), "statistics"); err == nil {
			t.Fatalf("%s: expected a rejection", query)
		}
	}
}

func TestItemPagingDefaults(t *testing.T) {
	t.Parallel()

	paging, err := helper.ResolvePaging(requestWithQuery(t, ""), timelineItemPagingRules)
	if err != nil {
		t.Fatal(err)
	}
	if paging.Limit != defaultItemLimit {
		t.Fatalf("limit = %d, want the default %d", paging.Limit, defaultItemLimit)
	}
	if paging.Offset != 0 {
		t.Fatalf("offset = %d, want 0", paging.Offset)
	}
	if paging.Ascending {
		t.Fatal("the default ranking is descending: the interesting items are the biggest")
	}
	if paging.Sort != "" {
		t.Fatalf("sort = %q, want empty so the query layer applies its own default", paging.Sort)
	}
}

// The sort value reaches a $sort key, so it is validated against the measures
// the aggregation accepts rather than passed through.
func TestItemPagingRejectsUnknownSort(t *testing.T) {
	t.Parallel()

	_, err := helper.ResolvePaging(requestWithQuery(t, "sort=_id"), timelineItemPagingRules)
	if err == nil {
		t.Fatal("expected a rejection for a field outside the sortable set")
	}
	if code := paramCode(t, err); code != "statistics_invalid_sort" {
		t.Fatalf("code = %q, want statistics_invalid_sort", code)
	}

	for _, measure := range eipmongo.TimelineSortableMeasures() {
		if _, err := helper.ResolvePaging(requestWithQuery(t, "sort="+measure), timelineItemPagingRules); err != nil {
			t.Fatalf("advertised measure %q was rejected: %v", measure, err)
		}
	}
}

func TestItemPagingRejectsBadPaging(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		"limit=0":     "statistics_invalid_limit",
		"limit=-5":    "statistics_invalid_limit",
		"limit=abc":   "statistics_invalid_limit",
		"limit=10000": "statistics_limit_too_large",
		"offset=-1":   "statistics_invalid_offset",
		"offset=abc":  "statistics_invalid_offset",
		"order=up":    "statistics_invalid_order",
	}
	for query, wantCode := range cases {
		_, err := helper.ResolvePaging(requestWithQuery(t, query), timelineItemPagingRules)
		if err == nil {
			t.Fatalf("%s: expected a rejection", query)
		}
		if code := paramCode(t, err); code != wantCode {
			t.Fatalf("%s: code = %q, want %q", query, code, wantCode)
		}
	}
}

func TestItemPagingAcceptsExplicitOrder(t *testing.T) {
	t.Parallel()

	asc, err := helper.ResolvePaging(requestWithQuery(t, "order=asc"), timelineItemPagingRules)
	if err != nil || !asc.Ascending {
		t.Fatalf("order=asc did not select ascending: %+v %v", asc, err)
	}
	desc, err := helper.ResolvePaging(requestWithQuery(t, "order=desc"), timelineItemPagingRules)
	if err != nil || desc.Ascending {
		t.Fatalf("order=desc did not select descending: %+v %v", desc, err)
	}
}

// The sortable list reaches an error message, so its order has to be stable or
// the same rejection reads differently on each request.
func TestSortableMeasuresAreStablyOrdered(t *testing.T) {
	t.Parallel()

	first := eipmongo.TimelineSortableMeasures()
	for range 20 {
		next := eipmongo.TimelineSortableMeasures()
		for i := range first {
			if first[i] != next[i] {
				t.Fatalf("sortable measures are not stably ordered: %v then %v", first, next)
			}
		}
	}
}
