package esi

import (
	"context"
	"fmt"
	"time"

	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
)

// HandleStreamError logs a failed ESI pass and returns the error so asynq
// retries. A rate-limit refusal carries when to come back, so it is logged as
// timing rather than as a fault.
func HandleStreamError(ctx context.Context, err error, taskName string) error {
	if err == nil {
		return nil
	}

	if limit, ok := esiclient.AsRateLimit(err); ok {
		logs.DebugCtx(ctx, "ESI refusal, deferring",
			"kind", limit.Kind,
			"retry_in", limit.RetryIn(),
			"reason", limit.Reason,
			"bucket", limit.Bucket,
			"task", taskName)
		return err
	}

	logs.ErrorCtx(ctx, "failed streaming ESI data",
		"error", err,
		"error_type", fmt.Sprintf("%T", err),
		"reason", "stream_error",
		"task", taskName)
	return err
}

// recordNextRefresh stores when ESI says a dataset stops being current, so the
// scheduler publishes the next refresh then rather than on a fixed cycle.
//
// A missing max-age leaves the previous answer in place: the endpoint has
// stopped saying, and a guess would be worse than the last thing it said. A
// failure to record is logged and not returned — the data was fetched and
// stored, and the cron cycle is still there as a backstop.
func recordNextRefresh(ctx context.Context, client *redis.Client, dataset string, maxAge time.Duration) {
	if maxAge <= 0 {
		return
	}
	at := time.Now().Add(maxAge)
	if err := rediscore.SaveNextRefresh(ctx, client, dataset, at); err != nil {
		logs.WarnCtx(ctx, "failed recording next refresh time",
			"dataset", dataset, "next_refresh_utc", at.UTC().Format(time.RFC3339), "error", err)
	}
}
