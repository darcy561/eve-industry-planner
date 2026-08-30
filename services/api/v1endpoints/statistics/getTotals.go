package statistics

import (
	"context"
	"errors"
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// totalsResponse is the lifetime view: one aggregate per item type, over the
// account's whole history.
//
// Unlike the timeline it takes no range. These are running totals since the
// account's first archived job, which is what makes them the figure to compare a
// month against.
type totalsResponse struct {
	// TypeID echoes the item filter when one was applied.
	TypeID int                          `json:"typeID,omitempty"`
	Items  []models.ProductionTotalsRow `json:"items"`
	// Total is the whole archive folded into one row, served for `summary=1`.
	// Summing client-side instead would ship every type's unbounded per-job
	// snapshot array to compute one figure.
	Total *models.ProductionTotalsRow `json:"total,omitempty"`
}

// GetTotalsHandler serves GET /api/v1/statistics/account/totals.
//
// Returns every item type the account has built, or one when typeID is given.
// The rows are produced by the statistics rebuild, so they carry the same
// figures the timeline sums, derived from the same per-job rows.
//
// The account is resolved by the auth middleware from the session cookie, never
// read from the request.
func (h *Handlers) GetTotalsHandler(w http.ResponseWriter, r *http.Request) {
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
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Service unavailable", "totals get: mongo client missing", "statistics_mongo_unavailable", "statistics_totals", errors.New("mongo client missing"), nil)
		return
	}

	typeID, err := helper.ParseTypeID(r, "statistics")
	if err != nil {
		helper.RespondParamError(w, r, metrics, "statistics_totals", err)
		return
	}

	rows, err := h.Mongo.LoadAccountProductionTotals(ctx, accountID, typeID)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve statistics", "totals get: query failed", "statistics_totals_query_failed", "statistics_totals", err, map[string]any{"type_id": typeID})
		return
	}

	if helper.BoolParam(r, "summary") {
		total := foldTotals(rows)
		w.WriteHeader(http.StatusOK)
		if err := helper.EncodeJSON(w, totalsResponse{TypeID: typeID, Items: []models.ProductionTotalsRow{}, Total: &total}); err != nil {
			metrics.Error("encode_error")
			helper.RespondEndpointServerError(w, r, "Internal server error", "totals get: encode failed", "statistics_totals_encode_failed", "statistics_totals", err, nil)
			return
		}
		metrics.Success()
		logs.AttachHandlerSuccessDetail(r, "totals summary retrieved", map[string]any{
			"type_id": typeID,
			"rows":    len(rows),
		})
		return
	}

	// An account with no archived jobs for a type gets an empty list rather than
	// a zeroed row: absent and zero are different answers, and only the caller
	// knows which one its view should show.
	items := rows
	if items == nil {
		items = []models.ProductionTotalsRow{}
	}
	for i := range items {
		if items[i].DataSnapshots == nil {
			// Serialised as [] rather than null, matching what the rebuild writes.
			items[i].DataSnapshots = []models.BuildStatSnapshot{}
		}
	}

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, totalsResponse{TypeID: typeID, Items: items}); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "totals get: encode failed", "statistics_totals_encode_failed", "statistics_totals", err, nil)
		return
	}
	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "totals retrieved", map[string]any{
		"type_id": typeID,
		"items":   len(items),
	})
}

// foldTotals sums every row into one. The per-job snapshots are dropped: they
// belong to a type's own history and mean nothing once types are summed.
func foldTotals(rows []models.ProductionTotalsRow) models.ProductionTotalsRow {
	var total models.ProductionTotalsRow
	for _, row := range rows {
		total = total.Plus(row)
	}
	total.DataSnapshots = []models.BuildStatSnapshot{}
	total.TypeID = 0
	return total
}
