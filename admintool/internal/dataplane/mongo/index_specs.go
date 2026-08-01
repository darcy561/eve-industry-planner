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
	// archivedJobs: must match services UnprocessedArchivedJobFilter when that filter changes.
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
			// Port of UnprocessedArchivedJobFilter (services/shared/core/mongo/archived_job_queries.go).
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
	}
}
