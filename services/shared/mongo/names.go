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
