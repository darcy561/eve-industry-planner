package maintenance

import (
	"context"
	"time"

	"eve-industry-planner/api/helper/auth"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"eve-industry-planner/shared/logs"

	"github.com/hibiken/asynq"
)

// PruneExpiredAccountSessions runs auth session maintenance: prune expired rows in
// account_sessions, remove orphan session_index keys, and revoke refresh_token rows
// whose session_id is missing from account_sessions.
func PruneExpiredAccountSessions(ctx context.Context, _ *asynq.Task, deps *esitasks.TaskDependencies) error {
	if deps == nil || deps.Redis == nil {
		return nil
	}
	opts := auth.SessionCleanupOptionsFromEnv()
	stats, err := auth.RunAuthSessionMaintenance(ctx, deps.Redis, opts)
	if err != nil {
		return err
	}
	logs.InfoCtx(ctx, "prune expired account sessions task finished",
		"dry_run", stats.DryRun,
		"accounts_scanned", stats.AccountsScanned,
		"orphan_session_indexes", stats.OrphanSessionIndexesFound,
		"orphan_session_indexes_removed", stats.OrphanSessionIndexesRemoved,
		"orphan_refresh_tokens", stats.OrphanRefreshTokensFound,
		"orphan_refresh_tokens_removed", stats.OrphanRefreshTokensRemoved,
	)
	// Small delay to avoid hammering Redis during tight scheduler loops.
	time.Sleep(100 * time.Millisecond)
	return nil
}
