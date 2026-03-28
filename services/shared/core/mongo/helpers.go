package mongo

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

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

// DocumentExistsByID returns whether a document exists in the given collection by _id.
func DocumentExistsByID(ctx context.Context, collection *mongo.Collection, docID string) (bool, error) {
	if collection == nil {
		return false, fmt.Errorf("collection is required")
	}
	if docID == "" {
		return false, fmt.Errorf("docID is required")
	}

	err := collection.FindOne(ctx, bson.M{"_id": docID}).Err()
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
			for k, v := range meta {
				if k == "lastModified" {
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
