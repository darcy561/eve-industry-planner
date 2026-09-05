package mongo

import (
	"strings"
	"testing"
)

// A retired name that a current spec also declares would be dropped and then
// recreated on every Ensure.
func TestRetiredIndexesAreNotAlsoSpecced(t *testing.T) {
	t.Parallel()
	specced := map[string]bool{}
	for _, s := range IndexSpecs() {
		specced[s.Collection+"."+s.Name] = true
	}
	for _, r := range RetiredIndexes {
		if specced[r.Collection+"."+r.Name] {
			t.Fatalf("%s.%s is both retired and specced", r.Collection, r.Name)
		}
	}
}

func TestRetiredIndexesAreKnownCollections(t *testing.T) {
	t.Parallel()
	for _, r := range RetiredIndexes {
		if !knownCollections[r.Collection] {
			t.Fatalf("retired index names unknown collection %q\n%s", r.Collection, servicesSoT)
		}
	}
}

func TestRetiredIndexesAreDistinctAndExplained(t *testing.T) {
	t.Parallel()
	seen := map[string]bool{}
	for _, r := range RetiredIndexes {
		key := r.Collection + "." + r.Name
		if seen[key] {
			t.Fatalf("%s listed twice", key)
		}
		seen[key] = true
		if strings.TrimSpace(r.Why) == "" {
			t.Fatalf("%s has no Why", key)
		}
	}
}

func TestRenderDropIndexJSRefusesTheIDIndex(t *testing.T) {
	t.Parallel()
	if _, err := renderDropIndexJS(RetiredIndex{Collection: "archived_jobs", Name: "_id_"}); err == nil {
		t.Fatal("want an error for _id_")
	}
	if _, err := renderDropIndexJS(RetiredIndex{Collection: "archived_jobs", Name: ""}); err == nil {
		t.Fatal("want an error for an empty name")
	}
}

func TestRenderDropIndexJSDropsOnlyWhenPresent(t *testing.T) {
	t.Parallel()
	js, err := renderDropIndexJS(RetiredIndexes[0])
	if err != nil {
		t.Fatal(err)
	}
	// getCollectionNames() first: getIndexes() throws on a collection the database
	// has never held, which is the ordinary case on a first population.
	for _, frag := range []string{"getCollectionNames().includes(collName)", "getIndexes()", "dropIndex(name)", "dropped retired index "} {
		if !strings.Contains(js, frag) {
			t.Fatalf("missing %q in:\n%s", frag, js)
		}
	}
}

// Retiring an index must come before creating them, or a replacement sharing its
// keys would be dropped immediately after being created.
func TestEnsureStepsRetireBeforeCreatingIndexes(t *testing.T) {
	t.Parallel()
	if retire, create := stepIndex(t, "retired indexes"), stepIndex(t, "indexes"); retire > create {
		t.Fatalf("retired indexes runs at %d, after indexes at %d", retire, create)
	}
}
