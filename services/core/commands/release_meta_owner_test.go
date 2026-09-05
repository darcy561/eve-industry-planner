package commands

import (
	"slices"
	"testing"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// A collection whose documents carry `_meta` but is missing here never gains an
// owner, and nothing reads a document without one.
func TestMetaOwnerCollectionsCoverEverySchemaMaintainedOne(t *testing.T) {
	t.Parallel()
	for _, name := range eipmongo.SchemaMaintainedCollections() {
		if !slices.Contains(metaOwnerCollections, name) {
			t.Fatalf("%s carries _meta and is maintained, but is not stamped", name)
		}
	}
}

// The selection is what makes a repeat run a no-op and a partial run resumable.
func TestUnstampedMetaOwnerRequiresAnIDAndNoOwner(t *testing.T) {
	t.Parallel()
	if _, ok := unstampedMetaOwner["_meta.accountID"]; !ok {
		t.Fatal("selection does not require an account id to derive from")
	}
	owner, ok := unstampedMetaOwner["_meta.owner"].(bson.M)
	if !ok {
		t.Fatalf("unexpected owner clause %#v", unstampedMetaOwner["_meta.owner"])
	}
	if exists, ok := owner["$exists"].(bool); !ok || exists {
		t.Fatalf("owner clause must require $exists false, got %#v", owner)
	}
}
