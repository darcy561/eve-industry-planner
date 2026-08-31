package mongo

// Database and collection names for the product Mongo database.

const (
	DatabaseName = "eve_industry_planner"

	CollectionAccounts                     = "accounts"
	CollectionAccountJobs                  = "account_jobs"
	CollectionAccountJobDocuments          = "account_job_documents"
	CollectionAccountArchivedJobs          = "account_archived_jobs"
	CollectionAccountProductionTotals      = "account_production_totals"
	CollectionAccountJobGroups             = "account_job_groups"
	CollectionAccountGroupTemplateCatalog  = "account_group_template_catalog"
	CollectionAccountGroupTemplatePayloads = "account_group_template_payloads"
	CollectionAccountWatchlistDeprecated   = "account_watchlist_deprecated"
	CollectionAccountSettings              = "account_settings"
	CollectionSharedBlueprints             = "shared_blueprints"
	CollectionSharedCitadelNames           = "shared_citadel_names"

	CollectionArchivedJobStats      = "account_archived_job_stats"
	CollectionAccountTimelineMonths = "account_timeline_months"
	CollectionAccountRebuildQueue   = "account_stats_rebuild_queue"
	CollectionAccountReconcileRota  = "account_stats_reconcile_rota"
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
		CollectionAccountJobDocuments,
		CollectionAccountJobs,
		CollectionAccountArchivedJobs,
		CollectionAccountJobGroups,
	}
}
