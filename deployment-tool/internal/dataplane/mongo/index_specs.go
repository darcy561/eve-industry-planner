package mongo

// IndexKey is one field in an index key pattern (order 1 or -1).
type IndexKey struct {
	Field string
	Order int
}

// IndexSpec is one application MongoDB index (SoT for dataplane.EnsureMongo).
// Older conflicting index names are not dropped — create by name only.
type IndexSpec struct {
	Collection string
	Name       string
	Keys       []IndexKey
	// PartialFilterJSON is optional mongosh/JSON object for partialFilterExpression.
	// A partial filter must match the query filter it serves, or the index stops
	// covering that query. services/ is a separate module, so filters mirrored from
	// there are pinned by tests on both sides rather than shared as code.
	PartialFilterJSON string
}

// IndexSpecs is the declarative list of indexes Ensure creates (after preimages).
func IndexSpecs() []IndexSpec {
	return []IndexSpec{
		{
			Collection: "accounts",
			Name:       "meta_accountID_1",
			Keys:       []IndexKey{{Field: "_meta.accountID", Order: 1}},
		},
		{
			Collection: "accounts",
			Name:       "accounts_meta_lastLoginAt_1",
			Keys:       []IndexKey{{Field: "_meta.lastLoginAt", Order: 1}},
		},
		{
			Collection: "account_settings",
			Name:       "meta_accountID_1",
			Keys:       []IndexKey{{Field: "_meta.accountID", Order: 1}},
		},
		{
			Collection: "account_job_groups",
			Name:       "ajg_meta_accountID_1",
			Keys:       []IndexKey{{Field: "_meta.accountID", Order: 1}},
		},
		{
			Collection: "account_watchlist_deprecated",
			Name:       "awd_meta_accountID_1",
			Keys:       []IndexKey{{Field: "_meta.accountID", Order: 1}},
		},
		{
			Collection: "account_job_documents",
			Name:       "ajd_meta_accountID_displayOnPlanner_1",
			Keys: []IndexKey{
				{Field: "_meta.accountID", Order: 1},
				{Field: "displayOnPlanner", Order: 1},
			},
		},
		{
			Collection: "account_job_documents",
			Name:       "ajd_meta_accountID_groupID_1",
			Keys: []IndexKey{
				{Field: "_meta.accountID", Order: 1},
				{Field: "groupID", Order: 1},
			},
		},
		{
			Collection: "account_job_documents",
			Name:       "ajd_linkedJobs_corporation_id_1",
			Keys:       []IndexKey{{Field: "build.costs.linkedJobs.corporation_id", Order: 1}},
		},
		{
			Collection: "account_job_documents",
			Name:       "ajd_protected_spec_1",
			Keys:       []IndexKey{{Field: "protected.spec", Order: 1}},
		},
		{
			Collection: "account_archived_jobs",
			Name:       "aj_linkedJobs_corporation_id_1",
			Keys:       []IndexKey{{Field: "build.costs.linkedJobs.corporation_id", Order: 1}},
		},
		{
			Collection: "account_archived_jobs",
			Name:       "aj_protected_spec_1",
			Keys:       []IndexKey{{Field: "protected.spec", Order: 1}},
		},
		{
			Collection: "account_archived_job_stats",
			Name:       "aajs_accountID_typeID_isProductionChain_revoked_1",
			Keys: []IndexKey{
				{Field: "accountID", Order: 1},
				{Field: "typeID", Order: 1},
				{Field: "isProductionChain", Order: 1},
				{Field: "revoked", Order: 1},
			},
		},
		{
			Collection: "account_archived_job_stats",
			Name:       "aajs_accountID_archivedAt_revoked_1",
			Keys: []IndexKey{
				{Field: "accountID", Order: 1},
				{Field: "archivedAt", Order: 1},
				{Field: "revoked", Order: 1},
			},
		},
		{
			Collection: "account_timeline_months",
			Name:       "atm_accountID_year_month_typeID_1",
			Keys: []IndexKey{
				{Field: "accountID", Order: 1},
				{Field: "year", Order: 1},
				{Field: "month", Order: 1},
				{Field: "typeID", Order: 1},
			},
		},
		{
			// Serves the timeline views narrowed to one item type. The index
			// above leads with year and month, so a query naming a type but a
			// range of months can only use its accountID prefix; this one puts
			// typeID second so both are used.
			Collection: "account_timeline_months",
			Name:       "atm_accountID_typeID_year_month_1",
			Keys: []IndexKey{
				{Field: "accountID", Order: 1},
				{Field: "typeID", Order: 1},
				{Field: "year", Order: 1},
				{Field: "month", Order: 1},
			},
		},
		{
			// Serves the lifetime totals read, whole-account and single-type.
			Collection: "account_production_totals",
			Name:       "apt_accountID_typeID_1",
			Keys: []IndexKey{
				{Field: "accountID", Order: 1},
				{Field: "typeID", Order: 1},
			},
		},
	}
}
