package commands

import (
	"slices"
	"testing"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Every collection the backfill touches must be one the store knows, or the
// stamp writes into a collection Mongo creates on the spot.
func TestMetaOwnerCollectionsAreKnown(t *testing.T) {
	t.Parallel()
	known := []string{
		eipmongo.CollectionAccounts,
		eipmongo.CollectionAccountSettings,
		eipmongo.CollectionJobs,
		eipmongo.CollectionJobDocuments,
		eipmongo.CollectionJobGroups,
		eipmongo.CollectionArchivedJobs,
		eipmongo.CollectionStatisticsRows,
	}
	for _, name := range metaOwnerCollections {
		if !slices.Contains(known, name) {
			t.Fatalf("%q is not a collection that embeds MetaData", name)
		}
	}
}

func TestMetaOwnerCollectionsAreDistinct(t *testing.T) {
	t.Parallel()
	seen := map[string]bool{}
	for _, name := range metaOwnerCollections {
		if seen[name] {
			t.Fatalf("%q listed twice", name)
		}
		seen[name] = true
	}
}

// The selection is what makes a repeat run a no-op: it must require an account id
// to derive from and the absence of an owner to write.
func TestUnstampedMetaOwnerRequiresIDAndAbsentOwner(t *testing.T) {
	t.Parallel()
	if _, ok := unstampedMetaOwner["_meta.accountID"]; !ok {
		t.Fatal("selection does not require an account id")
	}
	owner, ok := unstampedMetaOwner["_meta.owner"]
	if !ok {
		t.Fatal("selection does not exclude documents already stamped")
	}
	m, ok := owner.(bson.M)
	if !ok {
		t.Fatalf("unexpected owner clause %#v", owner)
	}
	if exists, ok := m["$exists"].(bool); !ok || exists {
		t.Fatalf("owner clause must require $exists false, got %#v", m)
	}
}
