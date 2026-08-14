package changestream

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
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

// Mirrors watcher extraction when v2 decodes nested docs as bson.D without DefaultDocumentM.
func TestFullDocumentAsBsonD_extractsAccountID(t *testing.T) {
	t.Parallel()
	changeEvent := bson.M{
		"operationType": "insert",
		"fullDocument": bson.D{
			{Key: "_id", Value: "job-1"},
			{Key: "_meta", Value: bson.D{
				{Key: "accountID", Value: "acct-1"},
				{Key: "clientID", Value: "client-1"},
			}},
		},
	}
	if g := changeStreamDocFieldStatus(changeEvent, "fullDocument"); g != "present" {
		t.Fatalf("fullDocument status: got %q", g)
	}

	doc := subDocumentToMap(changeEvent["fullDocument"])
	if doc == nil {
		t.Fatal("fullDocument map is nil")
	}
	if doc["_id"] != "job-1" {
		t.Fatalf("_id=%#v", doc["_id"])
	}

	meta := subDocumentToMap(doc["_meta"])
	if meta == nil {
		t.Fatal("_meta map is nil")
	}
	if meta["accountID"] != "acct-1" {
		t.Fatalf("accountID=%#v", meta["accountID"])
	}
	if meta["clientID"] != "client-1" {
		t.Fatalf("clientID=%#v", meta["clientID"])
	}
}
