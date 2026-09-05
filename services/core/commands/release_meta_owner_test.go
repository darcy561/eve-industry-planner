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

// The gate must catch every ownerless document, not only the ones the stamp
// could have derived an owner for: a document with no usable account id is
// exactly the one the stamp leaves behind.
func TestMissingMetaOwnerSelectsOnOwnerAlone(t *testing.T) {
	t.Parallel()
	if len(missingMetaOwner) != 1 {
		t.Fatalf("gate must select on the owner alone, got %#v", missingMetaOwner)
	}
	owner, ok := missingMetaOwner["_meta.owner"].(bson.M)
	if !ok {
		t.Fatalf("unexpected owner clause %#v", missingMetaOwner["_meta.owner"])
	}
	if exists, ok := owner["$exists"].(bool); !ok || exists {
		t.Fatalf("gate must require $exists false, got %#v", owner)
	}
}

// The gate runs last: every step before it can leave a document unstamped.
func TestReleaseVerifiesOwnersLast(t *testing.T) {
	t.Parallel()
	for _, rel := range releases {
		if len(rel.steps) == 0 {
			continue
		}
		last := rel.steps[len(rel.steps)-1]
		if last.name != "verify every document carries an owner" {
			t.Fatalf("release %s ends with %q, not the owner gate", rel.version, last.name)
		}
	}
}
