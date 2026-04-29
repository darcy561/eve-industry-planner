package mongo

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type StructUpsertItem struct {
	DocID string
	Value interface{}
}

type BulkUpsertSummary struct {
	Total   int
	Batches int
	Success int
	Failed  int
}

// GetPublicDocumentByID fetches a public document by _id.
func GetPublicDocumentByID(ctx context.Context, collection *mongo.Collection, docID string) (bson.M, bool, error) {
	return getDocumentByID(ctx, collection, docID, nil)
}

// GetPublicDocumentsByIDs fetches public documents by _id and returns them in request order.
// Missing documents are skipped.
func GetPublicDocumentsByIDs(ctx context.Context, collection *mongo.Collection, docIDs []string) ([]bson.M, error) {
	return getDocumentsByIDs(ctx, collection, docIDs, nil)
}

// GetPrivateDocumentByID fetches an account-owned document by _id and _meta.accountID.
func GetPrivateDocumentByID(ctx context.Context, collection *mongo.Collection, accountID, docID string) (bson.M, bool, error) {
	if accountID == "" {
		return nil, false, fmt.Errorf("accountID is required")
	}
	return getDocumentByID(ctx, collection, docID, bson.M{"_meta.accountID": accountID})
}

// GetPrivateDocumentsByIDs fetches account-owned documents by _id and _meta.accountID.
// Returned documents preserve the input order; missing documents are skipped.
func GetPrivateDocumentsByIDs(ctx context.Context, collection *mongo.Collection, accountID string, docIDs []string) ([]bson.M, error) {
	if accountID == "" {
		return nil, fmt.Errorf("accountID is required")
	}
	return getDocumentsByIDs(ctx, collection, docIDs, bson.M{"_meta.accountID": accountID})
}

// StructToMongoDoc converts a struct to a MongoDB document with _id set.
// If docID is provided (non-empty string), it will be used as the _id. Otherwise, a new ObjectID is generated.
// Returns the parsed bson.M document ready for insertion.
// Usage:
//   - StructToMongoDoc(struct, "custom-id") // Use custom ID
//   - StructToMongoDoc(struct) // Generate ObjectID
func StructToMongoDoc(v interface{}, docID ...string) (bson.M, error) {
	// Marshal the struct to BSON
	docBytes, err := bson.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal struct to BSON: %w", err)
	}

	var doc bson.M
	if err := bson.Unmarshal(docBytes, &doc); err != nil {
		return nil, fmt.Errorf("failed to unmarshal BSON to map: %w", err)
	}

	// Set _id: use provided docID or generate a new ObjectID
	if len(docID) > 0 && docID[0] != "" {
		doc["_id"] = docID[0]
	} else {
		doc["_id"] = primitive.NewObjectID()
	}

	return doc, nil
}

// DocumentExistsByID returns whether a document exists whose _id is docID and whose
// _meta.accountID matches (same archival / ownership pattern as models.Job).
func DocumentExistsByID(ctx context.Context, collection *mongo.Collection, docID, accountID string) (bool, error) {
	if collection == nil {
		return false, fmt.Errorf("collection is required")
	}
	if docID == "" {
		return false, fmt.Errorf("docID is required")
	}
	if accountID == "" {
		return false, fmt.Errorf("accountID is required")
	}

	filter := bson.M{
		"_id":             docID,
		"_meta.accountID": accountID,
	}
	err := collection.FindOne(ctx, filter).Err()
	if err == nil {
		return true, nil
	}
	if err == mongo.ErrNoDocuments {
		return false, nil
	}
	return false, err
}

// UpsertStructByIDWithMeta upserts a struct by _id and writes full metadata from the struct.
// Use this for initial import flows where metadata should be initialized from source data.
func UpsertStructByIDWithMeta(ctx context.Context, collection *mongo.Collection, v interface{}, docID string) (*mongo.UpdateResult, error) {
	if collection == nil {
		return nil, fmt.Errorf("collection is required")
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

	result, err := collection.UpdateOne(
		ctx,
		bson.M{"_id": docID},
		bson.M{
			"$set":         setDoc,
			"$setOnInsert": bson.M{"_id": docID},
		},
		options.Update().SetUpsert(true),
	)
	if err != nil {
		return nil, fmt.Errorf("upsert document: %w", err)
	}

	return result, nil
}

// ReplaceStructByIDUpsert replaces the entire document matching _id, or inserts it if missing.
// Use when applying a full snapshot from an external source of truth so stale top-level or
// legacy-schema keys are not left behind (unlike a partial $set upsert).
func ReplaceStructByIDUpsert(ctx context.Context, collection *mongo.Collection, v interface{}, docID string) (*mongo.UpdateResult, error) {
	if collection == nil {
		return nil, fmt.Errorf("collection is required")
	}
	if docID == "" {
		return nil, fmt.Errorf("docID is required")
	}

	doc, err := StructToMongoDoc(v, docID)
	if err != nil {
		return nil, fmt.Errorf("convert struct to BSON: %w", err)
	}

	result, err := collection.ReplaceOne(ctx, bson.M{"_id": docID}, doc, options.Replace().SetUpsert(true))
	if err != nil {
		return nil, fmt.Errorf("replace document: %w", err)
	}
	return result, nil
}

// UpsertStructByIDPreservingMeta upserts a struct by _id while preserving existing _meta fields.
// It always bumps _meta.lastModified and initializes _meta on insert.
func UpsertStructByIDPreservingMeta(ctx context.Context, collection *mongo.Collection, v interface{}, docID string) (*mongo.UpdateResult, error) {
	if collection == nil {
		return nil, fmt.Errorf("collection is required")
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

	result, err := collection.UpdateOne(
		ctx,
		bson.M{"_id": docID},
		bson.M{
			"$set":         setDoc,
			"$setOnInsert": setOnInsert,
		},
		options.Update().SetUpsert(true),
	)
	if err != nil {
		return nil, fmt.Errorf("upsert document preserving meta: %w", err)
	}

	return result, nil
}

// UpsertStructByIDPreservingMetaWithRetry wraps UpsertStructByIDPreservingMeta with
// standard mongo retry behavior for a named operation.
func UpsertStructByIDPreservingMetaWithRetry(
	ctx context.Context,
	collection *mongo.Collection,
	v interface{},
	docID string,
	operationName string,
) (*mongo.UpdateResult, error) {
	retryCfg := DefaultRetryConfig()
	retryCfg.OperationName = operationName
	var out *mongo.UpdateResult
	if err := RetryMongoOperation(ctx, retryCfg, func() error {
		var upsertErr error
		out, upsertErr = UpsertStructByIDPreservingMeta(ctx, collection, v, docID)
		return upsertErr
	}); err != nil {
		return nil, err
	}
	return out, nil
}

// UpsertStructsByIDPreservingMetaBulk upserts many structs by _id using unordered bulk writes.
// It preserves existing _meta fields and updates _meta.lastModified.
// Invalid items (missing docID or marshal errors) are counted as failures and skipped.
func UpsertStructsByIDPreservingMetaBulk(ctx context.Context, collection *mongo.Collection, items []StructUpsertItem, batchSize int) (BulkUpsertSummary, error) {
	summary := BulkUpsertSummary{Total: len(items)}
	if collection == nil {
		return summary, fmt.Errorf("collection is required")
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
		success, failed, err := executeBulkUpsertModels(ctx, collection, models)
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

func buildPreservingMetaUpsertModel(docID string, doc bson.M) mongo.WriteModel {
	setDoc := buildSetDoc(doc, "_id", "_meta")
	setOnInsert := bson.M{"_id": docID}
	applyLastModified(setDoc, setOnInsert, doc, true)

	return mongo.NewUpdateOneModel().
		SetFilter(bson.M{"_id": docID}).
		SetUpdate(bson.M{
			"$set":         setDoc,
			"$setOnInsert": setOnInsert,
		}).
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

func getDocumentByID(ctx context.Context, collection *mongo.Collection, docID string, extraFilter bson.M) (bson.M, bool, error) {
	if collection == nil {
		return nil, false, fmt.Errorf("collection is required")
	}
	if docID == "" {
		return nil, false, fmt.Errorf("docID is required")
	}

	filter := mergeFilters(bson.M{"_id": docID}, extraFilter)
	var result bson.M
	err := collection.FindOne(ctx, filter).Decode(&result)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, false, nil
		}
		return nil, false, err
	}

	return result, true, nil
}

func getDocumentsByIDs(ctx context.Context, collection *mongo.Collection, docIDs []string, extraFilter bson.M) ([]bson.M, error) {
	if collection == nil {
		return nil, fmt.Errorf("collection is required")
	}
	if len(docIDs) == 0 {
		return nil, fmt.Errorf("docIDs cannot be empty")
	}

	filter := mergeFilters(bson.M{"_id": bson.M{"$in": docIDs}}, extraFilter)
	cursor, err := collection.Find(ctx, filter)
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

	// Keep top-level timestamp fields current when present.
	if _, ok := setDoc["lastModified"]; ok {
		setDoc["lastModified"] = now
	}

	// Keep shared metadata timestamp current when metadata is stored under _meta.
	if metaRaw, ok := setDoc["_meta"]; ok {
		if meta, ok := metaRaw.(bson.M); ok {
			meta["lastModified"] = now
			setDoc["_meta"] = meta
		} else if metaMap, ok := metaRaw.(map[string]any); ok {
			metaMap["lastModified"] = now
			setDoc["_meta"] = metaMap
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
				// Ensure API-provided source client is persisted on updates (not just inserts)
				// so changestream can emit sourceClientID for websocket echo suppression.
				setDoc["_meta.clientID"] = clientID
			}
			for k, v := range meta {
				if k == "lastModified" {
					continue
				}
				// Avoid conflicting updates when this key is already explicitly set in $set.
				if _, exists := setDoc["_meta."+k]; exists {
					continue
				}
				setOnInsert["_meta."+k] = v
			}
		}
	}
}

func ensureMetaMap(metaRaw interface{}) bson.M {
	if meta, ok := metaRaw.(bson.M); ok {
		return meta
	}
	if metaMap, ok := metaRaw.(map[string]any); ok {
		meta := bson.M{}
		for k, v := range metaMap {
			meta[k] = v
		}
		return meta
	}
	return bson.M{}
}
