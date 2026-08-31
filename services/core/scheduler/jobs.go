package scheduler

import (
	"eve-industry-planner/core/scheduler/archivedjobs"
	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/core/scheduler/esi"
	"eve-industry-planner/core/scheduler/maintenance"
	"eve-industry-planner/core/scheduler/sde"
)

// Job is one recurring job: the name it is known by, when it runs, and what it
// runs. The name is also the id a schedule uses to defer a run, so the handler
// is built with it rather than holding its own copy.
type Job struct {
	Name  string
	Expr  string
	Build func(deps contract.Dependencies, jobName string) contract.TaskHandler
}

// jobs is when this service acts. Every recurring job core runs is declared
// here and nowhere else. Expressions are UTC.
var jobs = []Job{
	{"cron.industrySystemsRefresh", "50 * * * *", esi.IndustrySystemsRefresh},
	{"cron.adjustedPricesRefresh", "20 * * * *", esi.AdjustedPricesRefresh},
	{"cron.regionMarketOrdersRefresh", "*/15 * * * *", esi.RegionMarketOrdersRefresh},
	{"cron.checkSDEUpdates", "0 17 * * *", sde.CheckSDEUpdates},
	{"cron.drainAccountStatsRebuildQueue", "*/2 * * * *", archivedjobs.DrainAccountStatsRebuildQueue},
	{"cron.schemaVersionMaintenance", "0 * * * *", maintenance.SchemaVersionMaintenance},
	{"cron.inactiveAccountPlannerCleanup", "0 8 * * 1", maintenance.InactiveAccountPlannerCleanup},
	{"cron.cloudStoredEsiRefreshMaintenance", "*/10 * * * *", maintenance.CloudStoredEsiRefreshMaintenance},
	{"cron.pruneExpiredAccountSessions", "0 */4 * * *", maintenance.PruneExpiredAccountSessions},
}
