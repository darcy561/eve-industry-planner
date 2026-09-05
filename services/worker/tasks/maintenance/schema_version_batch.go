package maintenance

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"eve-industry-planner/shared/logs"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/schemamaint"
	"eve-industry-planner/worker/taskrun"
)

const (
	defaultSchemaMaintenanceBatchSize = 200
	maxSchemaMaintenanceBatchSize     = 200
)

// SchemaVersionMaintenanceBatch upgrades a bounded number of outdated docs for one collection.
func SchemaVersionMaintenanceBatch(ctx context.Context, payload eipnats.SchemaVersionMaintenanceBatchRequest, deps *taskrun.Dependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}
	payload.Collection = strings.TrimSpace(payload.Collection)
	if payload.Collection == "" {
		return fmt.Errorf("collection is required")
	}
	batchSize := payload.BatchSize
	if batchSize <= 0 {
		batchSize = defaultSchemaMaintenanceBatchSize
	}
	if batchSize > maxSchemaMaintenanceBatchSize {
		batchSize = maxSchemaMaintenanceBatchSize
	}

	if !schemaMaintenanceCollectionSupported(payload.Collection) {
		return fmt.Errorf("unsupported schema maintenance collection %q", payload.Collection)
	}

	summary, err := schemamaint.Batch(ctx, deps.Mongo.Docs(payload.Collection), payload.Collection, batchSize)
	if err != nil {
		return err
	}
	logs.InfoCtx(ctx, "schema maintenance batch complete",
		"collection", payload.Collection,
		"scanned", summary.Scanned,
		"upgraded", summary.Upgraded,
		"failed_upgrades", summary.Failed,
		"batch_size", batchSize,
	)
	return nil
}

// schemaMaintenanceCollectionSupported reports whether this handler upgrades a
// collection. It reads the shared list so the scheduler cannot rotate a collection
// that arrives here and is rejected.
func schemaMaintenanceCollectionSupported(collection string) bool {
	return slices.Contains(eipmongo.SchemaMaintainedCollections(), collection)
}
