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

// timelineItemEntry is one item type's figures across the whole window.
type timelineItemEntry struct {
	TypeID int `json:"typeID"`
	models.SalesMeasures
}

// timelineItemsPaging tells a caller where it is in the ranking without a
// second request for the count.
type timelineItemsPaging struct {
	Sort   string `json:"sort"`
	Order  string `json:"order"`
	Limit  int    `json:"limit"`
	Offset int    `json:"offset"`
	// TotalItems is every item type in the window, not the page length, so a
	// client knows whether more pages exist.
	TotalItems int `json:"totalItems"`
}

// timelineItemsResponse is the per-item breakdown for a window.
//
// Separate from the month view because an account can touch thousands of item
// types: embedding this in each month would multiply the breakdown by the number
// of months and make the common chart request pay for detail it does not draw.
type timelineItemsResponse struct {
	// Embedded, so its field appears beside the figures rather than nested.
	recalculationEnvelope
	Period timelinePeriod      `json:"period"`
	Paging timelineItemsPaging `json:"paging"`
	Items  []timelineItemEntry `json:"items"`
}

// GetTimelineItemsHandler serves GET /api/v1/statistics/{owner}/timeline/items.
//
// Groups the window by item type and ranks it server-side. Ranking cannot be
// done by the caller: ordering item types by profit needs every type in the
// window before a page can be taken.
//
// The account is resolved by the auth middleware from the session cookie, never
// read from the request.
func (h *Handlers) GetTimelineItemsHandler(w http.ResponseWriter, r *http.Request) {
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
	if !requireOwnedBySession(w, r, metrics, "statistics_timeline_items", accountID) {
		return
	}

	if h.Mongo == nil {
		metrics.Error("mongo_client_missing")
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Service unavailable", "timeline items get: mongo client missing", "statistics_mongo_unavailable", "statistics_timeline_items", errors.New("mongo client missing"), nil)
		return
	}

	window, err := resolveTimelineWindow(r, time.Now().UTC())
	if err != nil {
		helper.RespondParamError(w, r, metrics, "statistics_timeline_items", err)
		return
	}
	typeID, err := helper.ParseTypeID(r, "statistics")
	if err != nil {
		helper.RespondParamError(w, r, metrics, "statistics_timeline_items", err)
		return
	}
	paging, err := helper.ResolvePaging(r, timelineItemPagingRules)
	if err != nil {
		helper.RespondParamError(w, r, metrics, "statistics_timeline_items", err)
		return
	}

	page, err := h.Mongo.TimelineItems(ctx, eipmongo.TimelineQuery{
		Owner:   models.AccountOwner(accountID),
		From:    window.From,
		To:      window.To,
		AllTime: window.All,
		TypeID:  typeID,
	}, paging.Sort, paging.Ascending, paging.Limit, paging.Offset)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve statistics", "timeline items get: query failed", "statistics_timeline_items_query_failed", "statistics_timeline_items", err, map[string]any{
			"from": window.From.String(),
			"to":   window.To.String(),
		})
		return
	}

	items := make([]timelineItemEntry, 0, len(page.Items))
	for _, row := range page.Items {
		items = append(items, timelineItemEntry{TypeID: row.TypeID, SalesMeasures: row.SalesMeasures})
	}

	order := "desc"
	if paging.Ascending {
		order = "asc"
	}
	sortField := paging.Sort
	if sortField == "" {
		// Echo the ranking actually applied rather than the empty value the
		// caller sent, so a client can page without restating the default.
		sortField = eipmongo.DefaultTimelineSort
	}

	resp := timelineItemsResponse{
		recalculationEnvelope: recalculationFor(ctx, h.Mongo, accountID),
		Period: timelinePeriod{
			From:      periodBound(window.All, window.From),
			To:        periodBound(window.All, window.To),
			Defaulted: window.Defaulted,
			All:       window.All,
			TypeID:    typeID,
		},
		Paging: timelineItemsPaging{
			Sort:       sortField,
			Order:      order,
			Limit:      paging.Limit,
			Offset:     paging.Offset,
			TotalItems: page.TotalItems,
		},
		Items: items,
	}

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, resp); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "timeline items get: encode failed", "statistics_timeline_items_encode_failed", "statistics_timeline_items", err, nil)
		return
	}
	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "timeline items retrieved", map[string]any{
		"from":        window.From.String(),
		"to":          window.To.String(),
		"items":       len(items),
		"total_items": page.TotalItems,
		"sort":        sortField,
	})
}
