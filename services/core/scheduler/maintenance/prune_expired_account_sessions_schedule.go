package maintenance

import (
	"context"
	"encoding/json"
	eipnats "eve-industry-planner/shared/nats"

	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/shared/logs"
)

// SchedulePruneExpiredAccountSessions enqueues a worker task that scans Redis
// account_sessions:* keys, prunes expired sessions, and removes orphan session_index
// and refresh_token rows (see auth.RunAuthSessionMaintenance). Core also runs an
// hourly singleton pass (auth-session-maintenance).
// so expired sessions are removed for inactive accounts as well.
func PruneExpiredAccountSessions(deps contract.Dependencies, jobName string) contract.TaskHandler {
	natsHandle := deps.NATS
	return func(ctx context.Context, data json.RawMessage) error {
		_ = data
		if err := eipnats.TriggerPruneExpiredAccountSessions(ctx, natsHandle); err != nil {
			logs.ErrorCtx(ctx, "prune expired account sessions: publish failed", "component", schedulerLogComponent, "error", err)
			return err
		}
		logs.InfoCtx(ctx, "prune expired account sessions task queued", "component", schedulerLogComponent)
		return nil
	}
}
