package mongo

import "testing"

// hintedIndexNames are indexes that services name in a query hint.
//
// A hint fails the query outright when the index is absent, so renaming or
// dropping one of these breaks a caller that this module cannot see. services is
// a separate Go module, so the names are repeated here and pinned on both sides.
// Its counterpart is TestHintNamesMatchTheIndexSpecs in
// services/core/scheduler/maintenance.
var hintedIndexNames = map[string]string{
	"accounts_meta_lastLoginAt_1": "accounts",
}

func TestIndexHintNamesAreSpelledAsSpecced(t *testing.T) {
	t.Parallel()
	for name, collection := range hintedIndexNames {
		found := false
		for _, spec := range IndexSpecs() {
			if spec.Name == name && spec.Collection == collection {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("%s.%s is named by a query hint in services but no spec creates it\n"+
				"a hint on a missing index fails the query; update the hint in "+
				"services/core/scheduler/maintenance/mongo_hints.go together with this file",
				collection, name)
		}
	}
}
