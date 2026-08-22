package statistics

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"
)

const (
	// defaultTimelineMonths is the window a request with no range gets: the
	// current month and the one before it.
	//
	// Two rather than a longer default because the dashboard's month-on-month
	// comparison is the common read, so its query is the bare endpoint with no
	// parameters. A caller that omits the range cannot accidentally ask for an
	// account's whole history.
	defaultTimelineMonths = 2

	// maxTimelineMonths bounds an explicit range. Five years of monthly rows for
	// every item type an account touched is enough to be worth refusing rather
	// than serving slowly.
	maxTimelineMonths = 60

	// defaultItemLimit and maxItemLimit page the per-item breakdown. An account
	// can hold thousands of item types in a window, which is the payload the
	// breakdown is a separate view to avoid.
	defaultItemLimit = 25
	maxItemLimit     = 200
)

// timelineWindow is the resolved month range a request reads.
type timelineWindow struct {
	From eipmongo.MonthKey
	To   eipmongo.MonthKey
	// Defaulted records that neither bound was supplied, so the response can say
	// the window was chosen for the caller. Without it a client cannot tell a
	// narrow default from an account with little data.
	Defaulted bool
}

// months returns the number of calendar months the window covers, inclusive.
func (w timelineWindow) months() int {
	return (w.To.Year*12 + w.To.Month) - (w.From.Year*12 + w.From.Month) + 1
}

// paramError is a bad request carrying the code the handler reports.
type paramError struct {
	code    string
	metric  string
	message string
}

func (e paramError) Error() string { return e.message }

func badParam(code, metric, format string, args ...any) paramError {
	return paramError{code: code, metric: metric, message: fmt.Sprintf(format, args...)}
}

// parseMonth reads a YYYY-MM query parameter.
//
// The wire format matches the timeline document _id, so a month a caller names
// is the month the rows were filed under, with no second convention to keep in
// step.
func parseMonth(name, raw string) (eipmongo.MonthKey, error) {
	parts := strings.Split(raw, "-")
	if len(parts) != 2 || len(parts[0]) != 4 || len(parts[1]) != 2 {
		return eipmongo.MonthKey{}, badParam("statistics_invalid_month", "invalid_month",
			"%s must be a calendar month as YYYY-MM, got %q", name, raw)
	}
	year, yErr := strconv.Atoi(parts[0])
	month, mErr := strconv.Atoi(parts[1])
	if yErr != nil || mErr != nil || month < 1 || month > 12 {
		return eipmongo.MonthKey{}, badParam("statistics_invalid_month", "invalid_month",
			"%s must be a calendar month as YYYY-MM, got %q", name, raw)
	}
	return eipmongo.MonthKey{Year: year, Month: month}, nil
}

// resolveTimelineWindow reads from / to, applying the default window when both
// are absent.
//
// Supplying one bound and not the other is rejected rather than half-defaulted:
// a caller that asks for "since March" and silently gets "March to March" would
// see missing data rather than an error.
func resolveTimelineWindow(r *http.Request, now time.Time) (timelineWindow, error) {
	fromRaw := strings.TrimSpace(r.URL.Query().Get("from"))
	toRaw := strings.TrimSpace(r.URL.Query().Get("to"))

	if fromRaw == "" && toRaw == "" {
		current := eipmongo.CurrentMonth(now)
		return timelineWindow{
			From:      current.AddMonths(-(defaultTimelineMonths - 1)),
			To:        current,
			Defaulted: true,
		}, nil
	}
	if fromRaw == "" || toRaw == "" {
		return timelineWindow{}, badParam("statistics_incomplete_range", "incomplete_range",
			"from and to must be given together, or both omitted for the trailing %d months", defaultTimelineMonths)
	}

	from, err := parseMonth("from", fromRaw)
	if err != nil {
		return timelineWindow{}, err
	}
	to, err := parseMonth("to", toRaw)
	if err != nil {
		return timelineWindow{}, err
	}
	if to.Before(from) {
		return timelineWindow{}, badParam("statistics_range_reversed", "range_reversed",
			"to (%s) is before from (%s)", to, from)
	}

	window := timelineWindow{From: from, To: to}
	if window.months() > maxTimelineMonths {
		// Refused rather than truncated: a shortened range is indistinguishable
		// from missing data once it reaches a chart.
		return timelineWindow{}, badParam("statistics_range_too_long", "range_too_long",
			"range covers %d months, the maximum is %d", window.months(), maxTimelineMonths)
	}
	return window, nil
}

// parseTypeID reads the optional typeID filter. Zero means every item type.
func parseTypeID(r *http.Request) (int, error) {
	raw := strings.TrimSpace(r.URL.Query().Get("typeID"))
	if raw == "" {
		return 0, nil
	}
	typeID, err := strconv.Atoi(raw)
	if err != nil || typeID <= 0 {
		return 0, badParam("statistics_invalid_type_id", "invalid_type_id",
			"typeID must be a positive integer, got %q", raw)
	}
	return typeID, nil
}

// itemPaging is the resolved ordering and page for the per-item breakdown.
type itemPaging struct {
	Sort      string
	Ascending bool
	Limit     int
	Offset    int
}

// resolveItemPaging reads sort, order, limit and offset.
//
// Ranking is server-side because a page of arbitrary rows cannot be ordered by
// the client, so the sort field is validated here against the measures the
// aggregation accepts rather than passed through to a $sort key.
func resolveItemPaging(r *http.Request) (itemPaging, error) {
	q := r.URL.Query()
	out := itemPaging{Limit: defaultItemLimit}

	if sort := strings.TrimSpace(q.Get("sort")); sort != "" {
		if !eipmongo.TimelineSortable(sort) {
			return out, badParam("statistics_invalid_sort", "invalid_sort",
				"sort must be one of %s, got %q", strings.Join(eipmongo.TimelineSortableMeasures(), ", "), sort)
		}
		out.Sort = sort
	}

	switch order := strings.TrimSpace(q.Get("order")); order {
	case "", "desc":
	case "asc":
		out.Ascending = true
	default:
		return out, badParam("statistics_invalid_order", "invalid_order",
			"order must be asc or desc, got %q", order)
	}

	if raw := strings.TrimSpace(q.Get("limit")); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit <= 0 {
			return out, badParam("statistics_invalid_limit", "invalid_limit",
				"limit must be a positive integer, got %q", raw)
		}
		if limit > maxItemLimit {
			return out, badParam("statistics_limit_too_large", "limit_too_large",
				"limit %d exceeds the maximum of %d", limit, maxItemLimit)
		}
		out.Limit = limit
	}

	if raw := strings.TrimSpace(q.Get("offset")); raw != "" {
		offset, err := strconv.Atoi(raw)
		if err != nil || offset < 0 {
			return out, badParam("statistics_invalid_offset", "invalid_offset",
				"offset must be zero or a positive integer, got %q", raw)
		}
		out.Offset = offset
	}

	return out, nil
}
