package archivedjobs

import (
	"context"
	"encoding/json"
	"fmt"

	"eve-industry-planner/core/scheduler/contract"
	mongocore "eve-industry-planner/shared/core/mongo"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
)

const logComponent = "archivedjobs"

// Archived-job pipeline crons use a 15-minute stagger so snapshot fan-out and aggregate rebuilds rarely overlap,
// and account-side vs corp-side alternate "snapshot vs build-stats" roles each quarter-hour:
//   :00 account snapshots (archivedJobs)     | :15 corp dirty rebuild (corp_build_stats queue)
//   :30 corp snapshots (corp_archivedJobs)   | :45 account dirty rebuild (user_build_stats / build_stats queue)
const (
	cronProcessArchivedJobSnapshotsName           = "cron.processArchivedJobSnapshots"
	cronProcessArchivedJobSnapshotsSchedule       = "0 * * * *"
	cronProcessCorpArchivedJobSnapshotsName       = "cron.processCorpArchivedJobSnapshots"
	cronProcessCorpArchivedJobSnapshotsSchedule   = "30 * * * *"
	cronProcessDirtyAccountBuildStatsName         = "cron.processDirtyAccountBuildStats"
	cronProcessDirtyAccountBuildStatsSchedule       = "45 * * * *"
	cronProcessDirtyCorpBuildStatsName            = "cron.processDirtyCorpBuildStats"
	cronProcessDirtyCorpBuildStatsSchedule          = "15 * * * *"
)

// ScheduleArchivedJobsStats schedules snapshot fan-out and dirty-queue rebuilds (alternating account vs corp; spread across the hour).
func ScheduleArchivedJobsStats(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	snapTask := taskscore.ProcessArchivedJobSnapshots
	sched.RegisterHandler(cronProcessArchivedJobSnapshotsName, func(ctx context.Context, data json.RawMessage) error {
		logs.DebugCtx(ctx, "archived job snapshots fan-out starting", "component", logComponent, "subject", snapTask.Subject)
		if err := PublishProcessArchivedJobSnapshotsPerAccount(ctx, deps); err != nil {
			logs.ErrorCtx(ctx, "archived job snapshots fan-out failed", "component", logComponent, "subject", snapTask.Subject, "error", err)
			return err
		}
		return nil
	})
	if err := sched.ScheduleCronJob(cronProcessArchivedJobSnapshotsSchedule, cronProcessArchivedJobSnapshotsName); err != nil {
		return nil, err
	}

	corpDirtyTask := taskscore.ProcessDirtyCorpBuildStats
	sched.RegisterHandler(cronProcessDirtyCorpBuildStatsName, func(ctx context.Context, data json.RawMessage) error {
		logs.DebugCtx(ctx, "dirty corp build stats publish starting", "component", logComponent, "subject", corpDirtyTask.Subject)
		if err := PublishProcessDirtyCorpBuildStats(ctx, deps); err != nil {
			logs.ErrorCtx(ctx, "dirty corp build stats publish failed", "component", logComponent, "subject", corpDirtyTask.Subject, "error", err)
			return err
		}
		return nil
	})
	if err := sched.ScheduleCronJob(cronProcessDirtyCorpBuildStatsSchedule, cronProcessDirtyCorpBuildStatsName); err != nil {
		return nil, err
	}

	corpSnapTask := taskscore.ProcessCorpArchivedJobSnapshots
	sched.RegisterHandler(cronProcessCorpArchivedJobSnapshotsName, func(ctx context.Context, data json.RawMessage) error {
		logs.DebugCtx(ctx, "corp archived job snapshots fan-out starting", "component", logComponent, "subject", corpSnapTask.Subject)
		if err := PublishProcessCorpArchivedJobSnapshotsPerCorpRef(ctx, deps); err != nil {
			logs.ErrorCtx(ctx, "corp archived job snapshots fan-out failed", "component", logComponent, "subject", corpSnapTask.Subject, "error", err)
			return err
		}
		return nil
	})
	if err := sched.ScheduleCronJob(cronProcessCorpArchivedJobSnapshotsSchedule, cronProcessCorpArchivedJobSnapshotsName); err != nil {
		return nil, err
	}

	acctDirtyTask := taskscore.ProcessDirtyAccountBuildStats
	sched.RegisterHandler(cronProcessDirtyAccountBuildStatsName, func(ctx context.Context, data json.RawMessage) error {
		logs.DebugCtx(ctx, "dirty account build stats publish starting", "component", logComponent, "subject", acctDirtyTask.Subject)
		if err := PublishProcessDirtyAccountBuildStats(ctx, deps); err != nil {
			logs.ErrorCtx(ctx, "dirty account build stats publish failed", "component", logComponent, "subject", acctDirtyTask.Subject, "error", err)
			return err
		}
		return nil
	})
	if err := sched.ScheduleCronJob(cronProcessDirtyAccountBuildStatsSchedule, cronProcessDirtyAccountBuildStatsName); err != nil {
		return nil, err
	}
	return func() {}, nil
}

// PublishProcessArchivedJobSnapshotsPerAccount publishes one snapshot task per account that has unprocessed archivedJobs rows.
func PublishProcessArchivedJobSnapshotsPerAccount(ctx context.Context, deps contract.Dependencies) error {
	if deps.Mongo == nil {
		return fmt.Errorf("mongo client is required for archived job snapshots fan-out")
	}
	unprocessedAccounts, err := mongocore.DistinctUnprocessedArchivedAccountIDs(ctx, deps.Mongo)
	if err != nil {
		return fmt.Errorf("distinct unprocessed archived accounts: %w", err)
	}
	if len(unprocessedAccounts) == 0 {
		logs.DebugCtx(ctx, "archived job snapshots fan-out: no accounts with unprocessed jobs", "component", logComponent)
		return nil
	}
	task := taskscore.ProcessArchivedJobSnapshots
	return publishFanOutTasks(ctx, deps, task, unprocessedAccounts, "archived job snapshots fan-out", func(accountID string) error {
		req := natscore.ProcessArchivedJobSnapshotsRequest{AccountID: accountID}
		return natscore.PublishTask(ctx, deps.JSContext, task.Subject, task.Name, req, deps.NATS)
	})
}

// PublishProcessCorpArchivedJobSnapshotsPerCorpRef publishes one snapshot task per corp ref that has unprocessed corp_archivedJobs rows.
func PublishProcessCorpArchivedJobSnapshotsPerCorpRef(ctx context.Context, deps contract.Dependencies) error {
	if deps.Mongo == nil {
		return fmt.Errorf("mongo client is required for corp archived job snapshots fan-out")
	}
	corpRefs, err := mongocore.DistinctUnprocessedCorpArchivedCorpRefs(ctx, deps.Mongo)
	if err != nil {
		return fmt.Errorf("distinct unprocessed corp archived corp refs: %w", err)
	}
	if len(corpRefs) == 0 {
		logs.DebugCtx(ctx, "corp archived job snapshots fan-out: no corp refs with unprocessed jobs", "component", logComponent)
		return nil
	}
	task := taskscore.ProcessCorpArchivedJobSnapshots
	return publishFanOutTasks(ctx, deps, task, corpRefs, "corp archived job snapshots fan-out", func(corpRef string) error {
		req := natscore.ProcessCorpArchivedJobSnapshotsRequest{CorpRef: corpRef}
		return natscore.PublishTask(ctx, deps.JSContext, task.Subject, task.Name, req, deps.NATS)
	})
}

func PublishProcessDirtyAccountBuildStats(ctx context.Context, deps contract.Dependencies) error {
	if deps.Mongo == nil {
		return fmt.Errorf("mongo client is required for dirty account build stats fan-out")
	}
	accountIDs, err := mongocore.ListAllDirtyAccountIDs(ctx, deps.Mongo)
	if err != nil {
		return fmt.Errorf("list dirty account ids: %w", err)
	}
	if len(accountIDs) == 0 {
		logs.DebugCtx(ctx, "dirty account build stats fan-out: no queued accounts", "component", logComponent)
		return nil
	}
	task := taskscore.ProcessDirtyAccountBuildStats
	return publishFanOutTasks(ctx, deps, task, accountIDs, "dirty account build stats fan-out", func(accountID string) error {
		req := natscore.ProcessDirtyAccountBuildStatsRequest{AccountID: accountID}
		return natscore.PublishTask(ctx, deps.JSContext, task.Subject, task.Name, req, deps.NATS)
	})
}

func PublishProcessDirtyCorpBuildStats(ctx context.Context, deps contract.Dependencies) error {
	if deps.Mongo == nil {
		return fmt.Errorf("mongo client is required for dirty corp build stats fan-out")
	}
	corpRefs, err := mongocore.ListAllDirtyCorpRefs(ctx, deps.Mongo)
	if err != nil {
		return fmt.Errorf("list dirty corp refs: %w", err)
	}
	if len(corpRefs) == 0 {
		logs.DebugCtx(ctx, "dirty corp build stats fan-out: no queued corp refs", "component", logComponent)
		return nil
	}
	task := taskscore.ProcessDirtyCorpBuildStats
	return publishFanOutTasks(ctx, deps, task, corpRefs, "dirty corp build stats fan-out", func(corpRef string) error {
		req := natscore.ProcessDirtyCorpBuildStatsRequest{CorpRef: corpRef}
		return natscore.PublishTask(ctx, deps.JSContext, task.Subject, task.Name, req, deps.NATS)
	})
}
