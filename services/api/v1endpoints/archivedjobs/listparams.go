package archivedjobs

import (
	"net/http"
	"strings"

	"eve-industry-planner/api/helper"
	eipmongo "eve-industry-planner/shared/mongo"
)

const (
	defaultListLimit = 50
	maxListLimit     = 200

	// maxSearchLength bounds a regex the caller supplies.
	maxSearchLength = 100
)

var listPagingRules = helper.PagingRules{
	Sortable:         ArchivedJobSortable,
	SortableFields:   ArchivedJobSortableFields,
	DefaultAscending: ArchivedJobDefaultAscending,
	DefaultLimit:     defaultListLimit,
	MaxLimit:         maxListLimit,
	CodePrefix:       "archived_jobs_list",
}

// resolveListQuery reads the list filters. Either range bound may be given
// alone: the range narrows the archive rather than defining a window.
func resolveListQuery(r *http.Request, scope archiveScope) (ArchivedJobQuery, error) {
	q := ArchivedJobQuery{Scope: scope}

	if raw := strings.TrimSpace(r.URL.Query().Get("from")); raw != "" {
		from, err := parseListMonth("from", raw)
		if err != nil {
			return q, err
		}
		q.From = from
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("to")); raw != "" {
		to, err := parseListMonth("to", raw)
		if err != nil {
			return q, err
		}
		q.To = to
	}
	if !q.From.IsZero() && !q.To.IsZero() && q.To.Before(q.From) {
		return q, helper.BadParam("archived_jobs_list_range_reversed", "range_reversed",
			"to (%s) is before from (%s)", q.To, q.From)
	}

	typeID, err := helper.ParseTypeID(r, "archived_jobs_list")
	if err != nil {
		return q, err
	}
	q.TypeID = typeID

	q.GroupID = strings.TrimSpace(r.URL.Query().Get("groupID"))

	search := strings.TrimSpace(r.URL.Query().Get("search"))
	if len(search) > maxSearchLength {
		return q, helper.BadParam("archived_jobs_list_search_too_long", "search_too_long",
			"search is %d characters, the maximum is %d", len(search), maxSearchLength)
	}
	q.Search = search

	return q, nil
}

// parseListMonth reads a YYYY-MM bound under the list's failure class.
func parseListMonth(name, raw string) (eipmongo.MonthKey, error) {
	month, err := eipmongo.ParseMonthKey(raw)
	if err != nil {
		return eipmongo.MonthKey{}, helper.BadParam("archived_jobs_list_invalid_month", "invalid_month",
			"%s must be a calendar month as YYYY-MM, got %q", name, raw)
	}
	return month, nil
}
