package maintenance

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"eve-industry-planner/shared/documentschema"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/worker/taskrun"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
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

	mongo := deps.Mongo
	switch payload.Collection {
	case eipmongo.CollectionAccounts:
		return maintainUsersSchemaVersionBatch(ctx, mongo.Users, batchSize)
	case eipmongo.CollectionAccountSettings:
		return maintainApplicationSettingsSchemaVersionBatch(ctx, mongo.ApplicationSettings, batchSize)
	case eipmongo.CollectionAccountJobDocuments, eipmongo.CollectionAccountJobs, eipmongo.CollectionAccountArchivedJobs:
		return maintainJobSchemaVersionBatch(ctx, mongo.Docs(payload.Collection), batchSize)
	case eipmongo.CollectionAccountJobGroups:
		return maintainGroupSchemaVersionBatch(ctx, mongo.Groups, batchSize)
	default:
		return fmt.Errorf("unsupported schema maintenance collection %q", payload.Collection)
	}
}

// schemaMaintenanceCollectionSupported reports whether this handler upgrades a
// collection. It reads the shared list so the scheduler cannot rotate a collection
// that arrives here and is rejected.
func schemaMaintenanceCollectionSupported(collection string) bool {
	return slices.Contains(eipmongo.SchemaMaintainedCollections(), collection)
}

func maintainUsersSchemaVersionBatch(ctx context.Context, docs *eipmongo.Docs, batchSize int) error {
	col := docs.Collection()
	filter := bson.M{
		"$or": []bson.M{
			{"schemaVersion": bson.M{"$lt": models.UserAccountDocumentSchemaCurrent}},
			{"schemaVersion": bson.M{"$exists": false}},
		},
	}
	opts := options.Find().
		SetSort(bson.D{{Key: "_id", Value: 1}}).
		SetLimit(int64(batchSize))

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		return fmt.Errorf("query users schema maintenance batch: %w", err)
	}
	defer cursor.Close(ctx)

	scanned := 0
	upgradeCandidates := make([]eipmongo.StructUpsertItem, 0, batchSize)
	for cursor.Next(ctx) {
		var doc models.UserAccountDocument
		if err := cursor.Decode(&doc); err != nil {
			logs.WarnCtx(ctx, "schema maintenance users: decode failed", "error", err)
			continue
		}
		scanned++
		beforeSchema := doc.SchemaVersion
		documentschema.Upgrader{}.UserAccountDocument(&doc)
		if beforeSchema == doc.SchemaVersion {
			continue
		}
		accountID := strings.TrimSpace(doc.MetaData.AccountID)
		if accountID == "" {
			continue
		}
		upgradeCandidates = append(upgradeCandidates, eipmongo.StructUpsertItem{
			DocID: accountID,
			Value: doc,
		})
	}
	if err := cursor.Err(); err != nil {
		return fmt.Errorf("iterate users schema maintenance batch: %w", err)
	}

	summary := eipmongo.BulkUpsertSummary{}
	if len(upgradeCandidates) > 0 {
		var err error
		summary, err = docs.UpsertStructsPreservingMetaBulk(ctx, upgradeCandidates, batchSize)
		if err != nil {
			return fmt.Errorf("users schema maintenance bulk upsert failed: %w", err)
		}
	}

	logs.InfoCtx(ctx, "schema maintenance users batch complete",
		"collection", eipmongo.CollectionAccounts,
		"scanned", scanned,
		"upgrade_candidates", len(upgradeCandidates),
		"upgraded", summary.Success,
		"failed_upgrades", summary.Failed,
		"bulk_batches", summary.Batches,
		"batch_size", batchSize,
	)
	return nil
}

func maintainApplicationSettingsSchemaVersionBatch(ctx context.Context, docs *eipmongo.Docs, batchSize int) error {
	col := docs.Collection()
	filter := bson.M{
		"$or": []bson.M{
			{"schemaVersion": bson.M{"$lt": models.ApplicationSettingsSchemaCurrent}},
			{"schemaVersion": bson.M{"$exists": false}},
		},
	}
	opts := options.Find().
		SetSort(bson.D{{Key: "_id", Value: 1}}).
		SetLimit(int64(batchSize))

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		return fmt.Errorf("query application settings schema maintenance batch: %w", err)
	}
	defer cursor.Close(ctx)

	scanned := 0
	upgradeCandidates := make([]eipmongo.StructUpsertItem, 0, batchSize)
	now := time.Now().UTC()
	for cursor.Next(ctx) {
		var doc models.ApplicationSettings
		if err := cursor.Decode(&doc); err != nil {
			logs.WarnCtx(ctx, "schema maintenance application settings: decode failed", "error", err)
			continue
		}
		scanned++
		beforeSchema := doc.SchemaVersion
		accountID := strings.TrimSpace(doc.MetaData.AccountID)
		if accountID == "" {
			continue
		}
		documentschema.Upgrader{}.ApplicationSettings(&doc, accountID, now)
		if beforeSchema == doc.SchemaVersion {
			continue
		}
		upgradeCandidates = append(upgradeCandidates, eipmongo.StructUpsertItem{
			DocID: accountID,
			Value: doc,
		})
	}
	if err := cursor.Err(); err != nil {
		return fmt.Errorf("iterate application settings schema maintenance batch: %w", err)
	}

	summary := eipmongo.BulkUpsertSummary{}
	if len(upgradeCandidates) > 0 {
		var err error
		summary, err = docs.UpsertStructsPreservingMetaBulk(ctx, upgradeCandidates, batchSize)
		if err != nil {
			return fmt.Errorf("application settings schema maintenance bulk upsert failed: %w", err)
		}
	}

	logs.InfoCtx(ctx, "schema maintenance application settings batch complete",
		"collection", eipmongo.CollectionAccountSettings,
		"scanned", scanned,
		"upgrade_candidates", len(upgradeCandidates),
		"upgraded", summary.Success,
		"failed_upgrades", summary.Failed,
		"bulk_batches", summary.Batches,
		"batch_size", batchSize,
	)
	return nil
}

func maintainJobSchemaVersionBatch(ctx context.Context, docs *eipmongo.Docs, batchSize int) error {
	upgrader := documentschema.Upgrader{}

	col := docs.Collection()
	filter := bson.M{
		"$or": []bson.M{
			{"schemaVersion": bson.M{"$lt": models.JobSchemaCurrent}},
			{"schemaVersion": bson.M{"$exists": false}},
		},
	}
	opts := options.Find().
		SetSort(bson.D{{Key: "_id", Value: 1}}).
		SetLimit(int64(batchSize))

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		return fmt.Errorf("query jobs schema maintenance batch: %w", err)
	}
	defer cursor.Close(ctx)

	scanned := 0
	upgradeCandidates := make([]eipmongo.StructUpsertItem, 0, batchSize)
	for cursor.Next(ctx) {
		var doc models.Job
		if err := cursor.Decode(&doc); err != nil {
			logs.WarnCtx(ctx, "schema maintenance jobs: decode failed", "error", err)
			continue
		}
		scanned++
		beforeSchema := doc.SchemaVersion
		upgrader.Job(&doc)
		if beforeSchema == doc.SchemaVersion {
			continue
		}
		docID := strings.TrimSpace(doc.JobID)
		if docID == "" {
			continue
		}
		upgradeCandidates = append(upgradeCandidates, eipmongo.StructUpsertItem{
			DocID: docID,
			Value: doc,
		})
	}
	if err := cursor.Err(); err != nil {
		return fmt.Errorf("iterate jobs schema maintenance batch: %w", err)
	}

	summary := eipmongo.BulkUpsertSummary{}
	if len(upgradeCandidates) > 0 {
		var err error
		summary, err = docs.UpsertStructsPreservingMetaBulk(ctx, upgradeCandidates, batchSize)
		if err != nil {
			return fmt.Errorf("jobs schema maintenance bulk upsert failed: %w", err)
		}
	}

	logs.InfoCtx(ctx, "schema maintenance jobs batch complete",
		"collection", col.Name(),
		"scanned", scanned,
		"upgrade_candidates", len(upgradeCandidates),
		"upgraded", summary.Success,
		"failed_upgrades", summary.Failed,
		"bulk_batches", summary.Batches,
		"batch_size", batchSize,
	)
	return nil
}

func maintainGroupSchemaVersionBatch(ctx context.Context, docs *eipmongo.Docs, batchSize int) error {
	col := docs.Collection()
	filter := bson.M{
		"$or": []bson.M{
			{"schemaVersion": bson.M{"$lt": models.GroupSchemaCurrent}},
			{"schemaVersion": bson.M{"$exists": false}},
		},
	}
	opts := options.Find().
		SetSort(bson.D{{Key: "_id", Value: 1}}).
		SetLimit(int64(batchSize))

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		return fmt.Errorf("query groups schema maintenance batch: %w", err)
	}
	defer cursor.Close(ctx)

	scanned := 0
	upgradeCandidates := make([]eipmongo.StructUpsertItem, 0, batchSize)
	for cursor.Next(ctx) {
		var doc models.Group
		if err := cursor.Decode(&doc); err != nil {
			logs.WarnCtx(ctx, "schema maintenance groups: decode failed", "error", err)
			continue
		}
		scanned++
		beforeSchema := doc.SchemaVersion
		documentschema.Upgrader{}.Group(&doc)
		if beforeSchema == doc.SchemaVersion {
			continue
		}
		docID := strings.TrimSpace(doc.GroupID)
		if docID == "" {
			continue
		}
		upgradeCandidates = append(upgradeCandidates, eipmongo.StructUpsertItem{
			DocID: docID,
			Value: doc,
		})
	}
	if err := cursor.Err(); err != nil {
		return fmt.Errorf("iterate groups schema maintenance batch: %w", err)
	}

	summary := eipmongo.BulkUpsertSummary{}
	if len(upgradeCandidates) > 0 {
		var err error
		summary, err = docs.UpsertStructsPreservingMetaBulk(ctx, upgradeCandidates, batchSize)
		if err != nil {
			return fmt.Errorf("groups schema maintenance bulk upsert failed: %w", err)
		}
	}

	logs.InfoCtx(ctx, "schema maintenance groups batch complete",
		"collection", col.Name(),
		"scanned", scanned,
		"upgrade_candidates", len(upgradeCandidates),
		"upgraded", summary.Success,
		"failed_upgrades", summary.Failed,
		"bulk_batches", summary.Batches,
		"batch_size", batchSize,
	)
	return nil
}
