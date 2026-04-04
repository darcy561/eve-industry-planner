package migrationendpoints

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/migration"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
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
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

// ItemRecipeGetHandler handles GET /api/migration/item/{itemID} (public migration).
// Returns item recipe from Firestore Items collection; 404 if not found.
func ItemRecipeGetHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	ctx := r.Context()

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	itemID := r.PathValue("itemID")
	if itemID == "" {
		itemID = strings.TrimPrefix(r.URL.Path, "/api/migration/item/")
	}
	itemID = strings.TrimSpace(itemID)
	if itemID == "" {
		logs.WarnCtx(ctx, "item recipe get: missing or empty itemID", "path", r.URL.Path)
		http.Error(w, "Invalid or missing itemID", http.StatusBadRequest)
		return
	}

	data, found, err := migration.GetItemRecipe(ctx, itemID)
	if err != nil {
		logs.ErrorCtx(ctx, "item recipe get: firestore error", "error", err, "item_id", itemID)
		http.Error(w, "An error occurred while retrieving item data. Please try again later.", http.StatusInternalServerError)
		return
	}
	if !found {
		logs.WarnCtx(ctx, "item recipe get: item not found", "item_id", itemID)
		http.Error(w, "Item not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Cache-Control", itemRecipeCacheControl)
	if err := helper.EncodeJSON(w, data); err != nil {
		logs.ErrorCtx(ctx, "item recipe get: encode error", "error", err, "item_id", itemID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	logs.InfoCtx(ctx, "item recipe retrieved via migration", "item_id", itemID, "duration_ms", time.Since(start).Milliseconds())
}

// ItemRecipesPostBody matches the JS request body: { idArray: number[] }.
type ItemRecipesPostBody struct {
	IDArray []int `json:"idArray"`
}

// ItemRecipesPostHandler handles POST /api/migration/item (public migration).
// Body: { "idArray": [34, 35, 36] }. Returns array of item recipe documents for found items.
func ItemRecipesPostHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	ctx := r.Context()

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body ItemRecipesPostBody
	if err := helper.DecodeJSONRequest(r, &body, helper.DefaultMaxBodySize); err != nil {
		logs.WarnCtx(ctx, "item recipes post: invalid body", "error", err)
		http.Error(w, "Invalid or empty ID array", http.StatusBadRequest)
		return
	}
	if len(body.IDArray) == 0 {
		http.Error(w, "Invalid or empty ID array", http.StatusBadRequest)
		return
	}

	typeIDs := make([]string, 0, len(body.IDArray))
	for _, n := range body.IDArray {
		typeIDs = append(typeIDs, strconv.Itoa(n))
	}

	results, err := migration.GetMultipleItemRecipes(ctx, typeIDs)
	if err != nil {
		logs.ErrorCtx(ctx, "item recipes post: firestore error", "error", err)
		http.Error(w, "An error occurred while retrieving item data. Please try again.", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := helper.EncodeJSON(w, results); err != nil {
		logs.ErrorCtx(ctx, "item recipes post: encode error", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	logs.InfoCtx(ctx, "item recipes retrieved via migration", "requested", len(typeIDs), "returned", len(results), "duration_ms", time.Since(start).Milliseconds())
}
