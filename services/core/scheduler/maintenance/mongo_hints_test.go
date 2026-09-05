package maintenance

import "testing"

// A hint names an index that must exist: Mongo fails the whole query with
// BadValue rather than falling back to a scan, so a hint that has drifted from
// the spec takes the maintenance job down every run.
//
// The index is created by deployment-tool IndexSpecs, a separate Go module this
// one cannot import, so the name is repeated here and pinned on both sides. Its
// counterpart is TestIndexHintNamesAreSpelledAsSpecced in
// deployment-tool/internal/dataplane/mongo.
func TestHintNamesMatchTheIndexSpecs(t *testing.T) {
	t.Parallel()
	const specced = "accounts_meta_lastLoginAt_1"
	if accountsMetaLastLoginAtIndexName != specced {
		t.Fatalf("hint is %q, but IndexSpecs creates %q\n"+
			"index names are owned by deployment-tool/internal/dataplane/mongo/index_specs.go; "+
			"update it and its TestIndexHintNamesAreSpelledAsSpecced together with this file",
			accountsMetaLastLoginAtIndexName, specced)
	}
}
