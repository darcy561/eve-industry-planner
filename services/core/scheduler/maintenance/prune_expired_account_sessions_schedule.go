package maintenance

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	taskscore "eve-industry-planner/shared/tasks"
)

const (
	cronPruneExpiredAccountSessionsName     = "cron.pruneExpiredAccountSessions"
	cronPruneExpiredAccountSessionsSchedule = "0 */4 * * *" // every 4 hours
)

// SchedulePruneExpiredAccountSessions enqueues a worker task that scans Redis
// account_sessions:* keys, prunes expired sessions, and removes orphan session_index
// and refresh_token rows (see auth.RunAuthSessionMaintenance). Core also runs an
// hourly singleton pass (auth-session-maintenance).
// so expired sessions are removed for inactive accounts as well.
func SchedulePruneExpiredAccountSessions(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	natsHandle := deps.NATS
	task := taskscore.PruneExpiredAccountSessions
	sched.RegisterHandler(cronPruneExpiredAccountSessionsName, func(ctx context.Context, data json.RawMessage) error {
		_ = data
		if err := eipnats.PublishEmpty(ctx, natsHandle, task.Subject); err != nil {
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
