package dataplane

import (
	"testing"
)

func TestServiceEnsuresRegistry(t *testing.T) {
	t.Parallel()
	all := ServiceEnsures()
	if len(all) == 0 {
		t.Fatal("empty ensure registry")
	}
	seen := map[string]bool{}
	for _, e := range all {
		if e.Short == "" || e.Label == "" || e.Run == nil || e.TaskRunning == nil {
			t.Fatalf("incomplete entry: %+v", e)
		}
		if seen[e.Short] {
			t.Fatalf("duplicate short %q", e.Short)
		}
		seen[e.Short] = true
		if !HasServiceEnsure(e.Short) {
			t.Fatalf("HasServiceEnsure(%q)=false", e.Short)
		}
	}
	if HasServiceEnsure("redis") {
		t.Fatal("redis should not have an ensure")
	}
}
