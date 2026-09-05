package mongo

import (
	"strings"
	"testing"
)

func stepIndex(t *testing.T, name string) int {
	t.Helper()
	for i, s := range ensureSteps {
		if s.name == name {
			return i
		}
	}
	t.Fatalf("ensureSteps has no %q step: %v", name, ensureSteps)
	return -1
}

// Preimages and indexes both create a collection when the name is absent. Were
// either to run first, it would create the rename's target, and the rename then
// refuses because both ends exist — stranding the data under the old name.
func TestEnsureStepsRenameBeforeCreators(t *testing.T) {
	t.Parallel()
	renames := stepIndex(t, "collection names")
	for _, creator := range []string{"preimage collections", "indexes"} {
		if got := stepIndex(t, creator); got < renames {
			t.Fatalf("%q runs at %d, before renames at %d", creator, got, renames)
		}
	}
}

func TestPreimageJSRefusesToCreateOverAPendingRename(t *testing.T) {
	t.Parallel()
	for _, frag := range []string{
		"EIP_COLLMOD_RENAME_SOURCES",
		"renames must run before preimages",
		"createCollection",
	} {
		if !strings.Contains(ensurePreimageJS, frag) {
			t.Fatalf("ensurePreimageJS missing %q:\n%s", frag, ensurePreimageJS)
		}
	}
}

// Every preimage collection is reached by a rename, so each carries a source
// for the guard to compare against; a preimage collection with no rename would
// silently pass an empty list.
func TestPreimageCollectionsCarryRenameSources(t *testing.T) {
	t.Parallel()
	for _, name := range PreimageCollections {
		if len(renameSourcesFor(name)) == 0 {
			t.Fatalf("preimage collection %q has no rename source", name)
		}
	}
}

func TestRenameSourcesForUnknownTargetIsEmpty(t *testing.T) {
	t.Parallel()
	if got := renameSourcesFor("no_such_collection"); len(got) != 0 {
		t.Fatalf("want none, got %v", got)
	}
}
