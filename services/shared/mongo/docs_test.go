package mongo

import (
	"testing"

	"eve-industry-planner/shared/models"

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
	// Field by field, not as a block: a $set of the whole `_meta` would drop the
	// revision, which is no part of the struct this writer marshals.
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

// A derived row is created with a counter like anything else, or the release
// step's seeding is undone the first time the rebuild runs.
func TestWithMetaUpsertStartsANewRowAtTheFirstRevision(t *testing.T) {
	t.Parallel()
	doc := bson.M{"_id": "row-1", "_meta": bson.M{"owner": bson.M{"kind": "account", "id": "acct-1"}}}

	model := buildWithMetaUpsertModel("row-1", doc).(*mongo.UpdateOneModel)
	setOnInsert := model.Update.(bson.M)["$setOnInsert"].(bson.M)

	if got := setOnInsert[FieldMetaRevision]; got != models.InitialDocumentRevision {
		t.Fatalf("a created row starts at revision %v, want %d", got, models.InitialDocumentRevision)
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

// The owner is how a scoped read addresses a document, so a preserving-meta upsert has to write it
// on every write and not only on insert.
//
// Leaving it to `$setOnInsert` means an update produces a document the paired read cannot find:
// `UpsertStructPreservingMeta` matches on `_id` alone and succeeds, while `LoadUserAccount` and its
// siblings match on `_meta.owner.kind` and `_meta.owner.id` as well and miss forever. A caller that
// cannot read back what it just wrote then merges its save over the top of the stored document,
// which is how an account's stored state was replaced by whatever the client happened to hold.
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
	// Mongo refuses the same path in both operators, and an owner in $setOnInsert would not be
	// written by the update that needs it.
	if _, clash := setOnInsert["_meta.owner"]; clash {
		t.Fatalf("owner must not also be in $setOnInsert, got %#v", setOnInsert)
	}
	// Everything else about `_meta` still belongs to whoever wrote it first.
	if _, moved := set["_meta.createdAt"]; moved {
		t.Fatalf("createdAt must stay insert-only, got $set %#v", set)
	}
	if setOnInsert["_meta.createdAt"] != "2021-12-16T22:11:33Z" {
		t.Fatalf("createdAt must be preserved on insert, got %#v", setOnInsert)
	}
}

// A half-filled owner is as unreachable as none: the scoped reads match on kind and id together.
// Stamping one would satisfy the release's "carries an owner" check while leaving the document lost.
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

// A document whose caller names no owner at all still writes: the owner is stamped where one is
// given, not required of every collection.
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

// A document is created at the first revision rather than without one.
//
// Absent and zero read the same to a caller and differently to Mongo: a filter
// on zero does not match a missing field, so a conditional write comparing the
// revision it read would never match a document that had never been counted —
// failing every time rather than conflicting once.
func TestPreservingMetaUpsertStartsANewDocumentAtTheFirstRevision(t *testing.T) {
	t.Parallel()
	doc := bson.M{"_id": "job-1", "_meta": bson.M{"clientID": "tab-9"}}

	model := buildPreservingMetaUpsertModel("job-1", doc).(*mongo.UpdateOneModel)
	update := model.Update.(bson.M)
	setOnInsert := update["$setOnInsert"].(bson.M)

	if got := setOnInsert[FieldMetaRevision]; got != models.InitialDocumentRevision {
		t.Fatalf("a created document starts at revision %v, want %d", got, models.InitialDocumentRevision)
	}
	// Only on insert: an update that set it would put the counter back.
	if _, written := update["$set"].(bson.M)[FieldMetaRevision]; written {
		t.Fatal("the revision was set on every write, which would undo the counting")
	}
}
