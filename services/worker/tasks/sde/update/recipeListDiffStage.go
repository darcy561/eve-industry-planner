package update

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strconv"

	"eve-industry-planner/shared/logs"
	esitasks "eve-industry-planner/worker/tasks/esi"
	"eve-industry-planner/worker/tasks/sde/update/conversion"
)

type recipeListDiffItem struct {
	ItemID int    `json:"item_id"`
	Name   string `json:"name"`
}

// runSDENewRecipeItemsStage compares the previous version recipeList.json to the new one,
// and logs the recipe items that are new in the latest update.
func runSDENewRecipeItemsStage(ctx context.Context, persistResult *sdePersistResult, deps *esitasks.TaskDependencies) error {
	if persistResult == nil {
		// Placeholder for "no previous version" behavior (e.g. first-run warmup checks).
		logs.DebugCtx(ctx, "SDE recipeList diff skipped (persist result was nil)")
		return nil
	}

	newBytes := persistResult.CurrentRecipeBytes
	if len(newBytes) == 0 {
		return fmt.Errorf("missing current recipeList bytes for diff")
	}

	var newRecipes []*conversion.EVEType
	if err := json.Unmarshal(newBytes, &newRecipes); err != nil {
		return fmt.Errorf("failed parsing current recipeList.json: %w", err)
	}

	var prevRecipes []*conversion.EVEType
	prevIDs := make(map[int]bool)
	if persistResult.HasPreviousVersion && len(persistResult.PreviousRecipeBytes) > 0 {
		if err := json.Unmarshal(persistResult.PreviousRecipeBytes, &prevRecipes); err != nil {
			return fmt.Errorf("failed parsing previous recipeList.json: %w", err)
		}

		prevIDs = make(map[int]bool, len(prevRecipes))
		for _, r := range prevRecipes {
			if r == nil {
				continue
			}
			prevIDs[r.ItemID] = true
		}
	}

	var newItems []recipeListDiffItem
	typeIDsToRefresh := make(map[int32]struct{})
	for _, r := range newRecipes {
		if r == nil {
			continue
		}
		if !prevIDs[r.ItemID] {
			newItems = append(newItems, recipeListDiffItem{ItemID: r.ItemID, Name: r.Name})
			addRecipeTypeIDs(typeIDsToRefresh, r)
		}
	}

	slices.SortFunc(newItems, func(a, b recipeListDiffItem) int { return a.ItemID - b.ItemID })

	logs.InfoCtx(ctx, "SDE recipeList diff complete",
		"previous_count", len(prevRecipes),
		"current_count", len(newRecipes),
		"new_items_count", len(newItems),
	)

	// Keep log noise bounded: list up to 50 new item IDs.
	limit := min(len(newItems), 50)
	itemIDs := make([]int, 0, limit)
	for i := range limit {
		itemIDs = append(itemIDs, newItems[i].ItemID)
	}
	if len(newItems) > 0 {
		logs.InfoCtx(ctx, "SDE recipeList new item IDs (sample)",
			"sample_count", len(itemIDs),
			"sample_item_ids", itemIDs,
			"total_new_items", len(newItems),
		)
	}

	reprocessingAdded, err := addReprocessingTypeIDs(typeIDsToRefresh, persistResult.ReprocessingBytes)
	if err != nil {
		return err
	}

	logs.InfoCtx(ctx, "SDE recipeList diff complete",
		"new_items_count", len(newItems),
		"type_ids_extracted", len(typeIDsToRefresh),
		"reprocessing_type_ids_added", reprocessingAdded,
	)

	return nil
}

func addRecipeTypeIDs(typeIDs map[int32]struct{}, r *conversion.EVEType) {
	if r == nil {
		return
	}
	if r.ItemID > 0 {
		typeIDs[int32(r.ItemID)] = struct{}{}
	}

	activityKey := ""
	switch r.JobType {
	case conversion.ManufacturingID:
		activityKey = "manufacturing"
	case conversion.ReactionID:
		activityKey = "reaction"
	default:
		// Try both activity paths if job type is unknown to maximize coverage.
		addMaterialsTypeIDs(typeIDs, r, "manufacturing")
		addMaterialsTypeIDs(typeIDs, r, "reaction")
		addInventionMaterialTypeIDs(typeIDs, r)
		return
	}
	addMaterialsTypeIDs(typeIDs, r, activityKey)
	addInventionMaterialTypeIDs(typeIDs, r)
}

func addInventionMaterialTypeIDs(typeIDs map[int32]struct{}, r *conversion.EVEType) {
	if r == nil || r.Activities == nil || r.Activities.Invention == nil {
		return
	}
	for _, src := range r.Activities.Invention {
		for _, m := range src.Materials {
			if m.TypeID <= 0 {
				continue
			}
			typeIDs[int32(m.TypeID)] = struct{}{}
		}
	}
}

func addMaterialsTypeIDs(typeIDs map[int32]struct{}, r *conversion.EVEType, activityKey string) {
	if r == nil || r.Activities == nil {
		return
	}

	activity, ok := r.Activities.ActivityMap(activityKey)
	if !ok {
		return
	}

	materialsAny, ok := activity["materials"]
	if !ok {
		return
	}

	materials, ok := materialsAny.([]any)
	if !ok {
		return
	}

	for _, matI := range materials {
		mat, ok := matI.(map[string]any)
		if !ok {
			continue
		}

		typeID, ok := parseTypeID(mat["typeID"])
		if !ok || typeID == 0 {
			continue
		}
		typeIDs[typeID] = struct{}{}
	}
}

func parseTypeID(v any) (int32, bool) {
	switch t := v.(type) {
	case float64:
		return int32(t), true
	case float32:
		return int32(t), true
	case int:
		return int32(t), true
	case int32:
		return t, true
	case int64:
		return int32(t), true
	case json.Number:
		i, err := t.Int64()
		if err != nil {
			return 0, false
		}
		return int32(i), true
	case string:
		parsed, err := strconv.ParseInt(t, 10, 32)
		if err != nil {
			return 0, false
		}
		return int32(parsed), true
	default:
		return 0, false
	}
}

func addReprocessingTypeIDs(typeIDs map[int32]struct{}, reprocessingBytes []byte) (int, error) {
	b := reprocessingBytes
	if len(b) == 0 {
		return 0, nil
	}

	var reprocessingData map[string]*conversion.ReprocessingItem
	if err := json.Unmarshal(b, &reprocessingData); err != nil {
		return 0, fmt.Errorf("failed parsing reprocessingData.json: %w", err)
	}

	added := 0
	add := func(id int32) {
		if id == 0 {
			return
		}
		if _, exists := typeIDs[id]; exists {
			return
		}
		typeIDs[id] = struct{}{}
		added++
	}

	for id, item := range reprocessingData {
		if itemID, ok := parseTypeID(id); ok {
			add(itemID)
		}
		if item == nil {
			continue
		}
		for materialID := range item.Materials {
			if typeID, ok := parseTypeID(materialID); ok {
				add(typeID)
			}
		}
	}

	return added, nil
}
