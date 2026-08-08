package v1endpoints

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/logs"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	blueprintsCacheControl = "public, max-age=1800, s-maxage=3600"
)

// BlueprintsHandler serves GET /api/v1/blueprints/{id} and POST /api/v1/blueprints with JSON body { idArray }.
// Public route: global middleware → rate limit only (no auth). Align client retries with withRequestRetries / defaultIsRetriableHttpStatus (408, 429, 5xx).
//
//	405 — wrong HTTP method
//	400 — missing blueprint ID (GET), invalid JSON or idArray (POST)
//	404 — blueprint not found (GET)
//	503 — Mongo client unavailable
//	500 — Mongo query or encode failure
//	200 — JSON success
func (h *Handlers) BlueprintsHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.BlueprintGetHandler(w, r)
	case http.MethodPost:
		h.BlueprintsPostHandler(w, r)
	default:
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for blueprints endpoint", "method_not_allowed", "blueprints", nil, map[string]any{"method": r.Method})
	}
}

func (h *Handlers) BlueprintGetHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)

	blueprintID := r.PathValue("blueprintID")
	if blueprintID == "" {
		blueprintID = strings.TrimPrefix(r.URL.Path, "/api/v1/blueprints/")
	}
	blueprintID = strings.TrimSpace(blueprintID)
	if blueprintID == "" {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid or missing blueprintID", "blueprints get: missing or empty blueprintID", "blueprints_missing_id", "blueprints", nil, nil)
		return
	}

	if h.Mongo == nil {
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Service unavailable", "blueprints mongo client unavailable", "blueprints_mongo_unavailable", "blueprints", errors.New("mongo client unavailable"), nil)
		return
	}

	data, found, err := h.Mongo.Blueprints.GetPublicByID(ctx, blueprintID)
	if err != nil {
		helper.RespondEndpointServerError(w, r, "An error occurred while retrieving blueprint data. Please try again later.", "blueprints get: mongo error", "blueprints_get_mongo_failed", "blueprints", err, map[string]any{"blueprint_id": blueprintID})
		return
	}
	if !found {
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Blueprint not found", "blueprints get: blueprint not found", "blueprints_not_found", "blueprints", nil, map[string]any{"blueprint_id": blueprintID})
		return
	}

	logs.AttachDebugStep(r, "mongo_query_completed", map[string]any{
		"blueprint_id": blueprintID,
	})

	w.Header().Set("Cache-Control", blueprintsCacheControl)
	if err := helper.EncodeJSON(w, data); err != nil {
		helper.RespondEndpointServerError(w, r, "Internal server error", "blueprints get: encode error", "blueprints_get_encode_failed", "blueprints", err, map[string]any{"blueprint_id": blueprintID})
		return
	}

	logs.AttachHandlerSuccessDetail(r, "blueprint retrieved", map[string]any{
		"blueprint_id": blueprintID,
		"duration_ms":  time.Since(start).Milliseconds(),
	})
}

type BlueprintsPostBody struct {
	IDArray []int `json:"idArray"`
}

// BlueprintsPostHandler accepts any non-empty idArray; there is no per-request ID count cap beyond
// helper.DefaultMaxBodySize (1MB JSON) and Mongo query timeout.
func (h *Handlers) BlueprintsPostHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)

	var body BlueprintsPostBody
	if err := helper.DecodeJSONRequest(r, &body, helper.DefaultMaxBodySize); err != nil {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid or empty ID array", "blueprints post: invalid body", "blueprints_invalid_body", "blueprints", err, nil)
		return
	}
	if len(body.IDArray) == 0 {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid or empty ID array", "blueprints post: empty id array", "blueprints_empty_id_array", "blueprints", nil, nil)
		return
	}

	typeIDs := make([]string, 0, len(body.IDArray))
	for _, n := range body.IDArray {
		typeIDs = append(typeIDs, strconv.Itoa(n))
	}

	if h.Mongo == nil {
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Service unavailable", "blueprints mongo client unavailable", "blueprints_mongo_unavailable", "blueprints", errors.New("mongo client unavailable"), nil)
		return
	}

	docs, err := h.Mongo.Blueprints.GetPublicByIDs(ctx, typeIDs)
	if err != nil {
		helper.RespondEndpointServerError(w, r, "An error occurred while retrieving blueprint data. Please try again.", "blueprints post: mongo error", "blueprints_post_mongo_failed", "blueprints", err, nil)
		return
	}
	results := bsonDocsToMaps(docs)

	logs.AttachDebugStep(r, "mongo_query_completed", map[string]any{
		"requested": len(typeIDs),
		"returned":  len(results),
	})

	w.Header().Set("Cache-Control", "no-store")
	if err := helper.EncodeJSON(w, results); err != nil {
		helper.RespondEndpointServerError(w, r, "Internal server error", "blueprints post: encode error", "blueprints_post_encode_failed", "blueprints", err, nil)
		return
	}

	logs.AttachHandlerSuccessDetail(r, "blueprints retrieved", map[string]any{
		"requested":   len(typeIDs),
		"returned":    len(results),
		"duration_ms": time.Since(start).Milliseconds(),
	})
}

func bsonDocsToMaps(docs []bson.M) []map[string]any {
	results := make([]map[string]any, 0, len(docs))
	for _, doc := range docs {
		results = append(results, map[string]any(doc))
	}
	return results
}
