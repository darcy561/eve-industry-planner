package auth

import (
	"context"
	"errors"
	"os"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
)

const defaultSessionCleanupScanCount = 200

// SessionCleanupOptions configures orphan/session maintenance sweeps.
type SessionCleanupOptions struct {
	// DryRun increments stats only; no Redis deletes.
	DryRun bool
	// ScanCount is the COUNT hint per SCAN iteration (default 200).
	ScanCount int64
}

// SessionCleanupStats summarizes one maintenance pass.
type SessionCleanupStats struct {
	AccountsScanned             int
	OrphanSessionIndexesFound   int
	OrphanSessionIndexesRemoved int
	OrphanRefreshTokensFound    int
	OrphanRefreshTokensRemoved  int
	DryRun                      bool
}

// SessionCleanupOptionsFromEnv reads AUTH_SESSION_CLEANUP_DRY_RUN (true/1/yes).
func SessionCleanupOptionsFromEnv() SessionCleanupOptions {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("AUTH_SESSION_CLEANUP_DRY_RUN")))
	return SessionCleanupOptions{
		DryRun: v == "true" || v == "1" || v == "yes",
	}
}

func sessionCleanupScanCount(opts SessionCleanupOptions) int64 {
	if opts.ScanCount > 0 {
		return opts.ScanCount
	}
	return defaultSessionCleanupScanCount
}

// PruneAllAccountSessionsRecords scans account_sessions:* and loads each record so
// expired session rows and their session_index keys are pruned (existing API behaviour).
func PruneAllAccountSessionsRecords(ctx context.Context, redisClient *redis.Client) (int, error) {
	if redisClient == nil {
		return 0, nil
	}
	var scanned int
	cursor := uint64(0)
	for {
		keys, next, err := redisClient.Scan(ctx, cursor, AccountSessionsKeyPrefix+"*", sessionCleanupScanCount(SessionCleanupOptions{})).Result()
		if err != nil {
			return scanned, err
		}
		for _, key := range keys {
			accountID := strings.TrimPrefix(key, AccountSessionsKeyPrefix)
			if strings.TrimSpace(accountID) == "" {
				continue
			}
			if _, err := GetAccountSessionsRecord(ctx, redisClient, accountID); err != nil {
				logs.WarnCtx(ctx, "auth session prune: load account_sessions failed",
					"account_id", accountID, "error", err)
				continue
			}
			scanned++
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return scanned, nil
}

// CleanupOrphanSessionIndexes removes session_index:* entries with no matching account_sessions row.
func CleanupOrphanSessionIndexes(ctx context.Context, redisClient *redis.Client, opts SessionCleanupOptions) (int, error) {
	if redisClient == nil {
		return 0, nil
	}
	var found int
	cursor := uint64(0)
	prefix := SessionIndexKeyPrefix
	for {
		keys, next, err := redisClient.Scan(ctx, cursor, prefix+"*", sessionCleanupScanCount(opts)).Result()
		if err != nil {
			return found, err
		}
		for _, key := range keys {
			sessionID := strings.TrimSpace(strings.TrimPrefix(key, prefix))
			if sessionID == "" {
				continue
			}
			if _, err := loadAccountSessionRow(ctx, redisClient, sessionID); err == nil {
				continue
			}
			found++
			if opts.DryRun {
				continue
			}
			deleteSessionIndexKeys(ctx, redisClient, sessionID)
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return found, nil
}

// CleanupOrphanRefreshTokens removes refresh_token:* rows whose session_id is not present under account_sessions.
func CleanupOrphanRefreshTokens(ctx context.Context, redisClient *redis.Client, opts SessionCleanupOptions) (int, error) {
	if redisClient == nil {
		return 0, nil
	}
	var found int
	cursor := uint64(0)
	prefix := RefreshTokenKeyPrefix
	for {
		keys, next, err := redisClient.Scan(ctx, cursor, prefix+"*", sessionCleanupScanCount(opts)).Result()
		if err != nil {
			return found, err
		}
		for _, key := range keys {
			token := strings.TrimSpace(strings.TrimPrefix(key, prefix))
			if token == "" {
				continue
			}
			data, err := GetRefreshTokenData(ctx, redisClient, token)
			if err != nil {
				if errors.Is(err, ErrRefreshTokenNotFound) {
					continue
				}
				logs.WarnCtx(ctx, "auth session cleanup: load refresh_token failed", "error", err)
				continue
			}
			sid := strings.TrimSpace(data.SessionID)
			if sid == "" {
				continue
			}
			if err := VerifyAccountSessionPersisted(ctx, redisClient, data.AccountID, sid); err == nil {
				continue
			}
			found++
			if opts.DryRun {
				continue
			}
			RevokeRefreshTokenBestEffort(ctx, redisClient, token)
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return found, nil
}

// RunAuthSessionMaintenance runs account_sessions prune plus orphan index/refresh_token cleanup.
func RunAuthSessionMaintenance(ctx context.Context, redisClient *redis.Client, opts SessionCleanupOptions) (SessionCleanupStats, error) {
	stats := SessionCleanupStats{DryRun: opts.DryRun}
	if redisClient == nil {
		return stats, nil
	}
	scanned, err := PruneAllAccountSessionsRecords(ctx, redisClient)
	stats.AccountsScanned = scanned
	if err != nil {
		return stats, err
	}
	indexFound, err := CleanupOrphanSessionIndexes(ctx, redisClient, opts)
	stats.OrphanSessionIndexesFound = indexFound
	if opts.DryRun {
		stats.OrphanSessionIndexesRemoved = 0
	} else {
		stats.OrphanSessionIndexesRemoved = indexFound
	}
	if err != nil {
		return stats, err
	}
	refreshFound, err := CleanupOrphanRefreshTokens(ctx, redisClient, opts)
	stats.OrphanRefreshTokensFound = refreshFound
	if opts.DryRun {
		stats.OrphanRefreshTokensRemoved = 0
	} else {
		stats.OrphanRefreshTokensRemoved = refreshFound
	}
	if err != nil {
		return stats, err
	}
	return stats, nil
}

// RunAuthSessionMaintenanceLoop runs maintenance on start and every interval until ctx is cancelled.
func RunAuthSessionMaintenanceLoop(ctx context.Context, redisClient *redis.Client, interval time.Duration, opts SessionCleanupOptions) error {
	if interval <= 0 {
		interval = time.Hour
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		stats, err := RunAuthSessionMaintenance(ctx, redisClient, opts)
		if err != nil && ctx.Err() == nil {
			logs.WarnCtx(ctx, "auth session maintenance pass failed", "error", err, "dry_run", opts.DryRun)
		} else {
			logs.InfoCtx(ctx, "auth session maintenance pass complete",
				"dry_run", stats.DryRun,
				"accounts_scanned", stats.AccountsScanned,
				"orphan_session_indexes", stats.OrphanSessionIndexesFound,
				"orphan_session_indexes_removed", stats.OrphanSessionIndexesRemoved,
				"orphan_refresh_tokens", stats.OrphanRefreshTokensFound,
				"orphan_refresh_tokens_removed", stats.OrphanRefreshTokensRemoved,
			)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}
