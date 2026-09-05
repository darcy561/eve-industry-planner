package mongo

// Database and collection names for the product Mongo database.

const (
	DatabaseName = "eve_industry_planner"

	CollectionAccounts              = "accounts"
	CollectionJobs                  = "jobs"
	CollectionJobDocuments          = "job_documents"
	CollectionArchivedJobs          = "archived_jobs"
	CollectionStatisticsTotals      = "statistics_totals"
	CollectionJobGroups             = "job_groups"
	CollectionGroupTemplateCatalog  = "group_template_catalog"
	CollectionGroupTemplatePayloads = "group_template_payloads"
	CollectionWatchlistDeprecated   = "watchlist_deprecated"
	CollectionAccountSettings       = "account_settings"
	CollectionSharedBlueprints      = "shared_blueprints"
	CollectionSharedCitadelNames    = "shared_citadel_names"

	CollectionStatisticsRows          = "statistics_rows"
	CollectionStatisticsTimeline      = "statistics_timeline"
	CollectionStatisticsRebuildQueue  = "statistics_rebuild_queue"
	CollectionStatisticsReconcileRota = "statistics_reconcile_rota"
)

// SchemaMaintainedCollections lists every collection whose documents carry a
// schemaVersion and are upgraded by the maintenance batch.
//
// The scheduler rotates this list and the batch handler dispatches on it, so a
// collection added here is picked up by both. A collection in only one of the two
// is either never visited or rejected when it arrives.
func SchemaMaintainedCollections() []string {
	return []string{
		CollectionAccounts,
		CollectionAccountSettings,
		CollectionJobDocuments,
		CollectionJobs,
		CollectionArchivedJobs,
		CollectionJobGroups,
	}
}
