package mongo

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"time"

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

// ExistsByAccountID reports whether _id + _meta.accountID exist.
func (d *Docs) ExistsByAccountID(ctx context.Context, docID, accountID string) (bool, error) {
	coll, err := d.requireColl()
	if err != nil {
		return false, err
	}
	if docID == "" {
		return false, fmt.Errorf("docID is required")
	}
	if accountID == "" {
		return false, fmt.Errorf("accountID is required")
	}
	filter := bson.M{"_id": docID, "_meta.accountID": accountID}
	err = coll.FindOne(ctx, filter).Err()
	if err == nil {
		return true, nil
	}
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, nil
	}
	return false, err
}

// UpsertStructWithMeta upserts by _id writing full metadata from the struct.
func (d *Docs) UpsertStructWithMeta(ctx context.Context, v any, docID string) (*mongo.UpdateResult, error) {
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
	setDoc := buildSetDoc(doc, "_id")
	applyLastModified(setDoc, nil, nil, false)
	result, err := coll.UpdateOne(
		ctx,
		bson.M{"_id": docID},
		bson.M{"$set": setDoc, "$setOnInsert": bson.M{"_id": docID}},
		options.UpdateOne().SetUpsert(true),
	)
	if err != nil {
		return nil, fmt.Errorf("upsert document: %w", err)
	}
	return result, nil
}

// UpsertStructPreservingMeta upserts by _id preserving existing _meta (bumps lastModified).
func (d *Docs) UpsertStructPreservingMeta(ctx context.Context, v any, docID string) (*mongo.UpdateResult, error) {
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
	setDoc := buildSetDoc(doc, "_id", "_meta")
	setOnInsert := bson.M{"_id": docID}
	applyLastModified(setDoc, setOnInsert, doc, true)
	result, err := coll.UpdateOne(
		ctx,
		bson.M{"_id": docID},
		bson.M{"$set": setDoc, "$setOnInsert": setOnInsert},
		options.UpdateOne().SetUpsert(true),
	)
	if err != nil {
		return nil, fmt.Errorf("upsert document preserving meta: %w", err)
	}
	return result, nil
}

// UpsertStructPreservingMetaRetry wraps UpsertStructPreservingMeta with [Retry].
// Log label defaults to "UpsertStructPreservingMeta"; override with [WithOpName].
func (d *Docs) UpsertStructPreservingMetaRetry(ctx context.Context, v any, docID string, opts ...RetryOption) (*mongo.UpdateResult, error) {
	opName := applyRetryOptions("UpsertStructPreservingMeta", opts)
	var out *mongo.UpdateResult
	err := Retry(ctx, opName, func() error {
		var upsertErr error
		out, upsertErr = d.UpsertStructPreservingMeta(ctx, v, docID)
		return upsertErr
	})
	if err != nil {
		return nil, err
	}
	return out, nil
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

// UpsertStructsPreservingMetaBulk upserts many structs (unordered collection BulkWrite).
func (d *Docs) UpsertStructsPreservingMetaBulk(ctx context.Context, items []StructUpsertItem, batchSize int) (BulkUpsertSummary, error) {
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
		models = append(models, buildPreservingMetaUpsertModel(item.DocID, doc))
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
	set := bson.M{"_meta.lastModified": now}
	if sessionID != "" {
		set["_meta.sessionID"] = sessionID
	}
	if wsClientID != "" {
		set["_meta.clientID"] = wsClientID
	}
	var result *mongo.DeleteResult
	err = Retry(ctx, operationName, func() error {
		if _, uerr := coll.UpdateMany(ctx, filter, bson.M{"$set": set}); uerr != nil {
			return uerr
		}
		var derr error
		result, derr = coll.DeleteMany(ctx, filter)
		return derr
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
// Non-string and empty values are skipped.
// Log label defaults to "DistinctStrings"; override with [WithOpName].
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

// ListIDs returns the _id of every matching document, for collections whose _id
// is a string key. A nil filter lists the whole collection.
// Log label defaults to "ListIDs"; override with [WithOpName].
func (d *Docs) ListIDs(ctx context.Context, filter bson.M, opts ...RetryOption) ([]string, error) {
	coll, err := d.requireColl()
	if err != nil {
		return nil, err
	}
	if filter == nil {
		filter = bson.M{}
	}

	var out []string
	err = Retry(ctx, applyRetryOptions("ListIDs", opts), func() error {
		out = nil
		cursor, findErr := coll.Find(ctx, filter, options.Find().SetProjection(bson.M{"_id": 1}))
		if findErr != nil {
			return findErr
		}
		defer cursor.Close(ctx)

		for cursor.Next(ctx) {
			var row struct {
				ID string `bson:"_id"`
			}
			if decErr := cursor.Decode(&row); decErr != nil {
				return decErr
			}
			if row.ID == "" {
				continue
			}
			out = append(out, row.ID)
		}
		return cursor.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (d *Docs) getByID(ctx context.Context, docID string, extraFilter bson.M) (bson.M, bool, error) {
	coll, err := d.requireColl()
	if err != nil {
		return nil, false, err
	}
	if docID == "" {
		return nil, false, fmt.Errorf("docID is required")
	}
	filter := mergeFilters(bson.M{"_id": docID}, extraFilter)
	var result bson.M
	err = coll.FindOne(ctx, filter).Decode(&result)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return result, true, nil
}

func (d *Docs) getByIDs(ctx context.Context, docIDs []string, extraFilter bson.M) ([]bson.M, error) {
	coll, err := d.requireColl()
	if err != nil {
		return nil, err
	}
	if len(docIDs) == 0 {
		return nil, fmt.Errorf("docIDs cannot be empty")
	}
	filter := mergeFilters(bson.M{"_id": bson.M{"$in": docIDs}}, extraFilter)
	cursor, err := coll.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	byID := make(map[string]bson.M, len(docIDs))
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return nil, err
		}
		docID, _ := doc["_id"].(string)
		if docID == "" {
			continue
		}
		byID[docID] = doc
	}
	if err := cursor.Err(); err != nil {
		return nil, err
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
	if metaRaw, ok := setDoc["_meta"]; ok {
		if meta := AsDocumentM(metaRaw); meta != nil {
			meta["lastModified"] = now
			setDoc["_meta"] = meta
		}
	}
	if preserveMeta {
		setDoc["_meta.lastModified"] = now
		if setOnInsert == nil || doc == nil {
			return
		}
		if metaRaw, ok := doc["_meta"]; ok {
			meta := ensureMetaMap(metaRaw)
			if clientID, ok := meta["clientID"].(string); ok && clientID != "" {
				setDoc["_meta.clientID"] = clientID
			}
			for k, v := range meta {
				if k == "lastModified" {
					continue
				}
				if _, exists := setDoc["_meta."+k]; exists {
					continue
				}
				setOnInsert["_meta."+k] = v
			}
		}
	}
}

func ensureMetaMap(metaRaw any) bson.M {
	if meta := AsDocumentM(metaRaw); meta != nil {
		return meta
	}
	return bson.M{}
}

func buildPreservingMetaUpsertModel(docID string, doc bson.M) mongo.WriteModel {
	setDoc := buildSetDoc(doc, "_id", "_meta")
	setOnInsert := bson.M{"_id": docID}
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
	var bwe mongo.BulkWriteException
	if errors.As(err, &bwe) {
		failed = len(bwe.WriteErrors)
		success = len(models) - failed
		return success, failed, nil
	}
	return 0, len(models), err
}
