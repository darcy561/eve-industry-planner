package archivedjobs

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eve-industry-planner/api/helper"
	eipmongo "eve-industry-planner/shared/mongo"
)

// testScope needs no Mongo: parameter parsing never reaches a collection.
func testScope(ownerID string) archiveScope {
	return archiveScope{
		OwnerID:     ownerID,
		ownerFilter: eipmongo.ArchivedJobAccountFilter,
	}
}

func listRequest(t *testing.T, query string) *http.Request {
	t.Helper()
	return httptest.NewRequest(http.MethodGet, "/api/v1/archived-jobs?"+query, nil)
}

func listParamCode(t *testing.T, err error) string {
	t.Helper()
	pErr, ok := errors.AsType[helper.ParamError](err)
	if !ok {
		t.Fatalf("expected a helper.ParamError, got %v", err)
	}
	return pErr.Code
}

// The bare list filters nothing, unlike the timeline, which defaults a window.
func TestBareListQueryFiltersNothing(t *testing.T) {
	query, err := resolveListQuery(listRequest(t, ""), testScope("account-1"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !query.From.IsZero() || !query.To.IsZero() {
		t.Fatalf("expected an unbounded range, got %v to %v", query.From, query.To)
	}
	if query.TypeID != 0 || query.GroupID != "" || query.Search != "" {
		t.Fatalf("expected no filters, got %+v", query)
	}
	if query.Scope.OwnerID != "account-1" {
		t.Fatalf("archive scope owner lost: %q", query.Scope.OwnerID)
	}
}

// "Everything since March" is meaningful for a list, unlike for the timeline.
func TestListAcceptsOneBound(t *testing.T) {
	query, err := resolveListQuery(listRequest(t, "from=2026-03"), testScope("account-1"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if query.From.String() != "2026-03" {
		t.Fatalf("from = %v, want 2026-03", query.From)
	}
	if !query.To.IsZero() {
		t.Fatalf("to should stay open, got %v", query.To)
	}
}

// A reversed range matches nothing, which would read as data loss.
func TestListRejectsReversedRange(t *testing.T) {
	_, err := resolveListQuery(listRequest(t, "from=2026-06&to=2026-03"), testScope("account-1"))
	if err == nil {
		t.Fatal("expected a reversed range to be rejected")
	}
	if code := listParamCode(t, err); code != "archived_jobs_list_range_reversed" {
		t.Fatalf("code = %q", code)
	}
}

func TestListRejectsMalformedMonths(t *testing.T) {
	for _, query := range []string{"from=2026", "from=26-03", "to=2026-13", "to=not-a-month"} {
		_, err := resolveListQuery(listRequest(t, query), testScope("account-1"))
		if err == nil {
			t.Fatalf("expected %q to be rejected", query)
		}
		if code := listParamCode(t, err); code != "archived_jobs_list_invalid_month" {
			t.Fatalf("%q gave code %q", query, code)
		}
	}
}

// An unbounded pattern is cheap to ask for and expensive to run.
func TestListRejectsOverlongSearch(t *testing.T) {
	_, err := resolveListQuery(listRequest(t, "search="+strings.Repeat("a", maxSearchLength+1)), testScope("account-1"))
	if err == nil {
		t.Fatal("expected an overlong search to be rejected")
	}
	if code := listParamCode(t, err); code != "archived_jobs_list_search_too_long" {
		t.Fatalf("code = %q", code)
	}
}

// Unquoted, a name containing "(" is an invalid pattern and "." is a wildcard.
func TestSearchTreatsMetacharactersLiterally(t *testing.T) {
	query, err := resolveListQuery(listRequest(t, "search=Rifter+%28copy%29"), testScope("account-1"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if query.Search != "Rifter (copy)" {
		t.Fatalf("search = %q", query.Search)
	}
}

// The job a user wants back is usually one archived recently.
func TestListPagingDefaultsToNewestFirst(t *testing.T) {
	paging, err := helper.ResolvePaging(listRequest(t, ""), listPagingRules)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if paging.Ascending {
		t.Fatal("expected descending order by default")
	}
	if paging.Limit != defaultListLimit {
		t.Fatalf("limit = %d, want %d", paging.Limit, defaultListLimit)
	}
	if paging.Order() != "desc" {
		t.Fatalf("order = %q", paging.Order())
	}
}

// An arbitrary sort field would reach the $sort key.
func TestListRejectsUnknownSortField(t *testing.T) {
	_, err := helper.ResolvePaging(listRequest(t, "sort=_id"), listPagingRules)
	if err == nil {
		t.Fatal("expected an unknown sort field to be rejected")
	}
	if code := listParamCode(t, err); code != "archived_jobs_list_invalid_sort" {
		t.Fatalf("code = %q", code)
	}
}

// The rejection message must not name a value the endpoint then refuses.
func TestEveryAdvertisedSortFieldIsAccepted(t *testing.T) {
	for _, field := range ArchivedJobSortableFields() {
		if _, err := helper.ResolvePaging(listRequest(t, "sort="+field), listPagingRules); err != nil {
			t.Fatalf("advertised sort field %q was rejected: %v", field, err)
		}
	}
}

func TestListRejectsOutOfBoundsPaging(t *testing.T) {
	cases := map[string]string{
		"limit=0":     "archived_jobs_list_invalid_limit",
		"limit=-1":    "archived_jobs_list_invalid_limit",
		"limit=10000": "archived_jobs_list_limit_too_large",
		"offset=-1":   "archived_jobs_list_invalid_offset",
		"order=up":    "archived_jobs_list_invalid_order",
	}
	for query, want := range cases {
		_, err := helper.ResolvePaging(listRequest(t, query), listPagingRules)
		if err == nil {
			t.Fatalf("expected %q to be rejected", query)
		}
		if code := listParamCode(t, err); code != want {
			t.Fatalf("%q gave code %q, want %q", query, code, want)
		}
	}
}
