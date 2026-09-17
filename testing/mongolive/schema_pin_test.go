package mongolive

import (
	"sort"
	"testing"
)

// The schema this module applies is mirrored in deployment-tool/internal/dataplane/mongo/{index_specs.go,preimage.go},
// which is a separate Go module and cannot be imported. The lists are pinned
// here and there; changing one without the other fails whichever test was not
// updated.
//
// Its counterpart is TestSchemaMirror_pinned in deployment-tool/internal/dataplane/mongo.
var pinnedIndexes = []string{
	"account_settings/meta_owner_1",
	"accounts/accounts_meta_lastLoginAt_1",
	"accounts/meta_owner_1",
	"archived_jobs/aj_linkedJobs_corporation_id_1",
	"archived_jobs/aj_meta_owner_archivedAt_jobID_1",
	"archived_jobs/aj_meta_owner_groupID_1",
	"archived_jobs/aj_meta_owner_itemID_jobID_1",
	"archived_jobs/aj_meta_owner_jobType_jobID_1",
	"archived_jobs/aj_meta_owner_name_jobID_1",
	"archived_jobs/aj_protected_spec_1",
	"job_documents/ajd_linkedJobs_corporation_id_1",
	"job_documents/ajd_meta_owner_displayOnPlanner_1",
	"job_documents/ajd_meta_owner_groupID_1",
	"job_documents/ajd_meta_owner_linkedJobs_job_id_1",
	"job_documents/ajd_meta_owner_marketOrders_order_id_1",
	"job_documents/ajd_meta_owner_transactions_transaction_id_1",
	"job_documents/ajd_protected_spec_1",
	"job_groups/ajg_meta_owner_1",
	"planner_memberships/pm_accountID_1",
	"planner_memberships/pm_plannerID_1",
	"statistics_rows/aajs_owner_revoked_contributedAt_1",
	"statistics_rows/aajs_owner_typeID_revoked_1",
	"statistics_timeline/atm_owner_isProductionChain_typeID_1",
	"statistics_timeline/atm_owner_typeID_1",
	"statistics_totals/apt_owner_typeID_1",
	"watchlist_deprecated/awd_meta_owner_1",
}

var pinnedPreimages = []string{
	"account_settings",
	"accounts",
	"job_documents",
	"job_groups",
	"watchlist_deprecated",
}

func TestSchemaMirror_pinned(t *testing.T) {
	t.Parallel()

	var names []string
	for _, spec := range IndexSpecs() {
		names = append(names, spec.Collection+"/"+spec.Name)
	}
	sort.Strings(names)
	assertSameList(t, "indexes", pinnedIndexes, names)

	got := append([]string(nil), PreimageCollections...)
	sort.Strings(got)
	assertSameList(t, "pre-image collections", pinnedPreimages, got)
}

func assertSameList(t *testing.T, what string, want, got []string) {
	t.Helper()
	if len(want) != len(got) {
		t.Fatalf("%s: %d here, %d pinned — update the mirror as well as this list", what, len(got), len(want))
	}
	for i := range want {
		if want[i] != got[i] {
			t.Fatalf("%s: %q here, %q pinned — update the mirror as well as this list", what, got[i], want[i])
		}
	}
}
