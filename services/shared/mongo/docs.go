package mongo

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Docs is a collection-bound helper surface from [Mongo] named fields or [Mongo.Docs].
type Docs struct {
	coll *mongo.Collection
}

func newDocs(coll *mongo.Collection) *Docs {
	return &Docs{coll: coll}
}

// Collection returns the underlying driver collection (for BulkWrite models, etc.).
func (d *Docs) Collection() *mongo.Collection {
	if d == nil {
		return nil
	}
	return d.coll
}

func (d *Docs) requireColl() (*mongo.Collection, error) {
	if d == nil || d.coll == nil {
		return nil, fmt.Errorf("collection is required")
	}
	return d.coll, nil
}

// GetPublicByID fetches a public document by _id.
func (d *Docs) GetPublicByID(ctx context.Context, docID string) (bson.M, bool, error) {
	return d.getByID(ctx, docID, nil)
}

// GetPublicByIDs fetches public documents by _id in request order (missing skipped).
func (d *Docs) GetPublicByIDs(ctx context.Context, docIDs []string) ([]bson.M, error) {
	return d.getByIDs(ctx, docIDs, nil)
}

// UpsertStructPreservingMeta upserts v under docID, setting its fields while keeping the _meta a
// stored row already holds; it retries under [Retry], labelled by [WithOpName] when given.
func (d *Docs) UpsertStructPreservingMeta(ctx context.Context, v any, docID string, opts ...RetryOption) (*mongo.UpdateResult, error) {
	coll, err := d.requireColl()
	if err != nil {
		return nil, err
	}
	if docID == "" {
		return nil, fmt.Errorf("docID is required")
	}
	doc, err := StructToMongoDoc(v, docID)
	if err != nil {
		return nil, fmt.Errorf("convert struct to BSON: %w", err)
	}
	setDoc := buildSetDoc(doc, "_id", models.MetaFieldName)
	setOnInsert := insertDefaults(docID)
	applyLastModified(setDoc, setOnInsert, doc, true)

	result, err := RetryValue(ctx, applyRetryOptions("UpsertStructPreservingMeta", opts), func() (*mongo.UpdateResult, error) {
		return coll.UpdateOne(ctx,
			bson.M{"_id": docID},
			bson.M{"$set": setDoc, "$setOnInsert": setOnInsert},
			options.UpdateOne().SetUpsert(true))
	})
	if err != nil {
		return nil, fmt.Errorf("upsert document preserving meta: %w", err)
	}
	return result, nil
}

// StructUpsertItem is one row for [Docs.UpsertStructsPreservingMetaBulk].
type StructUpsertItem struct {
	DocID string
	Value any
}

// BulkUpsertSummary aggregates unordered preserving-meta bulk upserts.
type BulkUpsertSummary struct {
	Total   int
	Batches int
	Success int
	Failed  int
}

// UpsertStructsPreservingMetaBulk upserts many structs, leaving each document's existing `_meta` in
// place.
func (d *Docs) UpsertStructsPreservingMetaBulk(ctx context.Context, items []StructUpsertItem, batchSize int) (BulkUpsertSummary, error) {
	return d.upsertStructsBulk(ctx, items, batchSize, buildPreservingMetaUpsertModel)
}

// UpsertStructsWithMetaBulk upserts many structs, writing `_meta` from the struct.
func (d *Docs) UpsertStructsWithMetaBulk(ctx context.Context, items []StructUpsertItem, batchSize int) (BulkUpsertSummary, error) {
	return d.upsertStructsBulk(ctx, items, batchSize, buildWithMetaUpsertModel)
}

func (d *Docs) upsertStructsBulk(
	ctx context.Context,
	items []StructUpsertItem,
	batchSize int,
	build func(docID string, doc bson.M) mongo.WriteModel,
) (BulkUpsertSummary, error) {
	summary := BulkUpsertSummary{Total: len(items)}
	coll, err := d.requireColl()
	if err != nil {
		return summary, err
	}
	if len(items) == 0 {
		return summary, nil
	}
	if batchSize <= 0 {
		batchSize = 500
	}

	models := make([]mongo.WriteModel, 0, batchSize)
	flush := func() error {
		if len(models) == 0 {
			return nil
		}
		summary.Batches++
		success, failed, err := executeBulkUpsertModels(ctx, coll, models)
		summary.Success += success
		summary.Failed += failed
		models = models[:0]
		return err
	}

	for _, item := range items {
		if item.DocID == "" || item.Value == nil {
			summary.Failed++
			continue
		}
		doc, err := StructToMongoDoc(item.Value, item.DocID)
		if err != nil {
			summary.Failed++
			continue
		}
		models = append(models, build(item.DocID, doc))
		if len(models) >= batchSize {
			if err := flush(); err != nil {
				return summary, err
			}
		}
	}
	if err := flush(); err != nil {
		return summary, err
	}
	return summary, nil
}

// DeleteManyAfterStampingMeta stamps _meta then deletes (changestream preimage / echo suppression).
// Log label defaults to "DeleteManyAfterStampingMeta"; override with [WithOpName].
func (d *Docs) DeleteManyAfterStampingMeta(ctx context.Context, filter bson.M, now time.Time, sessionID, wsClientID string, opts ...RetryOption) (int64, error) {
	return d.deleteManyAfterStampingMeta(ctx, filter, now, sessionID, wsClientID, applyRetryOptions("DeleteManyAfterStampingMeta", opts))
}

func (d *Docs) deleteManyAfterStampingMeta(ctx context.Context, filter bson.M, now time.Time, sessionID, wsClientID, operationName string) (int64, error) {
	coll, err := d.requireColl()
	if err != nil {
		return 0, fmt.Errorf("DeleteManyAfterStampingMeta: nil collection")
	}
	set := MetaStamp(now, sessionID, wsClientID)
	result, err := RetryValue(ctx, operationName, func() (*mongo.DeleteResult, error) {
		if _, err := coll.UpdateMany(ctx, filter, bson.M{"$set": set}); err != nil {
			return nil, err
		}
		return coll.DeleteMany(ctx, filter)
	})
	if err != nil {
		return 0, err
	}
	if result == nil {
		return 0, nil
	}
	return result.DeletedCount, nil
}

// DistinctStrings returns the distinct non-empty string values of field.
func (d *Docs) DistinctStrings(ctx context.Context, field string, filter bson.M, opts ...RetryOption) ([]string, error) {
	coll, err := d.requireColl()
	if err != nil {
		return nil, err
	}
	if field == "" {
		return nil, fmt.Errorf("field is required")
	}
	if filter == nil {
		filter = bson.M{}
	}

	var raw []any
	err = Retry(ctx, applyRetryOptions("DistinctStrings", opts), func() error {
		raw = nil
		return coll.Distinct(ctx, field, filter).Decode(&raw)
	})
	if err != nil {
		return nil, err
	}

	out := make([]string, 0, len(raw))
	for _, v := range raw {
		s, ok := v.(string)
		if !ok || s == "" {
			continue
		}
		out = append(out, s)
	}
	return out, nil
}

// ListIDs returns the _id of every matching document, for collections whose _id is a string key.
func (d *Docs) ListIDs(ctx context.Context, filter bson.M, opts ...RetryOption) ([]string, error) {
	if filter == nil {
		filter = bson.M{}
	}
	rows, err := findAll[struct {
		ID string `bson:"_id"`
	}](ctx, d, applyRetryOptions("ListIDs", opts), filter, options.Find().SetProjection(bson.M{"_id": 1}))
	if err != nil {
		return nil, err
	}
	var out []string
	for _, row := range rows {
		if row.ID != "" {
			out = append(out, row.ID)
		}
	}
	return out, nil
}

func (d *Docs) getByID(ctx context.Context, docID string, extraFilter bson.M) (bson.M, bool, error) {
	if docID == "" {
		return nil, false, fmt.Errorf("docID is required")
	}
	doc, err := findOne[bson.M](ctx, d, "getByID", mergeFilters(bson.M{"_id": docID}, extraFilter))
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return doc, true, nil
}

func (d *Docs) getByIDs(ctx context.Context, docIDs []string, extraFilter bson.M) ([]bson.M, error) {
	if len(docIDs) == 0 {
		return nil, fmt.Errorf("docIDs cannot be empty")
	}
	docs, err := findAll[bson.M](ctx, d, "getByIDs", mergeFilters(bson.M{"_id": bson.M{"$in": docIDs}}, extraFilter))
	if err != nil {
		return nil, err
	}
	byID := make(map[string]bson.M, len(docs))
	for _, doc := range docs {
		if docID, _ := doc["_id"].(string); docID != "" {
			byID[docID] = doc
		}
	}
	results := make([]bson.M, 0, len(docIDs))
	for _, docID := range docIDs {
		if doc, ok := byID[docID]; ok {
			results = append(results, doc)
		}
	}
	return results, nil
}

func mergeFilters(base bson.M, extra bson.M) bson.M {
	if len(extra) == 0 {
		return base
	}
	merged := bson.M{}
	maps.Copy(merged, base)
	maps.Copy(merged, extra)
	return merged
}

func buildSetDoc(doc bson.M, excludedFields ...string) bson.M {
	excluded := make(map[string]struct{}, len(excludedFields))
	for _, field := range excludedFields {
		if field == "" {
			continue
		}
		excluded[field] = struct{}{}
	}
	setDoc := bson.M{}
	for k, val := range doc {
		if _, skip := excluded[k]; skip {
			continue
		}
		setDoc[k] = val
	}
	return setDoc
}

func applyLastModified(setDoc bson.M, setOnInsert bson.M, doc bson.M, preserveMeta bool) {
	now := time.Now().UTC()
	if _, ok := setDoc["lastModified"]; ok {
		setDoc["lastModified"] = now
	}
	if metaRaw, ok := setDoc[models.MetaFieldName]; ok {
		if meta := AsDocumentM(metaRaw); meta != nil {
			meta["lastModified"] = now
			setDoc[models.MetaFieldName] = meta
		}
	}
	if preserveMeta {
		setDoc[FieldMetaLastModified] = now
		if setOnInsert == nil || doc == nil {
			return
		}
		if metaRaw, ok := doc[models.MetaFieldName]; ok {
			meta := ensureMetaMap(metaRaw)
			if clientID, ok := meta["clientID"].(string); ok && clientID != "" {
				setDoc[FieldMetaClientID] = clientID
			}
			if owner := ownerToWrite(meta); owner != nil {
				setDoc[FieldMetaOwner] = owner
			}
			for k, v := range meta {
				if k == "lastModified" {
					continue
				}
				if _, exists := setDoc[models.MetaFieldName+"."+k]; exists {
					continue
				}
				setOnInsert[models.MetaFieldName+"."+k] = v
			}
		}
	}
}

// ownerToWrite returns the owner a preserving-meta upsert should stamp, or nil when the caller
// named none.
func ownerToWrite(meta bson.M) bson.M {
	owner := AsDocumentM(meta[models.MetaFieldOwner])
	if owner == nil {
		return nil
	}

	kind, _ := owner["kind"].(string)
	id, _ := owner["id"].(string)
	if kind == "" || id == "" {
		return nil
	}

	return owner
}

func ensureMetaMap(metaRaw any) bson.M {
	if meta := AsDocumentM(metaRaw); meta != nil {
		return meta
	}
	return bson.M{}
}

// buildWithMetaUpsertModel writes the whole document, `_meta` included.
func buildWithMetaUpsertModel(docID string, doc bson.M) mongo.WriteModel {
	setDoc := buildSetDoc(doc, "_id", models.MetaFieldName)
	applyLastModified(setDoc, nil, nil, false)
	if meta := AsDocumentM(doc[models.MetaFieldName]); meta != nil {
		meta["lastModified"] = time.Now().UTC()
		maps.Copy(setDoc, MetaSetByPath(meta))
	}
	return mongo.NewUpdateOneModel().
		SetFilter(bson.M{"_id": docID}).
		SetUpdate(bson.M{"$set": setDoc, "$setOnInsert": insertDefaults(docID)}).
		SetUpsert(true)
}

// insertDefaults is what a document is given the once, when it is created.
func insertDefaults(docID string) bson.M {
	return bson.M{"_id": docID, FieldMetaRevision: models.InitialDocumentRevision}
}

func buildPreservingMetaUpsertModel(docID string, doc bson.M) mongo.WriteModel {
	setDoc := buildSetDoc(doc, "_id", models.MetaFieldName)
	setOnInsert := insertDefaults(docID)
	applyLastModified(setDoc, setOnInsert, doc, true)
	return mongo.NewUpdateOneModel().
		SetFilter(bson.M{"_id": docID}).
		SetUpdate(bson.M{"$set": setDoc, "$setOnInsert": setOnInsert}).
		SetUpsert(true)
}

func executeBulkUpsertModels(ctx context.Context, collection *mongo.Collection, models []mongo.WriteModel) (success int, failed int, err error) {
	if len(models) == 0 {
		return 0, 0, nil
	}
	_, err = collection.BulkWrite(ctx, models, options.BulkWrite().SetOrdered(false))
	if err == nil {
		return len(models), 0, nil
	}
	if bwe, ok := errors.AsType[mongo.BulkWriteException](err); ok {
		failed = len(bwe.WriteErrors)
		success = len(models) - failed
		return success, failed, nil
	}
	return 0, len(models), err
}

// Aggregate runs a pipeline and decodes every result into out, which must be a pointer to a slice.
func (d *Docs) Aggregate(ctx context.Context, pipeline mongo.Pipeline, out any, opts ...RetryOption) error {
	coll, err := d.requireColl()
	if err != nil {
		return err
	}
	if pipeline == nil {
		return fmt.Errorf("pipeline is required")
	}
	if out == nil {
		return fmt.Errorf("out is required")
	}

	return Retry(ctx, applyRetryOptions("Aggregate", opts), func() error {
		cursor, aggErr := coll.Aggregate(ctx, pipeline)
		if aggErr != nil {
			return aggErr
		}
		defer cursor.Close(ctx)
		return cursor.All(ctx, out)
	})
}
