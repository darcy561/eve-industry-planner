package mongo

import (
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
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
