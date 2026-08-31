package statistics

import (
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
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

// timelineItemPagingRules describe the ranking the item breakdown accepts.
var timelineItemPagingRules = helper.PagingRules{
	Sortable:       eipmongo.TimelineSortable,
	SortableFields: eipmongo.TimelineSortableMeasures,
	DefaultLimit:   defaultItemLimit,
	MaxLimit:       maxItemLimit,
	CodePrefix:     "statistics",
}

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

// parseMonth reads a YYYY-MM query parameter, reporting the statistics failure
// class for a value MonthKey cannot parse.
func parseMonth(name, raw string) (eipmongo.MonthKey, error) {
	month, err := eipmongo.ParseMonthKey(raw)
	if err != nil {
		return eipmongo.MonthKey{}, helper.BadParam("statistics_invalid_month", "invalid_month",
			"%s must be a calendar month as YYYY-MM, got %q", name, raw)
	}
	return month, nil
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
		return timelineWindow{}, helper.BadParam("statistics_incomplete_range", "incomplete_range",
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
		return timelineWindow{}, helper.BadParam("statistics_range_reversed", "range_reversed",
			"to (%s) is before from (%s)", to, from)
	}

	window := timelineWindow{From: from, To: to}
	if window.months() > maxTimelineMonths {
		// Refused rather than truncated: a shortened range is indistinguishable
		// from missing data once it reaches a chart.
		return timelineWindow{}, helper.BadParam("statistics_range_too_long", "range_too_long",
			"range covers %d months, the maximum is %d", window.months(), maxTimelineMonths)
	}
	return window, nil
}

// resolveProductionChainScope reads whether an item's chain output is counted.
//
// Only a view scoped to one item may ask for it. Summed across item types those
// costs appear twice — once as the intermediate, once through the parent job
// that consumed its output — so an unscoped request is read as off rather than
// refused, the figures being the ones the caller can correctly use.
func resolveProductionChainScope(r *http.Request, typeID int) bool {
	return typeID > 0 && helper.BoolParam(r, "includeProductionChain")
}
