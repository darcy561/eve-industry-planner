package mongo

import "testing"

// Collection names are duplicated across a module boundary: this package holds
// the constants, and deployment-tool repeats them as bare strings in its index
// specs and preimage list, because deployment-tool cannot import services.
//
// Nothing else makes that duplication fail. An index spec naming a collection
// that no longer exists is not an error — Mongo creates the collection to hold
// the index — so a half-finished rename leaves eip ensure-mongo maintaining a
// collection nothing reads, silently, until someone notices the data is missing.
//
// This test pins the set so renaming a collection here fails until the
// Deployment Tool is updated to match, and vice versa.
func TestCollectionNames_canonical(t *testing.T) {
	t.Parallel()

	want := map[string]string{
		"CollectionUsers":                     "users",
		"CollectionJobs":                      "jobs",
		"CollectionUserJobDocuments":          "user_job_documents",
		"CollectionArchivedJobs":              "archivedJobs",
		"CollectionBuildStats":                "build_stats",
		"CollectionUserJobGroups":             "user_job_groups",
		"CollectionUserGroupTemplateCatalog":  "user_group_template_catalog",
		"CollectionUserGroupTemplatePayloads": "user_group_template_payloads",
		"CollectionUserWatchlistDeprecated":   "user_watchlist_deprecated",
		"CollectionApplicationSettings":       "application_settings",
		"CollectionBlueprints":                "blueprints",
		"CollectionCitadelNames":              "citadel_names",
		"CollectionArchivedJobStats":          "user_archived_job_stats",
		"CollectionUserRollupBuckets":         "user_rollup_buckets",
		"CollectionAccountRebuildQueue":       "stats_rebuild_queue_accounts",
	}

	got := map[string]string{
		"CollectionUsers":                     CollectionUsers,
		"CollectionJobs":                      CollectionJobs,
		"CollectionUserJobDocuments":          CollectionUserJobDocuments,
		"CollectionArchivedJobs":              CollectionArchivedJobs,
		"CollectionBuildStats":                CollectionBuildStats,
		"CollectionUserJobGroups":             CollectionUserJobGroups,
		"CollectionUserGroupTemplateCatalog":  CollectionUserGroupTemplateCatalog,
		"CollectionUserGroupTemplatePayloads": CollectionUserGroupTemplatePayloads,
		"CollectionUserWatchlistDeprecated":   CollectionUserWatchlistDeprecated,
		"CollectionApplicationSettings":       CollectionApplicationSettings,
		"CollectionBlueprints":                CollectionBlueprints,
		"CollectionCitadelNames":              CollectionCitadelNames,
		"CollectionArchivedJobStats":          CollectionArchivedJobStats,
		"CollectionUserRollupBuckets":         CollectionUserRollupBuckets,
		"CollectionAccountRebuildQueue":       CollectionAccountRebuildQueue,
	}

	const alsoUpdate = "renaming a collection also requires: " +
		"deployment-tool/internal/dataplane/mongo/index_specs.go, " +
		"deployment-tool/internal/dataplane/mongo/preimage.go, " +
		"a CollectionRenames entry in deployment-tool/internal/dataplane/mongo/renames.go, " +
		"and the matching test in deployment-tool/internal/dataplane/mongo/collection_names_test.go"

	for name, wantValue := range want {
		gotValue, ok := got[name]
		if !ok {
			t.Fatalf("%s is missing from this test's got map", name)
		}
		if gotValue != wantValue {
			t.Fatalf("%s = %q, want %q\n%s", name, gotValue, wantValue, alsoUpdate)
		}
	}

	if len(got) != len(want) {
		t.Fatalf("collection constant count = %d, want %d — a new collection needs a row here\n%s", len(got), len(want), alsoUpdate)
	}
}
