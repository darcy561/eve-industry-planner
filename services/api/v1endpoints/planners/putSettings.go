package planners

import (
	"context"
	"errors"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	"eve-industry-planner/shared/telemetry/apimetrics"

	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// PutPlannerSettingsHandler handles PUT /api/v1/planners/{ownerHandle}/settings —
// changing the settings a planner's work is done under.
//
// The body names only the settings it changes, so a member editing one setting
// does not send back a copy of the rest that another member may have moved on
// from. It answers the settings as they now stand.
func (h *Handlers) PutPlannerSettingsHandler(w http.ResponseWriter, r *http.Request, handle string) {
	ctx := r.Context()
	m := apimetrics.GetAPIPlanners()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	owner, ok := helper.PlannerOwnerFromHandle(w, r, handle, h.Mongo, h.EntityCipher, metrics, "planner_settings")
	if !ok {
		return
	}

	var update planner.SettingsUpdate
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &update) {
		return
	}
	if len(update.Fields()) == 0 {
		metrics.Error("empty_update")
		helper.RespondEndpointError(w, r, http.StatusBadRequest,
			"No settings to change", "planner settings: update named no settings",
			"planner_settings_empty_update", "planner_settings", nil, nil)
		return
	}
	if err := update.Validate(); err != nil {
		metrics.Error("invalid_update")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, err.Error(),
			"planner settings: update refused", "planner_settings_invalid_update",
			"planner_settings", err, nil)
		return
	}

	var meta models.MetaData
	helper.PopulateRequestMeta(r, &meta, owner)

	stored, err := h.Mongo.UpdatePlannerSettings(ctx, owner, update, meta, time.Now().UTC())
	if err != nil {
		if errors.Is(err, mongodriver.ErrNoDocuments) {
			metrics.Error("not_found")
			helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found",
				"planner settings: no settings document", "planner_settings_not_found",
				"planner_settings", nil, nil)
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to save planner settings",
			"planner settings: write failed", "planner_settings_write_failed",
			"planner_settings", err, nil)
		return
	}

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, settingsResponse{
		Owner:    handle,
		Seeded:   true,
		Settings: stored,
	}); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error",
			"planner settings: encode failed", "planner_settings_encode_failed",
			"planner_settings", err, nil)
		return
	}

	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "planner settings saved", map[string]any{
		"owner_kind": string(owner.Kind),
	})
}
