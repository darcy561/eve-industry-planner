package changestream

import (
	"go.mongodb.org/mongo-driver/bson"
)

// subDocumentToMap converts any BSON-decoded subdocument (bson.M, bson.D, primitive.M, etc.)
// into bson.M so field lookups (_meta.accountID, etc.) work reliably on change stream events.
func subDocumentToMap(v interface{}) bson.M {
	if v == nil {
		return nil
	}
	raw, err := bson.Marshal(v)
	if err != nil {
		return nil
	}
	var out bson.M
	if err := bson.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}
