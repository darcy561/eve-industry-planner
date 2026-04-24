package changestream

import (
	"strings"
	"testing"

	mongocore "eve-industry-planner/shared/core/mongo"
)

func TestValidateCollectionGroups_ok(t *testing.T) {
	groups := []CollectionGroup{
		Group("a", mongocore.CollectionUsers),
		Group("b", mongocore.CollectionJobs),
	}
	if err := validateCollectionGroups(groups); err != nil {
		t.Fatal(err)
	}
}

func TestValidateCollectionGroups_duplicateCollection(t *testing.T) {
	groups := []CollectionGroup{
		Group("a", mongocore.CollectionUsers),
		Group("b", mongocore.CollectionUsers),
	}
	err := validateCollectionGroups(groups)
	if err == nil || !strings.Contains(err.Error(), mongocore.CollectionUsers) {
		t.Fatalf("expected duplicate collection error, got %v", err)
	}
}

func TestValidateCollectionGroups_emptyGroup(t *testing.T) {
	err := validateCollectionGroups([]CollectionGroup{{ID: "x", Collections: nil}})
	if err == nil {
		t.Fatal("expected error for empty collections")
	}
}
