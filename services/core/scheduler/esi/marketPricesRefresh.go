package esi

import (
	"context"
	"encoding/json"
	"math"
	"time"

	"eve-industry-planner/core/scheduler/contract"
	esicore "eve-industry-planner/shared/core/esi"
	natscore "eve-industry-planner/shared/core/nats"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	redislib "github.com/redis/go-redis/v9"
)

const (
	cronMarketPricesRefreshName     = "cron.marketPricesRefresh"
	cronMarketPricesRefreshSchedule = "*/5 * * * *"
	microBatchInterval              = 15 * time.Second
	microBatchPublishWindow         = 4*time.Minute + 15*time.Second
)

// ScheduleMarketPricesRefresh sets up a cron job for market prices refresh (every 5 minutes).
// It uses a cached total item count (recalculated every 4 hours) to determine batch sizes,
// ensuring all items are refreshed within 4 hours. The batch size is calculated as:
// batchSize = (totalItems / 48) * buffer, where 48 is the number of runs in 4 hours.
// Running more frequently with smaller batches reduces Redis CPU spikes from thundering herd.
// This approach is simpler and more predictable than counting outdated items each run.
// Returns a cleanup function and an error if scheduling fails.
func ScheduleMarketPricesRefresh(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	jsContext := deps.JSContext
	natsConn := deps.NATS
	redisClient := deps.Redis

	task := taskscore.RefreshMarketPrices
	sched.RegisterHandler(cronMarketPricesRefreshName, func(ctx context.Context, data json.RawMessage) error {
		return runMarketPricesRefresh(ctx, jsContext, natsConn, redisClient, task)
	})
	if err := sched.ScheduleCronJob(cronMarketPricesRefreshSchedule, cronMarketPricesRefreshName); err != nil {
		return nil, err
	}
	return func() {}, nil
}

func runMarketPricesRefresh(
	ctx context.Context,
	jsContext jetstream.JetStream,
	natsConn *natslib.Conn,
	redisClient *redislib.Client,
	task taskscore.Task,
) error {
	// Build a map of region_id -> station_id for quick lookup
	regionToStation := make(map[int32]int64)
	for _, location := range esicore.DefaultMarketLocations {
		regionToStation[location.RegionID] = location.StationID
	}

	// Get cached total item count (recalculated every 4 hours)
	// Note: GetCachedTotalMarketOrdersCount returns (0, nil) when cache is missing (not an error)
	// We need to check if the cache key exists to distinguish "cache miss" from "cached value is 0"
	totalItems, err := rediscore.GetCachedTotalMarketOrdersCount(ctx, redisClient)
	if err != nil {
		logs.WarnCtx(ctx, "failed to get cached total count, recalculating", "component", schedulerLogComponent, "error", err)
		// Recalculate on the fly if there was an error getting the cache
		totalItems, err = rediscore.CountTotalMarketOrdersRefreshTimes(ctx, redisClient)
		if err != nil {
			logs.ErrorCtx(ctx, "failed to count total market orders refresh times", "component", schedulerLogComponent, "error", err)
			return err
		}
		// Cache it for next time
		ttl := 4*time.Hour + 30*time.Minute
		if err := rediscore.SetCachedTotalMarketOrdersCount(ctx, redisClient, totalItems, ttl); err != nil {
			logs.WarnCtx(ctx, "failed to cache total count", "component", schedulerLogComponent, "error", err)
		}
	} else {
		// Check if cache key exists to distinguish cache miss (returns 0) from actual 0 value
		// If key doesn't exist, it's a cache miss and we should recalculate
		cacheExists, err := rediscore.CachedTotalMarketOrdersCountExists(ctx, redisClient)
		if err != nil {
			logs.WarnCtx(ctx, "failed to check if cache key exists, assuming cache miss", "component", schedulerLogComponent, "error", err)
			// Treat as cache miss and recalculate
			totalItems, err = rediscore.CountTotalMarketOrdersRefreshTimes(ctx, redisClient)
			if err != nil {
				logs.ErrorCtx(ctx, "failed to count total market orders refresh times", "component", schedulerLogComponent, "error", err)
				return err
			}
			ttl := 4*time.Hour + 30*time.Minute
			if err := rediscore.SetCachedTotalMarketOrdersCount(ctx, redisClient, totalItems, ttl); err != nil {
				logs.WarnCtx(ctx, "failed to cache total count", "component", schedulerLogComponent, "error", err)
			}
		} else if !cacheExists && totalItems == 0 {
			// Cache key doesn't exist and we got 0 - this is a cache miss
			logs.DebugCtx(ctx, "cache key missing, recalculating total count", "component", schedulerLogComponent)
			totalItems, err = rediscore.CountTotalMarketOrdersRefreshTimes(ctx, redisClient)
			if err != nil {
				logs.ErrorCtx(ctx, "failed to count total market orders refresh times", "component", schedulerLogComponent, "error", err)
				return err
			}
			// Cache it for next time
			ttl := 4*time.Hour + 30*time.Minute
			if err := rediscore.SetCachedTotalMarketOrdersCount(ctx, redisClient, totalItems, ttl); err != nil {
				logs.WarnCtx(ctx, "failed to cache total count", "component", schedulerLogComponent, "error", err)
			}
			if totalItems > 0 {
				logs.InfoCtx(ctx, "recalculated total count after cache miss", "component", schedulerLogComponent, "total_items", totalItems)
			}
		}
		// If cacheExists is true, the cache key exists, so totalItems is the actual cached value (even if 0)
	}

	// Calculate time threshold for outdated items
	now := time.Now()
	thresholdTime := now.Add(-4 * time.Hour).UnixMilli()

	// Calculate batch size based on total items
	// Runs every 5 minutes = 48 runs in 4 hours
	// We want to process all items within 4 hours, so divide total by number of runs
	// More frequent runs with smaller batches reduce Redis CPU spikes
	runsPer4Hours := computeRunsPer4Hours(now, false)
	const maxBatchSize = 1000
	const bufferMultiplier = 1.15 // 15% buffer to account for growth and ensure we stay ahead
	const estimatedTokensPerRequest = 2.0
	const tokenReserveRatio = 0.1 // Keep 10% token headroom to avoid edge-of-window exhaustion

	// Calculate target batch size: totalItems / runsPer4Hours with buffer
	// This ensures all items are processed within the 4-hour window
	targetBatchSize := float64(totalItems) / runsPer4Hours * bufferMultiplier

	// Dynamic minimum batch size: ensure we process at least enough to clear all items
	minBatchSizeNeeded := float64(totalItems) / runsPer4Hours
	// Add 10% buffer and ensure minimum floor of 10 items
	dynamicMinBatchSize := max(10, int(math.Ceil(minBatchSizeNeeded*1.1)))

	// API rate limit constraints
	// API allows 3 requests/second = 180 requests/minute = 10,800 requests/hour = 43,200 requests in 4 hours
	const apiRequestsPer4Hours = 43200.0
	// Average pages per item (conservative estimate - actual varies by item popularity)
	// Using 1.5 as a safe average, but some items may have 1 page, others 5+
	const avgPagesPerItem = 1.5
	// Maximum items we can process per 4 hours based on API limit
	maxItemsByAPILimit := int(apiRequestsPer4Hours / avgPagesPerItem)
	// Maximum items per run based on API limit
	maxItemsPerRunByAPI := int(float64(maxItemsByAPILimit) / runsPer4Hours)

	// Clamp between min and max, but also respect API rate limit
	batchSize := max(int(math.Ceil(targetBatchSize)), dynamicMinBatchSize)
	// Apply API limit constraint (more restrictive than maxBatchSize)
	if batchSize > maxItemsPerRunByAPI {
		batchSize = maxItemsPerRunByAPI
		logs.DebugCtx(ctx, "batch size limited by API rate limit",
			"component", schedulerLogComponent,
			"calculated_batch_size", int(math.Ceil(targetBatchSize)),
			"api_limited_batch_size", batchSize,
			"max_items_per_run_by_api", maxItemsPerRunByAPI,
			"avg_pages_per_item", avgPagesPerItem)
	}
	// Also respect the absolute max
	if batchSize > maxBatchSize {
		batchSize = maxBatchSize
	}

	// Apply dynamic cap based on currently available market-order-group tokens.
	// This prevents publishing more work than the current 15-minute floating window can safely absorb.
	tokenLimitedBatchSize := -1
	marketTokenLimit, err := rediscore.GetMarketOrderTokenLimit(ctx, redisClient)
	if err != nil {
		logs.WarnCtx(ctx, "failed to read market-order token limit, skipping token-aware batch cap", "component", schedulerLogComponent, "error", err)
	} else if marketTokenLimit > 0 {
		marketTokensUsed, err := rediscore.GetMarketOrderTokensUsed(ctx, redisClient)
		if err != nil {
			logs.WarnCtx(ctx, "failed to read market-order tokens used, skipping token-aware batch cap", "component", schedulerLogComponent, "error", err)
		} else {
			availableTokens := float64(marketTokenLimit) - marketTokensUsed
			if availableTokens < 0 {
				availableTokens = 0
			}

			tokenReserve := float64(marketTokenLimit) * tokenReserveRatio
			effectiveTokens := availableTokens - tokenReserve
			if effectiveTokens < 0 {
				effectiveTokens = 0
			}

			tokenLimitedBatchSize = int(math.Floor(effectiveTokens / estimatedTokensPerRequest))
			if tokenLimitedBatchSize < 1 {
				tokenLimitedBatchSize = 1
			}

			if batchSize > tokenLimitedBatchSize {
				logs.DebugCtx(ctx, "batch size limited by current market-order token availability",
					"component", schedulerLogComponent,
					"calculated_batch_size", batchSize,
					"token_limited_batch_size", tokenLimitedBatchSize,
					"market_order_token_limit", marketTokenLimit,
					"market_order_tokens_used", marketTokensUsed,
					"estimated_tokens_per_request", estimatedTokensPerRequest,
					"token_reserve_ratio", tokenReserveRatio)
				batchSize = tokenLimitedBatchSize
			}
		}
	}

	// During downtime, only publish what fits inside this run's existing publish window.
	// This prevents stacked downtime runs from releasing a large burst immediately after DT.
	inDowntime, downtimeEnd := isInEVEDowntime(now)
	if inDowntime {
		windowEnd := now.Add(microBatchPublishWindow)
		availableAfterDowntime := windowEnd.Sub(downtimeEnd)
		if availableAfterDowntime < 0 {
			availableAfterDowntime = 0
		}

		downtimeBatchCap := int(math.Floor(float64(batchSize) * availableAfterDowntime.Seconds() / microBatchPublishWindow.Seconds()))
		if downtimeBatchCap < batchSize {
			logs.InfoCtx(ctx, "market prices batch size reduced by downtime window",
				"component", schedulerLogComponent,
				"original_batch_size", batchSize,
				"downtime_capped_batch_size", downtimeBatchCap,
				"available_after_downtime_seconds", int(availableAfterDowntime.Seconds()),
				"publish_window_seconds", int(microBatchPublishWindow.Seconds()),
				"downtime_end_utc", downtimeEnd.Format(time.RFC3339))
			batchSize = downtimeBatchCap
		}
	}

	if batchSize <= 0 {
		logs.InfoCtx(ctx, "market prices refresh triggered with zero publish capacity in current window",
			"component", schedulerLogComponent,
			"outdated_entries_found", 0,
			"published_messages", 0,
			"batch_size", batchSize)
		return nil
	}

	logs.DebugCtx(ctx, "calculated batch size",
		"component", schedulerLogComponent,
		"total_items", totalItems,
		"target_batch_size", int(math.Ceil(targetBatchSize)),
		"final_batch_size", batchSize,
		"dynamic_min_batch_size", dynamicMinBatchSize,
		"max_items_per_run_by_api", maxItemsPerRunByAPI,
		"token_limited_batch_size", tokenLimitedBatchSize)

	// Fetch outdated items to process (only fetch what we need for this batch)
	// Fetch items older than 4 hours, up to batch size
	// Use a small buffer to account for invalid entries
	queryLimit := batchSize + 100 // Small buffer for invalid entries
	refreshTimes, err := rediscore.GetMarketOrdersRefreshTimesByScoreRange(ctx, redisClient, 0, float64(thresholdTime), queryLimit)
	if err != nil {
		logs.ErrorCtx(ctx, "failed to get market orders refresh times by score range, falling back to oldest", "component", schedulerLogComponent, "error", err)
		// Fallback to original method if score range query fails
		refreshTimes, err = rediscore.GetOldestMarketOrdersRefreshTimes(ctx, redisClient, queryLimit)
		if err != nil {
			logs.ErrorCtx(ctx, "failed to get oldest market orders refresh times", "component", schedulerLogComponent, "error", err)
			return err
		}
	}

	// Collect publishable requests up to the calculated batch size, then spread
	// publication across the current 5-minute window to reduce queue spikes.
	requestsToPublish := make([]natscore.MarketPricesRequest, 0, batchSize)
	var outdatedCount int
	for _, refreshTime := range refreshTimes {
		// Skip entries with invalid (zero) type_id or location_id
		if refreshTime.TypeID == 0 || refreshTime.LocationID == 0 {
			continue
		}

		// Skip if updated within the last 4 hours
		if refreshTime.LastUpdated >= thresholdTime {
			continue
		}

		// Count outdated items for logging
		outdatedCount++

		// Only collect if we haven't reached the batch size limit
		if len(requestsToPublish) >= batchSize {
			continue
		}

		// Find station_id for this region_id
		stationID, exists := regionToStation[refreshTime.LocationID]
		if !exists {
			logs.DebugCtx(ctx, "no station mapping found for region", "component", schedulerLogComponent, "region_id", refreshTime.LocationID, "type_id", refreshTime.TypeID)
			continue
		}

		requestsToPublish = append(requestsToPublish, natscore.MarketPricesRequest{
			TypeID:     refreshTime.TypeID,
			LocationID: refreshTime.LocationID,
			StationID:  stationID,
		})
	}

	var publishedCount int
	microBatchStarted := false
	microBatchCompleted := false
	var microBatchSlices int
	var microBatchRequestsPerSlice int
	if len(requestsToPublish) > 0 {
		plannedSlices := int(microBatchPublishWindow / microBatchInterval)
		if plannedSlices < 1 {
			plannedSlices = 1
		}
		if len(requestsToPublish) < plannedSlices {
			plannedSlices = len(requestsToPublish)
		}
		requestsPerSlice := int(math.Ceil(float64(len(requestsToPublish)) / float64(plannedSlices)))

		microBatchStarted = true
		microBatchSlices = plannedSlices
		microBatchRequestsPerSlice = requestsPerSlice

		logs.InfoCtx(ctx, "market prices micro-batch publishing started",
			"component", schedulerLogComponent,
			"publishable_requests", len(requestsToPublish),
			"planned_slices", plannedSlices,
			"requests_per_slice", requestsPerSlice,
			"slice_interval_seconds", int(microBatchInterval.Seconds()),
			"publish_window_seconds", int(microBatchPublishWindow.Seconds()))

		for start := 0; start < len(requestsToPublish); start += requestsPerSlice {
			end := min(start+requestsPerSlice, len(requestsToPublish))
			for _, request := range requestsToPublish[start:end] {
				if err := natscore.PublishTask(ctx, jsContext, task.Subject, task.Name, request, natsConn); err != nil {
					logs.WarnCtx(ctx, "failed to publish market prices refresh message",
						"component", schedulerLogComponent,
						"type_id", request.TypeID,
						"location_id", request.LocationID,
						"station_id", request.StationID,
						"error", err)
					continue
				}
				publishedCount++
			}

			if end >= len(requestsToPublish) {
				break
			}

			timer := time.NewTimer(microBatchInterval)
			select {
			case <-ctx.Done():
				timer.Stop()
				logs.WarnCtx(ctx, "market prices micro-batch publishing stopped early", "component", schedulerLogComponent, "published_messages", publishedCount, "remaining_messages", len(requestsToPublish)-end, "error", ctx.Err())
				return ctx.Err()
			case <-timer.C:
			}
		}

		microBatchCompleted = true
		logs.InfoCtx(ctx, "market prices micro-batch publishing completed",
			"component", schedulerLogComponent,
			"publishable_requests", len(requestsToPublish),
			"published_messages", publishedCount,
			"planned_slices", microBatchSlices,
			"requests_per_slice", microBatchRequestsPerSlice,
			"slice_interval_seconds", int(microBatchInterval.Seconds()),
			"publish_window_seconds", int(microBatchPublishWindow.Seconds()))
	}

	remainingOutdated := outdatedCount - publishedCount

	// Only calculate detailed backlog analysis if there's a significant backlog
	// Most of the time this won't be needed, saving computation
	maxItemsProcessablePer4Hours := batchSize * int(runsPer4Hours)
	hasSignificantBacklog := remainingOutdated > 0 || float64(outdatedCount) > float64(maxItemsProcessablePer4Hours)

	if hasSignificantBacklog {
		// Calculate detailed backlog metrics only when needed
		estimatedHoursToClearBacklog := 0.0
		if remainingOutdated > 0 {
			// Calculate how many runs it would take to clear the remaining backlog
			runsNeeded := float64(remainingOutdated) / float64(batchSize)
			estimatedHoursToClearBacklog = runsNeeded * (5.0 / 60.0) // 5 minutes per run
		}

		// Check if we can keep up: can we process all currently outdated items within 4 hours?
		canKeepUp := float64(outdatedCount) <= float64(maxItemsProcessablePer4Hours)

		// Log warning if we can't keep up with the backlog
		// Note: Since API rate limit (3 req/sec) is the bottleneck, adding workers won't help.
		// Messages must persist in NATS queue until they can be processed. Current stream MaxAge
		// is 24 hours, which should handle backlogs up to ~388k items at API rate limit.
		if !canKeepUp || estimatedHoursToClearBacklog > 4.0 {
			// Calculate if messages might expire before processing (only when warning is needed)
			// API capacity: 3 req/sec * 1.5 pages = 4.5 items/sec = 388,800 items/day
			// NATS stream MaxAge: 24 hours
			estimatedDaysToClearBacklog := estimatedHoursToClearBacklog / 24.0
			messagesMayExpire := estimatedDaysToClearBacklog > 1.0

			logs.WarnCtx(ctx, "market prices refresh backlog exceeds capacity",
				"component", schedulerLogComponent,
				"outdated_entries_found", outdatedCount,
				"published_messages", publishedCount,
				"remaining_outdated", remainingOutdated,
				"max_items_processable_per_4h", maxItemsProcessablePer4Hours,
				"estimated_hours_to_clear_backlog", math.Round(estimatedHoursToClearBacklog*100)/100,
				"estimated_days_to_clear_backlog", math.Round(estimatedDaysToClearBacklog*100)/100,
				"can_keep_up", canKeepUp,
				"batch_size", batchSize,
				"runs_per_4_hours", runsPer4Hours,
				"api_rate_limit_bottleneck", "3 req/sec limits throughput, workers won't help",
				"nats_message_expiration_risk", messagesMayExpire,
				"nats_stream_max_age_hours", 24,
				"backlog_growth_rate", "items will continue to age if capacity is insufficient")
		} else {
			// Log info with basic stats when backlog exists but is manageable
			logs.InfoCtx(ctx, "market prices refresh triggered",
				"component", schedulerLogComponent,
				"outdated_entries_found", outdatedCount,
				"published_messages", publishedCount,
				"remaining_outdated", remainingOutdated,
				"checked_entries", len(refreshTimes),
				"batch_size", batchSize,
				"micro_batch_started", microBatchStarted,
				"micro_batch_completed", microBatchCompleted)
		}
	} else {
		// Normal operation - no backlog, minimal logging
		logs.InfoCtx(ctx, "market prices refresh triggered",
			"component", schedulerLogComponent,
			"outdated_entries_found", outdatedCount,
			"published_messages", publishedCount,
			"checked_entries", len(refreshTimes),
			"batch_size", batchSize,
			"micro_batch_started", microBatchStarted,
			"micro_batch_completed", microBatchCompleted)
	}

	return nil
}
