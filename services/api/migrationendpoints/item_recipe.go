package migrationendpoints

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/migration"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
)

const (
	itemRecipeCacheControl = "public, max-age=1800, s-maxage=3600"
)

func ItemRecipeHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	switch r.Method {
	case http.MethodGet:
		ItemRecipeGetHandler(w, r, clients)
	case http.MethodPost:
		ItemRecipesPostHandler(w, r, clients)
	default:
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "item recipe: method not allowed", "item_recipe_method_not_allowed", "item_recipe", nil, map[string]interface{}{"method": r.Method})
		return
	}
}

// ItemRecipeGetHandler handles GET /api/migration/item/{itemID} (public migration).
// Returns item recipe from Firestore Items collection; 404 if not found.
func ItemRecipeGetHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)

	if r.Method != http.MethodGet {
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "item recipe get: method not allowed", "item_recipe_get_method_not_allowed", "item_recipe", nil, map[string]interface{}{"method": r.Method})
		return
	}

	itemID := r.PathValue("itemID")
	if itemID == "" {
		itemID = strings.TrimPrefix(r.URL.Path, "/api/migration/item/")
	}
	itemID = strings.TrimSpace(itemID)
	if itemID == "" {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid or missing itemID", "item recipe get: missing or empty itemID", "item_recipe_get_missing_id", "item_recipe", nil, nil)
		return
	}

	logs.AttachDebugStep(r, "item_id_resolved", map[string]interface{}{
		"item_id": itemID,
	})

	data, found, err := migration.GetItemRecipe(ctx, itemID)
	if err != nil {
		helper.RespondEndpointServerError(w, r, "An error occurred while retrieving item data. Please try again later.", "item recipe get: firestore error", "item_recipe_get_firestore_failed", "item_recipe", err, map[string]interface{}{"item_id": itemID})
		return
	}
	if !found {
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Item not found", "item recipe get: item not found", "item_recipe_get_not_found", "item_recipe", nil, map[string]interface{}{"item_id": itemID})
		return
	}

	logs.AttachDebugStep(r, "firestore_query_completed", map[string]interface{}{
		"item_id": itemID,
		"found":   found,
	})

	w.Header().Set("Cache-Control", itemRecipeCacheControl)
	if err := helper.EncodeJSON(w, data); err != nil {
		helper.RespondEndpointServerError(w, r, "Internal server error", "item recipe get: encode error", "item_recipe_get_encode_failed", "item_recipe", err, map[string]interface{}{"item_id": itemID})
		return
	}
	logs.AttachHandlerSuccessDetail(r, "item recipe retrieved via migration", map[string]interface{}{
		"item_id":     itemID,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}

// ItemRecipesPostBody matches the JS request body: { idArray: number[] }.
type ItemRecipesPostBody struct {
	IDArray []int `json:"idArray"`
}

// ItemRecipesPostHandler handles POST /api/migration/item (public migration).
// Body: { "idArray": [34, 35, 36] }. Returns array of item recipe documents for found items.
func ItemRecipesPostHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)

	if r.Method != http.MethodPost {
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "item recipes post: method not allowed", "item_recipes_post_method_not_allowed", "item_recipe", nil, map[string]interface{}{"method": r.Method})
		return
	}

	var body ItemRecipesPostBody
	if err := helper.DecodeJSONRequest(r, &body, helper.DefaultMaxBodySize); err != nil {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid or empty ID array", "item recipes post: invalid body", "item_recipes_post_invalid_body", "item_recipe", err, nil)
		return
	}
	if len(body.IDArray) == 0 {
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid or empty ID array", "item recipes post: empty idArray", "item_recipes_post_empty_id_array", "item_recipe", nil, nil)
		return
	}

	typeIDs := make([]string, 0, len(body.IDArray))
	for _, n := range body.IDArray {
		typeIDs = append(typeIDs, strconv.Itoa(n))
	}

	logs.AttachDebugStep(r, "batch_validated", map[string]interface{}{
		"requested": len(typeIDs),
	})

	results, err := migration.GetMultipleItemRecipes(ctx, typeIDs)
	if err != nil {
		helper.RespondEndpointServerError(w, r, "An error occurred while retrieving item data. Please try again.", "item recipes post: firestore error", "item_recipes_post_firestore_failed", "item_recipe", err, nil)
		return
	}

	logs.AttachDebugStep(r, "firestore_query_completed", map[string]interface{}{
		"requested": len(typeIDs),
		"returned":  len(results),
	})

	w.Header().Set("Content-Type", "application/json")
	if err := helper.EncodeJSON(w, results); err != nil {
		helper.RespondEndpointServerError(w, r, "Internal server error", "item recipes post: encode error", "item_recipes_post_encode_failed", "item_recipe", err, nil)
		return
	}
	logs.AttachHandlerSuccessDetail(r, "item recipes retrieved via migration", map[string]interface{}{
		"requested":   len(typeIDs),
		"returned":    len(results),
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
