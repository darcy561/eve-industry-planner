package changestream

import (
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// changeStreamDocFieldStatus reports whether MongoDB included a usable value for a change-stream
// document field (fullDocument, fullDocumentBeforeChange, etc.). Used for Core logs when diagnosing
// preimage / UpdateLookup availability.
func changeStreamDocFieldStatus(changeEvent bson.M, key string) string {
	v, ok := changeEvent[key]
	if !ok {
		return "absent"
	}
	if v == nil {
		return "null"
	}
	if subDocumentToMap(v) == nil {
		return "unreadable"
	}
	return "present"
}

// subDocumentToMap converts any BSON-decoded subdocument (bson.M, bson.D, etc.)
// into bson.M so field lookups (_meta.accountID, etc.) work reliably on change stream events.
func subDocumentToMap(v interface{}) bson.M {
	return eipmongo.AsDocumentM(v)
}
