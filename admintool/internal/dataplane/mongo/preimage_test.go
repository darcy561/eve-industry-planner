package mongo

import (
	"strings"
	"testing"
)

func TestPreimageCollections(t *testing.T) {
	t.Parallel()
	want := []string{
		"user_job_groups",
		"user_job_documents",
		"users",
		"application_settings",
		"user_watchlist_deprecated",
	}
	if len(PreimageCollections) != len(want) {
		t.Fatalf("len=%d want %d: %#v", len(PreimageCollections), len(want), PreimageCollections)
	}
	for i, name := range want {
		if PreimageCollections[i] != name {
			t.Fatalf("[%d]=%q want %q", i, PreimageCollections[i], name)
		}
		if !safeCollName.MatchString(name) {
			t.Fatalf("unsafe name %q", name)
		}
	}
}

func TestEnsureJSParity(t *testing.T) {
	t.Parallel()
	for _, snip := range []struct {
		name string
		js   string
		need []string
	}{
		{"firstRoot", createFirstRootJS, []string{"createUser", "EIP_MONGO_ROOT_USERNAME"}},
		{"users", ensureUsersJS, []string{"createUser", "updateUser", "fsync", "eve_industry_planner", "EIP_MONGO_USERNAME"}},
		{"preimage", ensurePreimageJS, []string{"createCollection", "changeStreamPreAndPostImages", "EIP_COLLMOD_COLL_NAME"}},
	} {
		for _, n := range snip.need {
			if !strings.Contains(snip.js, n) {
				t.Fatalf("%s missing %q", snip.name, n)
			}
		}
	}
}
