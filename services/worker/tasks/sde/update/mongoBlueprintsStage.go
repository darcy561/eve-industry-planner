package update

import (
	"context"
	"fmt"
	"strconv"

	"eve-industry-planner/shared/logs"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/worker/taskrun"
)

const blueprintsBulkWriteBatchSize = 500

// runSDEBlueprintsMongoStage saves recipeList docs into Mongo, upserting each
// recipe into the "blueprints" collection with _id=itemID.
//
// It runs on the caller's context so the conversion output it reads is released
// with the rest of the pipeline; a detached goroutine would hold every converted
// file alive past the handler that owns them.
func runSDEBlueprintsMongoStage(ctx context.Context, conversionResult *sdeConversionResult, deps *taskrun.Dependencies) error {
	if deps == nil || deps.Mongo == nil || conversionResult == nil || len(conversionResult.RecipeList) == 0 {
		return nil
	}

	recipes := conversionResult.RecipeList
	summary := eipmongo.BulkUpsertSummary{}

	// Built and flushed a batch at a time: the whole recipe list re-boxed as
	// upsert items is a second copy of the largest structure in the pipeline.
	items := make([]eipmongo.StructUpsertItem, 0, blueprintsBulkWriteBatchSize)
	flush := func() error {
		if len(items) == 0 {
			return nil
		}
		batchSummary, err := deps.Mongo.Blueprints.UpsertStructsPreservingMetaBulk(ctx, items, blueprintsBulkWriteBatchSize)
		summary.Total += batchSummary.Total
		summary.Success += batchSummary.Success
		summary.Failed += batchSummary.Failed
		summary.Batches += batchSummary.Batches
		items = items[:0]
		return err
	}

	for _, recipe := range recipes {
		if recipe == nil || recipe.ItemID == 0 {
			continue
		}
		items = append(items, eipmongo.StructUpsertItem{
			DocID: strconv.Itoa(recipe.ItemID),
			Value: recipe,
		})
		if len(items) >= blueprintsBulkWriteBatchSize {
			if err := flush(); err != nil {
				return fmt.Errorf("SDE mongo blueprint bulk upsert failed: %w", err)
			}
		}
	}
	if err := flush(); err != nil {
		return fmt.Errorf("SDE mongo blueprint bulk upsert failed: %w", err)
	}

	logs.InfoCtx(ctx, "SDE mongo blueprint sync completed",
		"collection", eipmongo.CollectionSharedBlueprints,
		"total", summary.Total,
		"upserted", summary.Success,
		"failed", summary.Failed,
		"batches", summary.Batches,
	)
	return nil
}
