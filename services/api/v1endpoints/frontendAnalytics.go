package v1endpoints

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// frontendAnalyticsBody is the JSON body for each element of POST /api/v1/analytics/events.
type frontendAnalyticsBody struct {
	Event string `json:"event"`
	// Count is optional; when >1 it increments the metric by that amount (e.g. jobs in a batch). Omitted or 0 -> 1. Max 1000.
	Count int64 `json:"count"`
	// ByType is used when Event is "new_job" or "view_item_tree_item": EVE type_id (string key) -> count (same validation for both).
	ByType map[string]int64 `json:"by_type"`
}

// frontendAnalyticsBatchBody is the JSON body for POST /api/v1/analytics/events.
type frontendAnalyticsBatchBody struct {
	Events []frontendAnalyticsBody `json:"events"`
}

// allowedFrontendAnalyticsEvents is the allowlist of event keys (lowercase snake_case).
// Keep in sync with frontend/src/analytics/appEventNames.js.
var allowedFrontendAnalyticsEvents = map[string]struct{}{
	"view_job_tree_dialog":                   {},
	"view_item_tree_item":                    {},
	"group_tab_planner":                      {},
	"group_tab_job_tree":                     {},
	"group_tab_breakdown":                    {},
	"group_tab_scheduler":                    {},
	"build_shopping_list":                    {},
	"add_custom_structure":                   {},
	"reprocessing_calculation_to_minerals":   {},
	"reprocessing_calculation_from_minerals": {},
	"view_archived_job_data":                 {},
	"add_additional_character_cloud":         {},
	"add_additional_character_local":         {},
	"new_watchlist_group":                    {},
	"new_job_group":                          {},
	"remove_watchlist_item":                  {},
	"new_watchlist_item":                     {},
	"group_template_add":                     {},
	"group_template_delete":                  {},
	"group_template_replace":                 {},
	"group_template_apply":                   {},
	"new_job":                                {},
}

const maxFrontendEventKeyLen = 64

// maxFrontendByTypeKeys limits distinct type_ids per request (matches frontend MAX_FRONTEND_ANALYTICS_BY_TYPE_KEYS).
const maxFrontendByTypeKeys = 500

// maxFrontendBatchEvents caps items per POST /api/v1/analytics/events (defensive; client debatches).
const maxFrontendBatchEvents = 60

func frontendAnalyticsAudience(ctx context.Context, r *http.Request, clients *stackservices.Clients) string {
	if clients != nil {
		if _, ok := auth.TryExtractAccountSession(ctx, r, clients.Redis); ok {
			return apimetrics.FrontendAudienceAuthenticated
		}
	}
	return apimetrics.FrontendAudienceAnonymous
}

// validateFrontendAnalyticsBody returns empty if the body is acceptable; otherwise a short reason for RecordInvalid.
func validateFrontendAnalyticsBody(body *frontendAnalyticsBody) string {
	if body == nil {
		return "missing_event"
	}
	key := strings.TrimSpace(body.Event)
	if key == "" {
		return "missing_event"
	}
	if len(key) > maxFrontendEventKeyLen || !isSafeEventKey(key) {
		return "invalid_event_key"
	}
	if _, ok := allowedFrontendAnalyticsEvents[key]; !ok {
		return "unknown_event"
	}
	if key == "new_job" || key == "view_item_tree_item" {
		if _, err := normalizeJobCreatesByType(body.ByType); err != "" {
			return err
		}
		return ""
	}
	if body.Count < 0 {
		return "invalid_count"
	}
	return ""
}

func recordValidatedFrontendAnalytics(ctx context.Context, met *apimetrics.WebFrontendEventsMetrics, body *frontendAnalyticsBody, audience string) {
	key := strings.TrimSpace(body.Event)
	if key == "new_job" {
		byType, _ := normalizeJobCreatesByType(body.ByType)
		met.RecordJobCreates(ctx, audience, byType)
		return
	}
	if key == "view_item_tree_item" {
		byType, _ := normalizeJobCreatesByType(body.ByType)
		met.RecordItemTreeViews(ctx, audience, byType)
		return
	}
	n := body.Count
	if n < 1 {
		n = 1
	}
	met.RecordEvent(ctx, key, audience, n)
}

// FrontendAppEventsBatchHandler handles POST /api/v1/analytics/events (batched product analytics for OTel).
// Body: {"events":[{...},{...}]} - each object matches [frontendAnalyticsBody]. Max [maxFrontendBatchEvents] items.
func FrontendAppEventsBatchHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	ctx := r.Context()
	audience := frontendAnalyticsAudience(ctx, r, clients)
	met := apimetrics.GetWebFrontendEvents()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { met.RecordRequestMilliseconds(ctx, ms, audience) },
		IncRequests:     func(context.Context) {},
		IncSuccesses:    func(ctx context.Context) { met.RecordSuccess(ctx, audience) },
		IncErrors:       func(ctx context.Context, reason string) { met.RecordInvalid(ctx, reason, audience) },
	})
	defer metrics.Finish()

	if !helper.RequireMethod(w, r, http.MethodPost) {
		metrics.Error("method_not_allowed_batch")
		return
	}

	batch, err := helper.ExtractRequestBody[frontendAnalyticsBatchBody](r)
	if err != nil {
		metrics.Error("bad_json_batch")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Invalid request: %v", err), "frontend analytics batch: invalid JSON", "frontend_analytics_invalid_json", "frontend_analytics", err, nil)
		return
	}

	n := len(batch.Events)
	if n == 0 {
		metrics.Error("batch_empty")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid request", "frontend analytics batch: empty events", "frontend_analytics_batch_empty", "frontend_analytics", nil, nil)
		return
	}
	if n > maxFrontendBatchEvents {
		metrics.Error("batch_too_many")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid request", "frontend analytics batch: too many events", "frontend_analytics_batch_too_many", "frontend_analytics", nil, map[string]interface{}{"count": n})
		return
	}

	for i := range batch.Events {
		if reason := validateFrontendAnalyticsBody(&batch.Events[i]); reason != "" {
			metrics.Error("batch_item_" + reason)
			helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid request", "frontend analytics batch: item validation failed", "frontend_analytics_item_invalid", "frontend_analytics", nil, map[string]interface{}{"reason": reason, "index": i})
			return
		}
	}

	logs.AttachDebugStep(r, "batch_validated", map[string]interface{}{
		"event_count": n,
		"audience":    audience,
	})

	for i := range batch.Events {
		recordValidatedFrontendAnalytics(ctx, met, &batch.Events[i], audience)
	}
	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "frontend analytics batch recorded", map[string]interface{}{
		"event_count": n,
		"audience":    audience,
	})
	w.WriteHeader(http.StatusNoContent)
}

func normalizeJobCreatesByType(raw map[string]int64) (map[int64]int64, string) {
	if len(raw) == 0 {
		return nil, "new_job_missing_by_type"
	}
	if len(raw) > maxFrontendByTypeKeys {
		return nil, "new_job_by_type_too_many_keys"
	}
	out := make(map[int64]int64, len(raw))
	for k, v := range raw {
		k = strings.TrimSpace(k)
		if k == "" {
			return nil, "new_job_invalid_type_key"
		}
		typeID, err := strconv.ParseInt(k, 10, 64)
		if err != nil || typeID < 1 || typeID > apimetrics.MaxFrontendJobCreateTypeID {
			return nil, "new_job_invalid_type_id"
		}
		if v < 1 {
			return nil, "new_job_invalid_count"
		}
		if v > apimetrics.MaxFrontendJobCreatesPerType {
			v = apimetrics.MaxFrontendJobCreatesPerType
		}
		out[typeID] += v
		if out[typeID] > apimetrics.MaxFrontendJobCreatesPerType {
			out[typeID] = apimetrics.MaxFrontendJobCreatesPerType
		}
	}
	if len(out) == 0 {
		return nil, "new_job_missing_by_type"
	}
	return out, ""
}

func isSafeEventKey(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range s {
		if i == 0 {
			if r < 'a' || r > 'z' {
				return false
			}
			continue
		}
		if r == '_' || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			continue
		}
		return false
	}
	return true
}
