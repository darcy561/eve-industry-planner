package update

import (
	"context"
	"strconv"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared/logs"
	esitasks "eve-industry-planner/worker/tasks/esi"
)

const blueprintsBulkWriteBatchSize = 500

// runSDEBlueprintsMongoStageAsync saves recipeList docs into Mongo in a separate goroutine.
// Each recipe is upserted into the "blueprints" collection with _id=itemID.
func runSDEBlueprintsMongoStageAsync(_ context.Context, conversionResult *sdeConversionResult, deps *esitasks.TaskDependencies) {
	if deps == nil || deps.Mongo == nil || conversionResult == nil || len(conversionResult.RecipeList) == 0 {
		return
	}

	recipes := conversionResult.RecipeList
	mongoClient := deps.Mongo

	go func() {
		stageCtx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()

		collection := mongoClient.Database(mongocore.DatabaseName).Collection(mongocore.CollectionBlueprints)
		items := make([]mongocore.StructUpsertItem, 0, len(recipes))

		for _, recipe := range recipes {
			if recipe == nil || recipe.ItemID == 0 {
				continue
			}
			items = append(items, mongocore.StructUpsertItem{
				DocID: strconv.Itoa(recipe.ItemID),
				Value: recipe,
			})
		}

		summary, err := mongocore.UpsertStructsByIDPreservingMetaBulk(stageCtx, collection, items, blueprintsBulkWriteBatchSize)
		if err != nil {
			logs.Warn("SDE mongo blueprint bulk upsert failed",
				"collection", mongocore.CollectionBlueprints,
				"error", err,
			)
			return
		}

		logs.Info("SDE mongo blueprint sync completed",
			"collection", mongocore.CollectionBlueprints,
			"total", summary.Total,
			"upserted", summary.Success,
			"failed", summary.Failed,
			"batches", summary.Batches,
		)
	}()
}
