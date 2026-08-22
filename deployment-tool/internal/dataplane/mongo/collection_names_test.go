package mongo

import "testing"

// knownCollections is this module's copy of the collection names owned by
// services/shared/mongo/names.go. deployment-tool is a separate Go module and
// cannot import services, so the names are repeated here as strings and pinned
// by this test.
//
// Its counterpart is TestCollectionNames_canonical in services/shared/mongo.
// Changing a name in one module without the other fails whichever test was not
// updated, with a message naming the file to fix.
var knownCollections = map[string]bool{
	"accounts":                        true,
	"account_jobs":                    true,
	"account_job_documents":           true,
	"account_archived_jobs":           true,
	"account_production_totals":       true,
	"account_job_groups":              true,
	"account_group_template_catalog":  true,
	"account_group_template_payloads": true,
	"account_watchlist_deprecated":    true,
	"account_settings":                true,
	"shared_blueprints":               true,
	"shared_citadel_names":            true,
	"account_archived_job_stats":      true,
	"account_timeline_months":         true,
	"account_stats_rebuild_queue":     true,
}

const servicesSoT = "collection names are owned by services/shared/mongo/names.go; " +
	"update it and its TestCollectionNames_canonical together with this file"

// An index spec naming a collection nothing reads is silent: Mongo creates the
// collection to hold the index rather than reporting an error, so the drift
// only surfaces as missing data.
func TestIndexSpecCollectionsAreKnown(t *testing.T) {
	t.Parallel()
	for _, spec := range IndexSpecs() {
		if !knownCollections[spec.Collection] {
			t.Fatalf("index spec %q targets unknown collection %q\n%s", spec.Name, spec.Collection, servicesSoT)
		}
	}
}

func TestPreimageCollectionsAreKnown(t *testing.T) {
	t.Parallel()
	for _, name := range PreimageCollections {
		if !knownCollections[name] {
			t.Fatalf("preimage list names unknown collection %q\n%s", name, servicesSoT)
		}
	}
}

// A rename's target has to be a name the application actually reads, and its
// source has to be one the application has stopped reading. Catching the second
// case matters most: renaming away from a name still in knownCollections means
// the code and the database would disagree the moment Ensure runs.
func TestCollectionRenamesAgreeWithKnownNames(t *testing.T) {
	t.Parallel()
	for _, r := range CollectionRenames {
		if r.From == "" || r.To == "" {
			t.Fatalf("rename %q -> %q has an empty side", r.From, r.To)
		}
		if r.From == r.To {
			t.Fatalf("rename %q has the same source and target", r.From)
		}
		if !knownCollections[r.To] {
			t.Fatalf("rename target %q is not a known collection\n%s", r.To, servicesSoT)
		}
		if knownCollections[r.From] {
			t.Fatalf("rename source %q is still a known collection: the application would keep reading the old name after Ensure moved it\n%s", r.From, servicesSoT)
		}
	}
}
