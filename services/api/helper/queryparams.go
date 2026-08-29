package helper

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// Query parameter parsing shared by the endpoints that page and filter reads.
//
// The statistics views and the archived-job list accept the same vocabulary —
// a YYYY-MM range, an item type, and sort/order/limit/offset paging — so the
// parsing and the rejection codes live here rather than in each endpoint
// package. A client that can drive one of those views can drive the others.

// ParamError is a bad request carrying the failure class the handler reports
// and the metric label it counts under.
type ParamError struct {
	Code    string
	Metric  string
	Message string
}

func (e ParamError) Error() string { return e.Message }

// BadParam builds a [ParamError] with a formatted message.
func BadParam(code, metric, format string, args ...any) ParamError {
	return ParamError{Code: code, Metric: metric, Message: fmt.Sprintf(format, args...)}
}

// RespondParamError writes the 400 a rejected parameter earns.
//
// Ranges and paging are rejected rather than repaired: a shortened range or a
// half-defaulted window is indistinguishable from missing data once it reaches
// a chart, and a caller cannot tell it asked the wrong question.
func RespondParamError(w http.ResponseWriter, r *http.Request, metrics *RequestMetricsTracker, component string, err error) {
	if pErr, ok := errors.AsType[ParamError](err); ok {
		metrics.Error(pErr.Metric)
		RespondEndpointError(w, r, http.StatusBadRequest, pErr.Message, component+": "+pErr.Message, pErr.Code, component, nil, nil)
		return
	}
	metrics.Error("invalid_request")
	RespondEndpointError(w, r, http.StatusBadRequest, "Invalid request", component+": invalid request", component+"_invalid_request", component, err, nil)
}

// ParseTypeID reads the optional typeID filter. Zero means every item type.
func ParseTypeID(r *http.Request, codePrefix string) (int, error) {
	raw := strings.TrimSpace(r.URL.Query().Get("typeID"))
	if raw == "" {
		return 0, nil
	}
	typeID, err := strconv.Atoi(raw)
	if err != nil || typeID <= 0 {
		return 0, BadParam(codePrefix+"_invalid_type_id", "invalid_type_id",
			"typeID must be a positive integer, got %q", raw)
	}
	return typeID, nil
}

// Paging is a resolved ordering and page.
type Paging struct {
	Sort      string
	Ascending bool
	Limit     int
	Offset    int
}

// Order renders the direction as the wire value, so a response echoes what it
// applied rather than what the caller happened to send.
func (p Paging) Order() string {
	if p.Ascending {
		return "asc"
	}
	return "desc"
}

// PagingRules describe what a specific view accepts.
type PagingRules struct {
	// Sortable reports whether a field may be ranked on. Validating here keeps a
	// caller-supplied string out of the $sort key.
	Sortable func(string) bool
	// SortableFields lists the accepted values for the rejection message.
	SortableFields func() []string
	DefaultLimit   int
	MaxLimit       int
	// CodePrefix namespaces the failure classes, so a client can tell which view
	// rejected it.
	CodePrefix string
}

// ResolvePaging reads sort, order, limit and offset against a view's rules.
//
// Ranking is server-side because a page is a window over the whole match:
// ordering the page alone would rank rows against each other rather than
// against everything the query covered.
func ResolvePaging(r *http.Request, rules PagingRules) (Paging, error) {
	q := r.URL.Query()
	out := Paging{Limit: rules.DefaultLimit}

	if sort := strings.TrimSpace(q.Get("sort")); sort != "" {
		if rules.Sortable == nil || !rules.Sortable(sort) {
			var valid string
			if rules.SortableFields != nil {
				valid = strings.Join(rules.SortableFields(), ", ")
			}
			return out, BadParam(rules.CodePrefix+"_invalid_sort", "invalid_sort",
				"sort must be one of %s, got %q", valid, sort)
		}
		out.Sort = sort
	}

	switch order := strings.TrimSpace(q.Get("order")); order {
	case "", "desc":
	case "asc":
		out.Ascending = true
	default:
		return out, BadParam(rules.CodePrefix+"_invalid_order", "invalid_order",
			"order must be asc or desc, got %q", order)
	}

	if raw := strings.TrimSpace(q.Get("limit")); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit <= 0 {
			return out, BadParam(rules.CodePrefix+"_invalid_limit", "invalid_limit",
				"limit must be a positive integer, got %q", raw)
		}
		if limit > rules.MaxLimit {
			return out, BadParam(rules.CodePrefix+"_limit_too_large", "limit_too_large",
				"limit %d exceeds the maximum of %d", limit, rules.MaxLimit)
		}
		out.Limit = limit
	}

	if raw := strings.TrimSpace(q.Get("offset")); raw != "" {
		offset, err := strconv.Atoi(raw)
		if err != nil || offset < 0 {
			return out, BadParam(rules.CodePrefix+"_invalid_offset", "invalid_offset",
				"offset must be zero or a positive integer, got %q", raw)
		}
		out.Offset = offset
	}

	return out, nil
}
