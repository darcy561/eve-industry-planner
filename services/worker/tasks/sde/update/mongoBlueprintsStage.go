package update

import (
	"context"
	"strconv"
	"time"

	"eve-industry-planner/shared/logs"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/worker/taskrun"
)

const blueprintsBulkWriteBatchSize = 500

// runSDEBlueprintsMongoStageAsync saves recipeList docs into Mongo in a separate goroutine.
// Each recipe is upserted into the "blueprints" collection with _id=itemID.
func runSDEBlueprintsMongoStageAsync(_ context.Context, conversionResult *sdeConversionResult, deps *taskrun.Dependencies) {
	if deps == nil || deps.Mongo == nil || conversionResult == nil || len(conversionResult.RecipeList) == 0 {
		return
	}

	recipes := conversionResult.RecipeList
	mongo := deps.Mongo

	go func() {
		stageCtx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()

		items := make([]eipmongo.StructUpsertItem, 0, len(recipes))

		for _, recipe := range recipes {
			if recipe == nil || recipe.ItemID == 0 {
				continue
			}
			items = append(items, eipmongo.StructUpsertItem{
				DocID: strconv.Itoa(recipe.ItemID),
				Value: recipe,
			})
		}

		summary, err := mongo.Blueprints.UpsertStructsPreservingMetaBulk(stageCtx, items, blueprintsBulkWriteBatchSize)
		if err != nil {
			logs.WarnCtx(stageCtx, "SDE mongo blueprint bulk upsert failed",
				"collection", eipmongo.CollectionSharedBlueprints,
				"error", err,
			)
			return
		}

		logs.InfoCtx(stageCtx, "SDE mongo blueprint sync completed",
			"collection", eipmongo.CollectionSharedBlueprints,
			"total", summary.Total,
			"upserted", summary.Success,
			"failed", summary.Failed,
			"batches", summary.Batches,
		)
	}()
}
