package update

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"

	esicore "eve-industry-planner/shared/core/esi"
	natscore "eve-industry-planner/shared/core/nats"
	rediscore "eve-industry-planner/shared/core/redis"
	sdecore "eve-industry-planner/shared/core/sde"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
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

	if persistResult.CurrentRecipeList == "" {
		return fmt.Errorf("missing recipeList current path for diff")
	}

	newBytes, err := os.ReadFile(persistResult.CurrentRecipeList)
	if err != nil {
		return fmt.Errorf("failed reading current recipeList: %w", err)
	}

	var newRecipes []*conversion.EVEType
	if err := json.Unmarshal(newBytes, &newRecipes); err != nil {
		return fmt.Errorf("failed parsing current recipeList.json: %w", err)
	}

	var prevRecipes []*conversion.EVEType
	prevIDs := make(map[int]bool)
	if persistResult.HasPreviousVersion && persistResult.PreviousRecipeList != "" {
		prevBytes, err := os.ReadFile(persistResult.PreviousRecipeList)
		if err != nil {
			return fmt.Errorf("failed reading previous recipeList: %w", err)
		}

		if err := json.Unmarshal(prevBytes, &prevRecipes); err != nil {
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
	limit := 50
	if len(newItems) < limit {
		limit = len(newItems)
	}
	itemIDs := make([]int, 0, limit)
	for i := 0; i < limit; i++ {
		itemIDs = append(itemIDs, newItems[i].ItemID)
	}
	if len(newItems) > 0 {
		logs.InfoCtx(ctx, "SDE recipeList new item IDs (sample)",
			"sample_count", len(itemIDs),
			"sample_item_ids", itemIDs,
			"total_new_items", len(newItems),
		)
	}

	typeIDs := make([]int32, 0, len(typeIDsToRefresh))
	for id := range typeIDsToRefresh {
		typeIDs = append(typeIDs, id)
	}

	reprocessingPath := filepath.Join(persistResult.LiveDataDir, sdecore.ReprocessingFile)
	reprocessingAdded, err := addReprocessingTypeIDs(typeIDsToRefresh, reprocessingPath)
	if err != nil {
		return err
	}

	typeIDs = typeIDs[:0]
	for id := range typeIDsToRefresh {
		typeIDs = append(typeIDs, id)
	}

	if deps == nil || deps.Redis == nil || deps.JetStream == nil || deps.NATS == nil {
		// Keep the diff stage working even without Redis/NATS (e.g. file-generation integration tests).
		logs.InfoCtx(ctx, "SDE market price refresh skip: missing deps",
			"new_items_count", len(newItems),
			"type_ids_extracted", len(typeIDs),
			"reprocessing_type_ids_added", reprocessingAdded,
		)
		return nil
	}

	presentSet, err := rediscore.GetExistingMarketOrdersTypeIDs(ctx, deps.Redis, typeIDs)
	if err != nil {
		return fmt.Errorf("failed checking redis market refresh presence: %w", err)
	}

	missingTypeIDs := make([]int32, 0)
	for _, id := range typeIDs {
		if !presentSet[id] {
			missingTypeIDs = append(missingTypeIDs, id)
		}
	}

	logs.InfoCtx(ctx, "SDE market price missing detection",
		"new_items_count", len(newItems),
		"type_ids_extracted", len(typeIDs),
		"reprocessing_type_ids_added", reprocessingAdded,
		"type_ids_present", len(presentSet),
		"type_ids_missing", len(missingTypeIDs),
	)

	if len(missingTypeIDs) == 0 {
		return nil
	}

	// Publish missing market price tasks like the API endpoint does:
	// for each missing typeID, enqueue refresh tasks for every default market location.
	task := taskscore.FetchMissingMarketPrices
	published := 0
	for _, typeID := range missingTypeIDs {
		for _, location := range esicore.DefaultMarketLocations {
			request := natscore.MarketPricesRequest{
				TypeID:     typeID,
				LocationID: location.RegionID,
				StationID:  location.StationID,
			}
			if err := natscore.PublishTask(ctx, deps.JetStream, task.Subject, task.Name, request, deps.NATS); err != nil {
				logs.WarnCtx(ctx, "SDE failed publishing fetchMissingMarketPrices task",
					"type_id", typeID,
					"location_id", location.RegionID,
					"error", err,
				)
				continue
			}
			published++
		}
	}

	logs.InfoCtx(ctx, "SDE published missing market price refresh tasks",
		"type_ids_missing", len(missingTypeIDs),
		"tasks_published", published,
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
		return
	}
	addMaterialsTypeIDs(typeIDs, r, activityKey)
}

func addMaterialsTypeIDs(typeIDs map[int32]struct{}, r *conversion.EVEType, activityKey string) {
	if r == nil || r.Activities == nil {
		return
	}

	activity, ok := r.Activities[activityKey].(map[string]interface{})
	if !ok {
		return
	}

	materialsAny, ok := activity["materials"]
	if !ok {
		return
	}

	materials, ok := materialsAny.([]interface{})
	if !ok {
		return
	}

	for _, matI := range materials {
		mat, ok := matI.(map[string]interface{})
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

func addReprocessingTypeIDs(typeIDs map[int32]struct{}, reprocessingPath string) (int, error) {
	if reprocessingPath == "" {
		return 0, nil
	}

	b, err := os.ReadFile(reprocessingPath)
	if err != nil {
		return 0, fmt.Errorf("failed reading reprocessingData.json: %w", err)
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
