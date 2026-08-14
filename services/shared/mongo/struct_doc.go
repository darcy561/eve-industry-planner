package mongo

import (
	"fmt"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// StructToMongoDoc converts a value to bson.M with _id set.
// Non-empty docID becomes _id; empty docID generates a new ObjectID.
func StructToMongoDoc(v any, docID string) (bson.M, error) {
	docBytes, err := bson.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal struct to BSON: %w", err)
	}
	doc, err := UnmarshalDocumentM(docBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal BSON to map: %w", err)
	}
	if docID != "" {
		doc["_id"] = docID
	} else {
		doc["_id"] = bson.NewObjectID()
	}
	return doc, nil
}
