package mongo

// Database and collection names for the product Mongo database.

const (
	DatabaseName = "eve_industry_planner"

	CollectionUsers                     = "users"
	CollectionJobs                      = "jobs"
	CollectionUserJobDocuments          = "user_job_documents"
	CollectionArchivedJobs              = "archivedJobs"
	CollectionBuildStats                = "build_stats"
	CollectionUserJobGroups             = "user_job_groups"
	CollectionUserGroupTemplateCatalog  = "user_group_template_catalog"
	CollectionUserGroupTemplatePayloads = "user_group_template_payloads"
	CollectionUserWatchlistDeprecated   = "user_watchlist_deprecated"
	CollectionApplicationSettings       = "application_settings"
	CollectionBlueprints                = "blueprints"
	CollectionCitadelNames              = "citadel_names"

	CollectionArchivedJobStats    = "user_archived_job_stats"
	CollectionUserRollupBuckets   = "user_rollup_buckets"
	CollectionAccountRebuildQueue = "stats_rebuild_queue_accounts"
)

// SchemaMaintainedCollections lists every collection whose documents carry a
// schemaVersion and are upgraded by the maintenance batch.
//
// The scheduler rotates this list and the batch handler dispatches on it, so a
// collection added here is picked up by both. A collection in only one of the two
// is either never visited or rejected when it arrives.
func SchemaMaintainedCollections() []string {
	return []string{
		CollectionUsers,
		CollectionApplicationSettings,
		CollectionUserJobDocuments,
		CollectionJobs,
		CollectionArchivedJobs,
		CollectionUserJobGroups,
	}
}
