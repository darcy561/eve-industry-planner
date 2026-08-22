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
		"CollectionAccounts":                     "accounts",
		"CollectionAccountJobs":                  "account_jobs",
		"CollectionAccountJobDocuments":          "account_job_documents",
		"CollectionAccountArchivedJobs":          "account_archived_jobs",
		"CollectionAccountProductionTotals":      "account_production_totals",
		"CollectionAccountJobGroups":             "account_job_groups",
		"CollectionAccountGroupTemplateCatalog":  "account_group_template_catalog",
		"CollectionAccountGroupTemplatePayloads": "account_group_template_payloads",
		"CollectionAccountWatchlistDeprecated":   "account_watchlist_deprecated",
		"CollectionAccountSettings":              "account_settings",
		"CollectionSharedBlueprints":             "shared_blueprints",
		"CollectionSharedCitadelNames":           "shared_citadel_names",
		"CollectionArchivedJobStats":             "account_archived_job_stats",
		"CollectionAccountTimelineMonths":        "account_timeline_months",
		"CollectionAccountRebuildQueue":          "account_stats_rebuild_queue",
	}

	got := map[string]string{
		"CollectionAccounts":                     CollectionAccounts,
		"CollectionAccountJobs":                  CollectionAccountJobs,
		"CollectionAccountJobDocuments":          CollectionAccountJobDocuments,
		"CollectionAccountArchivedJobs":          CollectionAccountArchivedJobs,
		"CollectionAccountProductionTotals":      CollectionAccountProductionTotals,
		"CollectionAccountJobGroups":             CollectionAccountJobGroups,
		"CollectionAccountGroupTemplateCatalog":  CollectionAccountGroupTemplateCatalog,
		"CollectionAccountGroupTemplatePayloads": CollectionAccountGroupTemplatePayloads,
		"CollectionAccountWatchlistDeprecated":   CollectionAccountWatchlistDeprecated,
		"CollectionAccountSettings":              CollectionAccountSettings,
		"CollectionSharedBlueprints":             CollectionSharedBlueprints,
		"CollectionSharedCitadelNames":           CollectionSharedCitadelNames,
		"CollectionArchivedJobStats":             CollectionArchivedJobStats,
		"CollectionAccountTimelineMonths":        CollectionAccountTimelineMonths,
		"CollectionAccountRebuildQueue":          CollectionAccountRebuildQueue,
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
