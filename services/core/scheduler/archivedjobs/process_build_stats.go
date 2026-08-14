package archivedjobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"eve-industry-planner/core/scheduler/contract"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
)

const logComponent = "archivedjobs"

const (
	cronProcessArchivedBuildStatsName     = "cron.processArchivedBuildStats"
	cronProcessArchivedBuildStatsSchedule = "0 * * * *" // every hour at minute 0 (matches Firebase "every 1 hours")
)

// ScheduleProcessArchivedBuildStats schedules hourly processing of archived jobs into Mongo build_stats.
func ScheduleProcessArchivedBuildStats(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	task := taskscore.ProcessArchivedBuildStats
	sched.RegisterHandler(cronProcessArchivedBuildStatsName, func(ctx context.Context, data json.RawMessage) error {
		logs.DebugCtx(ctx, "archived build stats fan-out starting", "component", logComponent, "subject", task.Subject)
		if err := PublishProcessArchivedBuildStatsPerAccount(ctx, deps); err != nil {
			logs.ErrorCtx(ctx, "archived build stats fan-out failed", "component", logComponent, "subject", task.Subject, "error", err)
			return err
		}
		return nil
	})
	if err := sched.ScheduleCronJob(cronProcessArchivedBuildStatsSchedule, cronProcessArchivedBuildStatsName); err != nil {
		return nil, err
	}
	return func() {}, nil
}

// PublishProcessArchivedBuildStatsPerAccount queries archivedJobs for distinct _meta.accountID values with
// unprocessed documents and publishes one worker task per account.
func PublishProcessArchivedBuildStatsPerAccount(ctx context.Context, deps contract.Dependencies) error {
	if deps.Mongo == nil {
		return fmt.Errorf("mongo client is required for archived build stats fan-out")
	}
	mongo := deps.Mongo
	accounts, err := mongo.DistinctUnprocessedArchivedAccountIDs(ctx)
	if err != nil {
		return fmt.Errorf("distinct unprocessed archived accounts: %w", err)
	}
	if len(accounts) == 0 {
		logs.DebugCtx(ctx, "archived build stats fan-out: no accounts with unprocessed jobs", "component", logComponent)
		return nil
	}

	task := taskscore.ProcessArchivedBuildStats
	var errs []error
	published := 0
	for _, accountID := range accounts {
		req := natscore.ProcessArchivedBuildStatsRequest{AccountID: accountID}
		if err := natscore.PublishTask(ctx, deps.JSContext, task.Subject, task.Name, req, deps.NATS); err != nil {
			logs.ErrorCtx(ctx, "archived build stats fan-out: publish failed", "component", logComponent, "account_id", accountID, "error", err)
			errs = append(errs, err)
			continue
		}
		published++
	}

	logs.InfoCtx(ctx, "archived build stats fan-out complete",
		"component", logComponent,
		"accounts_with_work", len(accounts),
		"tasks_published", published,
		"publish_errors", len(errs),
	)

	if len(errs) > 0 {
		return fmt.Errorf("archived build stats fan-out: %d/%d publishes failed: %w", len(errs), len(accounts), errors.Join(errs...))
	}
	return nil
}
