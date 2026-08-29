package statistics

import (
	"context"
	"errors"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// timelinePeriod describes the window a response covers.
type timelinePeriod struct {
	From string `json:"from"`
	To   string `json:"to"`
	// Defaulted is true when the caller supplied no range and the server chose
	// the trailing months. A client cannot otherwise tell a default window from
	// an account with little history.
	Defaulted bool `json:"defaulted"`
	// TypeID echoes the item filter when one was applied.
	TypeID int `json:"typeID,omitempty"`
}

// timelineMonthEntry is one calendar month of an account's figures.
type timelineMonthEntry struct {
	Year  int `json:"year"`
	Month int `json:"month"`
	// Complete is false for a month still in progress. The current month is a
	// month-to-date figure, so a client comparing it against a finished month is
	// comparing unlike things unless it says so.
	Complete bool `json:"complete"`
	models.SalesMeasures
}

// timelineResponse is the month-on-month view.
//
// Totals are summed server-side over the same rows the months came from, so the
// headline figure and the months cannot disagree.
type timelineResponse struct {
	Period timelinePeriod       `json:"period"`
	Totals models.SalesMeasures `json:"totals"`
	Months []timelineMonthEntry `json:"months"`
}

// GetTimelineHandler serves GET /api/v1/statistics/account/timeline.
//
// Returns one entry per calendar month in the window, summed across every item
// type unless typeID narrows it. With no from/to the window is the current month
// and the one before it, which is the dashboard's month-on-month comparison.
//
// The account is resolved by the auth middleware from the session cookie, never
// read from the request.
func (h *Handlers) GetTimelineHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	m := apimetrics.GetAPIStatistics()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	if !helper.RequireMethod(w, r, http.MethodGet) {
		metrics.Error("method_not_allowed")
		return
	}
	accountID := helper.AuthenticatedAccountID(r)

	if h.Mongo == nil {
		metrics.Error("mongo_client_missing")
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Service unavailable", "timeline get: mongo client missing", "statistics_mongo_unavailable", "statistics_timeline", errors.New("mongo client missing"), nil)
		return
	}

	now := time.Now().UTC()
	window, err := resolveTimelineWindow(r, now)
	if err != nil {
		helper.RespondParamError(w, r, metrics, "statistics_timeline", err)
		return
	}
	typeID, err := helper.ParseTypeID(r, "statistics")
	if err != nil {
		helper.RespondParamError(w, r, metrics, "statistics_timeline", err)
		return
	}

	rows, err := h.Mongo.TimelineMonths(ctx, eipmongo.TimelineQuery{
		AccountID: accountID,
		From:      window.From,
		To:        window.To,
		TypeID:    typeID,
	})
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve statistics", "timeline get: query failed", "statistics_timeline_query_failed", "statistics_timeline", err, map[string]any{
			"from": window.From.String(),
			"to":   window.To.String(),
		})
		return
	}

	current := eipmongo.CurrentMonth(now)
	months := make([]timelineMonthEntry, 0, len(rows))
	var totals models.SalesMeasures
	for _, row := range rows {
		key := eipmongo.MonthKey{Year: row.Year, Month: row.Month}
		months = append(months, timelineMonthEntry{
			Year:          row.Year,
			Month:         row.Month,
			Complete:      key.Before(current),
			SalesMeasures: row.SalesMeasures,
		})
		totals = totals.Plus(row.SalesMeasures)
	}

	resp := timelineResponse{
		Period: timelinePeriod{
			From:      window.From.String(),
			To:        window.To.String(),
			Defaulted: window.Defaulted,
			TypeID:    typeID,
		},
		Totals: totals,
		Months: months,
	}

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, resp); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "timeline get: encode failed", "statistics_timeline_encode_failed", "statistics_timeline", err, nil)
		return
	}
	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "timeline retrieved", map[string]any{
		"from":      window.From.String(),
		"to":        window.To.String(),
		"defaulted": window.Defaulted,
		"months":    len(months),
		"type_id":   typeID,
	})
}
