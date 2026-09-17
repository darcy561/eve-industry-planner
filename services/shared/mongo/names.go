package mongo

import (
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/models"
)

// Database and collection names for the product Mongo database.

// DatabaseName is the database this package's handles bind to.
//
// It resolves rather than being declared here, so the name is written once: the
// URI the client dials and the database its handles work in cannot disagree.
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
		CollectionPlanners,
		CollectionPlannerMemberships,
		CollectionPlannerSettings,
	}
}

// AccountOwnedCollections hold documents an account owns wherever it is working.
// They stay live whichever planner is active, and their owner is always the
// account itself.
func AccountOwnedCollections() []string {
	return []string{
		CollectionAccounts,
		CollectionAccountSettings,
		CollectionWatchlistDeprecated,
	}
}

// PlannerHeldCollections hold documents that belong to a planner rather than to
// the account that wrote them. A connection receives these for the planner it is
// working in, and a member reaches one by holding a membership row.
//
// A collection added here reaches every planner of every kind: the set follows
// from the owner's kind rather than from anything a client asks for.
func PlannerHeldCollections() []string {
	return []string{
		CollectionJobs,
		CollectionJobDocuments,
		CollectionJobGroups,
		CollectionPlannerSettings,
	}
}

// CollectionsForOwnerKind returns the collections a connection receives for an
// owner of this kind: the account's own documents for the account kind, and the
// planner's for every kind that names a planner.
func CollectionsForOwnerKind(kind models.OwnerKind) []string {
	if kind == models.OwnerAccount {
		return AccountOwnedCollections()
	}
	if kind == "" {
		return nil
	}
	return PlannerHeldCollections()
}
