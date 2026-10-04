package mongo

import (
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/models"
)

// DatabaseName is the database this package's handles bind to.
func DatabaseName() string { return config.MongoDatabase() }

const (
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

	CollectionPlanners           = "planners"
	CollectionPlannerMemberships = "planner_memberships"
	CollectionPlannerSettings    = "planner_settings"
)

// SchemaMaintainedCollections lists every collection whose documents carry a schemaVersion and are
// upgraded by the maintenance batch.
func SchemaMaintainedCollections() []string {
	return []string{
		CollectionAccounts,
		CollectionAccountSettings,
		CollectionJobDocuments,
		CollectionJobs,
		CollectionArchivedJobs,
		CollectionJobGroups,
		CollectionPlanners,
		CollectionPlannerMemberships,
		CollectionPlannerSettings,
	}
}

// AccountOwnedCollections hold documents an account owns wherever it is working.
func AccountOwnedCollections() []string {
	return []string{
		CollectionAccounts,
		CollectionAccountSettings,
		CollectionWatchlistDeprecated,
	}
}

// PlannerHeldCollections hold documents that belong to a planner rather than to the account that
// wrote them.
func PlannerHeldCollections() []string {
	return []string{
		CollectionJobs,
		CollectionJobDocuments,
		CollectionJobGroups,
		CollectionPlannerSettings,
	}
}

// CollectionsForOwnerKind returns the collections a connection receives for an owner of this kind:
// the account's own documents for an account, and a planner's for every kind naming a planner.
func CollectionsForOwnerKind(kind models.OwnerKind) []string {
	if kind == models.OwnerAccount {
		return AccountOwnedCollections()
	}
	if kind == "" {
		return nil
	}
	return PlannerHeldCollections()
}
