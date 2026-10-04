package mongo

import (
	"testing"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

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
	if _, whole := set["_meta"]; whole {
		t.Fatalf("_meta was set as a block, got %#v", set)
	}
	owner, written := set["_meta.owner"].(bson.M)
	if !written {
		t.Fatalf("the owner must be written on every upsert, got %#v", set)
	}
	if owner["id"] != "acct-1" {
		t.Fatalf("owner = %#v, want the one the writer holds", owner)
	}
	if _, stamped := set["_meta.lastModified"]; !stamped {
		t.Fatalf("lastModified must move with the write, got %#v", set)
	}
	if _, counted := set[FieldMetaRevision]; counted {
		t.Fatalf("the revision was written on every upsert, which would undo the counting")
	}
}

func TestWithMetaUpsertStartsANewRowAtTheFirstRevision(t *testing.T) {
	t.Parallel()
	doc := bson.M{"_id": "row-1", "_meta": bson.M{"owner": bson.M{"kind": "account", "id": "acct-1"}}}

	model := buildWithMetaUpsertModel("row-1", doc).(*mongo.UpdateOneModel)
	setOnInsert := model.Update.(bson.M)["$setOnInsert"].(bson.M)

	if got := setOnInsert[FieldMetaRevision]; got != models.InitialDocumentRevision {
		t.Fatalf("a created row starts at revision %v, want %d", got, models.InitialDocumentRevision)
	}
}

func TestPreservingMetaUpsertKeepsMetaOutOfSet(t *testing.T) {
	t.Parallel()
	doc := bson.M{"_id": "job-1", "_meta": bson.M{"clientID": "tab-9"}}

	model := buildPreservingMetaUpsertModel("job-1", doc).(*mongo.UpdateOneModel)
	set := model.Update.(bson.M)["$set"].(bson.M)
	if _, written := set["_meta"]; written {
		t.Fatalf("_meta must not be replaced wholesale, got %#v", set)
	}
}

func TestPreservingMetaUpsertWritesOwnerOnEveryUpsert(t *testing.T) {
	t.Parallel()
	doc := bson.M{"_id": "acct-1", "_meta": bson.M{
		"owner":     bson.M{"kind": "account", "id": "acct-1"},
		"createdAt": "2021-12-16T22:11:33Z",
	}}

	model := buildPreservingMetaUpsertModel("acct-1", doc).(*mongo.UpdateOneModel)
	update := model.Update.(bson.M)
	set := update["$set"].(bson.M)
	setOnInsert := update["$setOnInsert"].(bson.M)

	owner, written := set["_meta.owner"].(bson.M)
	if !written {
		t.Fatalf("owner must be in $set so an update writes it, got $set %#v", set)
	}
	if owner["kind"] != "account" || owner["id"] != "acct-1" {
		t.Fatalf("unexpected owner %#v", owner)
	}
	if _, clash := setOnInsert["_meta.owner"]; clash {
		t.Fatalf("owner must not also be in $setOnInsert, got %#v", setOnInsert)
	}
	if _, moved := set["_meta.createdAt"]; moved {
		t.Fatalf("createdAt must stay insert-only, got $set %#v", set)
	}
	if setOnInsert["_meta.createdAt"] != "2021-12-16T22:11:33Z" {
		t.Fatalf("createdAt must be preserved on insert, got %#v", setOnInsert)
	}
}

func TestPreservingMetaUpsertRejectsAHalfOwner(t *testing.T) {
	t.Parallel()
	for name, owner := range map[string]bson.M{
		"no id":   {"kind": "account"},
		"no kind": {"id": "acct-1"},
		"neither": {},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := bson.M{"_id": "acct-1", "_meta": bson.M{"owner": owner}}

			model := buildPreservingMetaUpsertModel("acct-1", doc).(*mongo.UpdateOneModel)
			set := model.Update.(bson.M)["$set"].(bson.M)

			if _, written := set["_meta.owner"]; written {
				t.Fatalf("a half owner must not be stamped, got %#v", set)
			}
		})
	}
}

func TestPreservingMetaUpsertWritesWithoutAnOwner(t *testing.T) {
	t.Parallel()
	doc := bson.M{"_id": "job-1", "_meta": bson.M{"clientID": "tab-9"}}

	model := buildPreservingMetaUpsertModel("job-1", doc).(*mongo.UpdateOneModel)
	set := model.Update.(bson.M)["$set"].(bson.M)

	if _, written := set["_meta.owner"]; written {
		t.Fatalf("no owner was named, got %#v", set)
	}
	if set["_meta.clientID"] != "tab-9" {
		t.Fatalf("clientID must still be written, got %#v", set)
	}
}

func TestPreservingMetaUpsertStartsANewDocumentAtTheFirstRevision(t *testing.T) {
	t.Parallel()
	doc := bson.M{"_id": "job-1", "_meta": bson.M{"clientID": "tab-9"}}

	model := buildPreservingMetaUpsertModel("job-1", doc).(*mongo.UpdateOneModel)
	update := model.Update.(bson.M)
	setOnInsert := update["$setOnInsert"].(bson.M)

	if got := setOnInsert[FieldMetaRevision]; got != models.InitialDocumentRevision {
		t.Fatalf("a created document starts at revision %v, want %d", got, models.InitialDocumentRevision)
	}
	if _, written := update["$set"].(bson.M)[FieldMetaRevision]; written {
		t.Fatal("the revision was set on every write, which would undo the counting")
	}
}
