package v1endpoints

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// frontendAnalyticsBody is the JSON body for POST /api/v1/analytics/event.
type frontendAnalyticsBody struct {
	Event string `json:"event"`
	// Count is optional; when >1 it increments the metric by that amount (e.g. jobs in a batch). Omitted or 0 → 1. Max 1000.
	Count int64 `json:"count"`
	// ByType is only used when Event is "new_job": EVE type_id (string key in JSON) -> number of jobs for that product type.
	ByType map[string]int64 `json:"by_type"`
}

// allowedFrontendAnalyticsEvents is the allowlist of event keys (lowercase snake_case).
// Keep in sync with frontend/src/analytics/appEventNames.js.
var allowedFrontendAnalyticsEvents = map[string]struct{}{
	"build_shopping_list":      {},
	"add_custom_structure":     {},
	"reprocessing_calculation_to_minerals":   {},
	"reprocessing_calculation_from_minerals": {},
	"view_archived_job_data":   {},
	"add_additional_character_cloud": {},
	"add_additional_character_local": {},
	"new_watchlist_group":      {},
	"new_job_group":            {},
	"remove_watchlist_item":    {},
	"new_watchlist_item":       {},
	"new_job":                  {},
}

const maxFrontendEventKeyLen = 64

// maxFrontendByTypeKeys limits distinct type_ids per request (matches frontend MAX_FRONTEND_ANALYTICS_BY_TYPE_KEYS).
const maxFrontendByTypeKeys = 500

// FrontendAppEventHandler handles POST /api/v1/analytics/event.
// Public, rate-limited. Body: {"event":"<allowlisted_snake_case_key>","count":?} or for new_job: {"event":"new_job","by_type":{"<type_id>":<n>,...}}.
// Optional Authorization Bearer: if the internal JWT is valid, audience=authenticated; otherwise anonymous.
// No user identifiers are recorded in metrics.
func FrontendAppEventHandler(w http.ResponseWriter, r *http.Request, _ *shared.ServiceClients) {
	ctx := r.Context()
	met := apimetrics.GetWebFrontendEvents()

	if r.Method != http.MethodPost {
		met.RecordInvalid(ctx, "method_not_allowed")
		logs.WarnCtx(ctx, "invalid method for analytics event endpoint")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := helper.ExtractRequestBody[frontendAnalyticsBody](r)
	if err != nil {
		met.RecordInvalid(ctx, "bad_json")
		logs.WarnCtx(ctx, "frontend analytics: invalid JSON", "error", err)
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	key := strings.TrimSpace(body.Event)
	if key == "" {
		met.RecordInvalid(ctx, "missing_event")
		logs.WarnCtx(ctx, "frontend analytics: missing event")
		http.Error(w, "Missing event", http.StatusBadRequest)
		return
	}
	if len(key) > maxFrontendEventKeyLen || !isSafeEventKey(key) {
		met.RecordInvalid(ctx, "invalid_event_key")
		logs.WarnCtx(ctx, "frontend analytics: invalid event key shape")
		http.Error(w, "Invalid event", http.StatusBadRequest)
		return
	}
	if _, ok := allowedFrontendAnalyticsEvents[key]; !ok {
		met.RecordInvalid(ctx, "unknown_event")
		logs.WarnCtx(ctx, "frontend analytics: unknown event", "event", key)
		http.Error(w, "Unknown event", http.StatusBadRequest)
		return
	}

	audience := apimetrics.FrontendAudienceAnonymous
	if auth.BearerInternalJWTValid(r) {
		audience = apimetrics.FrontendAudienceAuthenticated
	}

	if key == "new_job" {
		byType, err := normalizeJobCreatesByType(body.ByType)
		if err != "" {
			met.RecordInvalid(ctx, err)
			logs.WarnCtx(ctx, "frontend analytics: invalid new_job payload", "reason", err)
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}
		met.RecordJobCreates(ctx, audience, byType)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	n := body.Count
	if n < 0 {
		met.RecordInvalid(ctx, "invalid_count")
		logs.WarnCtx(ctx, "frontend analytics: negative count")
		http.Error(w, "Invalid count", http.StatusBadRequest)
		return
	}
	if n == 0 {
		n = 1
	}

	met.RecordEvent(ctx, key, audience, n)
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
