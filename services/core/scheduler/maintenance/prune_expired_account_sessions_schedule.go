package maintenance

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/scheduler/contract"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
)

const (
	cronPruneExpiredAccountSessionsName     = "cron.pruneExpiredAccountSessions"
	cronPruneExpiredAccountSessionsSchedule = "0 */4 * * *" // every 4 hours
)

// SchedulePruneExpiredAccountSessions enqueues a worker task that scans Redis
// account_sessions:* keys and runs the same prune-on-load logic as API paths,
// so expired sessions are removed for inactive accounts as well.
func SchedulePruneExpiredAccountSessions(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	jsContext := deps.JSContext
	natsConn := deps.NATS
	task := taskscore.PruneExpiredAccountSessions
	sched.RegisterHandler(cronPruneExpiredAccountSessionsName, func(ctx context.Context, data json.RawMessage) error {
		_ = data
		if err := natscore.PublishEmpty(ctx, jsContext, task.Subject, natsConn); err != nil {
			logs.ErrorCtx(ctx, "prune expired account sessions: publish failed", "component", schedulerLogComponent, "subject", task.Subject, "error", err)
			return err
		}
		logs.InfoCtx(ctx, "prune expired account sessions task queued", "component", schedulerLogComponent, "subject", task.Subject)
		return nil
	})
	if err := sched.ScheduleCronJob(cronPruneExpiredAccountSessionsSchedule, cronPruneExpiredAccountSessionsName); err != nil {
		return nil, err
	}
	return func() {}, nil
}
