package maintenance

import (
	"context"
	"fmt"
	"strings"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	defaultSchemaMaintenanceBatchSize = 50
	maxSchemaMaintenanceBatchSize     = 200
)

// SchemaVersionMaintenanceBatch upgrades a bounded number of outdated docs for one collection.
func SchemaVersionMaintenanceBatch(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}
	payload, err := esitasks.UnmarshalTaskPayload[natscore.SchemaVersionMaintenanceBatchRequest](task)
	if err != nil {
		return fmt.Errorf("invalid payload: %w", err)
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

	mongo := deps.Mongo
	switch payload.Collection {
	case eipmongo.CollectionUsers:
		return maintainUsersSchemaVersionBatch(ctx, mongo.Users, batchSize)
	case eipmongo.CollectionApplicationSettings:
		return maintainApplicationSettingsSchemaVersionBatch(ctx, mongo.ApplicationSettings, batchSize)
	case eipmongo.CollectionUserJobDocuments, eipmongo.CollectionJobs:
		return maintainJobSchemaVersionBatch(ctx, mongo.Docs(payload.Collection), batchSize)
	case eipmongo.CollectionUserJobGroups:
		return maintainGroupSchemaVersionBatch(ctx, mongo.Groups, batchSize)
	default:
		return fmt.Errorf("unsupported schema maintenance collection %q", payload.Collection)
	}
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
		models.UpgradeUserAccountDocument(&doc)
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
		"collection", eipmongo.CollectionUsers,
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
		models.UpgradeApplicationSettings(&doc, accountID, now)
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
		"collection", eipmongo.CollectionApplicationSettings,
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
		models.UpgradeJob(&doc)
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
		models.UpgradeGroup(&doc)
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
