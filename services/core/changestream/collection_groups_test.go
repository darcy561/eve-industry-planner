package changestream

import (
	"strings"
	"testing"

	eipmongo "eve-industry-planner/shared/mongo"
)

func TestValidateCollectionGroups_ok(t *testing.T) {
	groups := []CollectionGroup{
		Group("a", eipmongo.CollectionAccounts),
		Group("b", eipmongo.CollectionJobs),
	}
	if err := validateCollectionGroups(groups); err != nil {
		t.Fatal(err)
	}
}

func TestValidateCollectionGroups_duplicateCollection(t *testing.T) {
	groups := []CollectionGroup{
		Group("a", eipmongo.CollectionAccounts),
		Group("b", eipmongo.CollectionAccounts),
	}
	err := validateCollectionGroups(groups)
	if err == nil || !strings.Contains(err.Error(), eipmongo.CollectionAccounts) {
		t.Fatalf("expected duplicate collection error, got %v", err)
	}
}

func TestValidateCollectionGroups_emptyGroup(t *testing.T) {
	err := validateCollectionGroups([]CollectionGroup{{ID: "x", Collections: nil}})
	if err == nil {
		t.Fatal("expected error for empty collections")
	}
}
