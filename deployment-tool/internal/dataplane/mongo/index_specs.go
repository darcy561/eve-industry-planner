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
			Collection: "archivedJobs",
			Name:       "meta_accountID_1__id_1_unprocessed_archived_jobs",
			Keys: []IndexKey{
				{Field: "_meta.accountID", Order: 1},
				{Field: "_id", Order: 1},
			},
			// Mirror of UnprocessedArchivedJobFilter (services/shared/mongo/archive.go).
			// Both sides pin the canonical form in their tests; changing one alone fails the other.
			PartialFilterJSON: `{
  "$or": [
    {"_meta.archiveProcessed": null, "archiveProcessed": null},
    {"_meta.archiveProcessed": null, "archiveProcessed": false},
    {"_meta.archiveProcessed": false, "archiveProcessed": null},
    {"_meta.archiveProcessed": false, "archiveProcessed": false}
  ]
}`,
		},
		{
			Collection: "users",
			Name:       "meta_accountID_1",
			Keys:       []IndexKey{{Field: "_meta.accountID", Order: 1}},
		},
		{
			Collection: "users",
			Name:       "users_meta_lastLoginAt_1",
			Keys:       []IndexKey{{Field: "_meta.lastLoginAt", Order: 1}},
		},
		{
			Collection: "application_settings",
			Name:       "meta_accountID_1",
			Keys:       []IndexKey{{Field: "_meta.accountID", Order: 1}},
		},
		{
			Collection: "user_job_groups",
			Name:       "ujg_meta_accountID_1",
			Keys:       []IndexKey{{Field: "_meta.accountID", Order: 1}},
		},
		{
			Collection: "user_watchlist_deprecated",
			Name:       "uwd_meta_accountID_1",
			Keys:       []IndexKey{{Field: "_meta.accountID", Order: 1}},
		},
		{
			Collection: "user_job_documents",
			Name:       "ujd_meta_accountID_displayOnPlanner_1",
			Keys: []IndexKey{
				{Field: "_meta.accountID", Order: 1},
				{Field: "displayOnPlanner", Order: 1},
			},
		},
		{
			Collection: "user_job_documents",
			Name:       "ujd_meta_accountID_groupID_1",
			Keys: []IndexKey{
				{Field: "_meta.accountID", Order: 1},
				{Field: "groupID", Order: 1},
			},
		},
		{
			Collection: "user_job_documents",
			Name:       "ujd_linkedJobs_corporation_id_1",
			Keys:       []IndexKey{{Field: "build.costs.linkedJobs.corporation_id", Order: 1}},
		},
		{
			Collection: "user_job_documents",
			Name:       "ujd_protected_spec_1",
			Keys:       []IndexKey{{Field: "protected.spec", Order: 1}},
		},
		{
			Collection: "archivedJobs",
			Name:       "aj_linkedJobs_corporation_id_1",
			Keys:       []IndexKey{{Field: "build.costs.linkedJobs.corporation_id", Order: 1}},
		},
		{
			Collection: "archivedJobs",
			Name:       "aj_protected_spec_1",
			Keys:       []IndexKey{{Field: "protected.spec", Order: 1}},
		},
		{
			Collection: "user_archived_job_stats",
			Name:       "uajs_accountID_typeID_isProductionChain_revoked_1",
			Keys: []IndexKey{
				{Field: "accountID", Order: 1},
				{Field: "typeID", Order: 1},
				{Field: "isProductionChain", Order: 1},
				{Field: "revoked", Order: 1},
			},
		},
		{
			Collection: "user_archived_job_stats",
			Name:       "uajs_accountID_archivedAt_revoked_1",
			Keys: []IndexKey{
				{Field: "accountID", Order: 1},
				{Field: "archivedAt", Order: 1},
				{Field: "revoked", Order: 1},
			},
		},
		{
			Collection: "user_rollup_buckets",
			Name:       "urb_accountID_year_month_typeID_1",
			Keys: []IndexKey{
				{Field: "accountID", Order: 1},
				{Field: "year", Order: 1},
				{Field: "month", Order: 1},
				{Field: "typeID", Order: 1},
			},
		},
	}
}
