package mongo

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// A derived document's writer owns its `_meta` outright. Preserving it would put
// the owner in $setOnInsert, so a rebuild could write an owner once and never
// correct it — and a row whose owner is wrong matches no query and reports no
// error.
func TestWithMetaUpsertWritesMetaOnEveryUpsert(t *testing.T) {
	t.Parallel()
	doc := bson.M{"_id": "row-1", "_meta": bson.M{"owner": bson.M{"kind": "account", "id": "acct-1"}}}

	model, ok := buildWithMetaUpsertModel("row-1", doc).(*mongo.UpdateOneModel)
	if !ok {
		t.Fatal("want an UpdateOneModel")
	}
	update, ok := model.Update.(bson.M)
	if !ok {
		t.Fatalf("unexpected update %#v", model.Update)
	}
	set, ok := update["$set"].(bson.M)
	if !ok {
		t.Fatalf("no $set in %#v", update)
	}
	if _, written := set["_meta"]; !written {
		t.Fatalf("_meta must be in $set, got %#v", set)
	}
}

// The preserving form is the opposite contract, and the two must not drift into
// each other: a client and the server both write these, and `_meta` carries the
// writing tab and session.
func TestPreservingMetaUpsertKeepsMetaOutOfSet(t *testing.T) {
	t.Parallel()
	doc := bson.M{"_id": "job-1", "_meta": bson.M{"clientID": "tab-9"}}

	model := buildPreservingMetaUpsertModel("job-1", doc).(*mongo.UpdateOneModel)
	set := model.Update.(bson.M)["$set"].(bson.M)
	if _, written := set["_meta"]; written {
		t.Fatalf("_meta must not be replaced wholesale, got %#v", set)
	}
}
