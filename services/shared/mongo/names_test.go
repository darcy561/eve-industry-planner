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
		"CollectionAccounts":               "accounts",
		"CollectionJobs":                   "jobs",
		"CollectionJobDocuments":           "job_documents",
		"CollectionArchivedJobs":           "archived_jobs",
		"CollectionStatisticsTotals":       "statistics_totals",
		"CollectionJobGroups":              "job_groups",
		"CollectionGroupTemplateCatalog":   "group_template_catalog",
		"CollectionGroupTemplatePayloads":  "group_template_payloads",
		"CollectionWatchlistDeprecated":    "watchlist_deprecated",
		"CollectionAccountSettings":        "account_settings",
		"CollectionSharedBlueprints":       "shared_blueprints",
		"CollectionSharedCitadelNames":     "shared_citadel_names",
		"CollectionStatisticsRows":         "statistics_rows",
		"CollectionStatisticsTimeline":     "statistics_timeline",
		"CollectionStatisticsRebuildQueue": "statistics_rebuild_queue",
	}

	got := map[string]string{
		"CollectionAccounts":               CollectionAccounts,
		"CollectionJobs":                   CollectionJobs,
		"CollectionJobDocuments":           CollectionJobDocuments,
		"CollectionArchivedJobs":           CollectionArchivedJobs,
		"CollectionStatisticsTotals":       CollectionStatisticsTotals,
		"CollectionJobGroups":              CollectionJobGroups,
		"CollectionGroupTemplateCatalog":   CollectionGroupTemplateCatalog,
		"CollectionGroupTemplatePayloads":  CollectionGroupTemplatePayloads,
		"CollectionWatchlistDeprecated":    CollectionWatchlistDeprecated,
		"CollectionAccountSettings":        CollectionAccountSettings,
		"CollectionSharedBlueprints":       CollectionSharedBlueprints,
		"CollectionSharedCitadelNames":     CollectionSharedCitadelNames,
		"CollectionStatisticsRows":         CollectionStatisticsRows,
		"CollectionStatisticsTimeline":     CollectionStatisticsTimeline,
		"CollectionStatisticsRebuildQueue": CollectionStatisticsRebuildQueue,
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
