package changestream

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

func TestChangeStreamDocFieldStatus(t *testing.T) {
	t.Parallel()
	missing := bson.M{"operationType": "delete"}
	if g := changeStreamDocFieldStatus(missing, "fullDocumentBeforeChange"); g != "absent" {
		t.Fatalf("missing key: got %q", g)
	}
	nullEvt := bson.M{"fullDocumentBeforeChange": nil}
	if g := changeStreamDocFieldStatus(nullEvt, "fullDocumentBeforeChange"); g != "null" {
		t.Fatalf("null value: got %q", g)
	}
	okEvt := bson.M{"fullDocumentBeforeChange": bson.M{"_id": "j1", "_meta": bson.M{"accountID": "a"}}}
	if g := changeStreamDocFieldStatus(okEvt, "fullDocumentBeforeChange"); g != "present" {
		t.Fatalf("present doc: got %q", g)
	}
}
