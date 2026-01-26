package esi

import (
	"context"
	"encoding/json"
	"math"
	"time"

	esicore "eve-industry-planner/shared/core/esi"
	natscore "eve-industry-planner/shared/core/nats"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/scheduler"
	taskscore "eve-industry-planner/shared/tasks"
)

// ScheduleMarketPricesRefresh sets up a static cron job for market prices refresh (every 5 minutes).
// It uses a cached total item count (recalculated every 4 hours) to determine batch sizes,
// ensuring all items are refreshed within 4 hours. The batch size is calculated as:
// batchSize = (totalItems / 48) * buffer, where 48 is the number of runs in 4 hours.
// Running more frequently with smaller batches reduces Redis CPU spikes from thundering herd.
// This approach is simpler and more predictable than counting outdated items each run.
// Returns a cleanup function and an error if scheduling fails.
func ScheduleMarketPricesRefresh(deps scheduler.Dependencies, sched scheduler.Scheduler) (func(), error) {
	jsContext := deps.JSContext
	natsConn := deps.NATS
	redisClient := deps.Redis
	log := deps.Log

		// Register the main task handler (runs every 5 minutes)
	sched.RegisterHandler(taskscore.TaskTypeRefreshMarketPrices, func(ctx context.Context, data json.RawMessage) error {
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
			log.Warn("failed to get cached total count, recalculating", "error", err)
			// Recalculate on the fly if there was an error getting the cache
			totalItems, err = rediscore.CountTotalMarketOrdersRefreshTimes(ctx, redisClient)
			if err != nil {
				log.Error("failed to count total market orders refresh times", "error", err)
				return err
			}
			// Cache it for next time
			ttl := 4*time.Hour + 30*time.Minute
			if err := rediscore.SetCachedTotalMarketOrdersCount(ctx, redisClient, totalItems, ttl); err != nil {
				log.Warn("failed to cache total count", "error", err)
			}
		} else {
			// Check if cache key exists to distinguish cache miss (returns 0) from actual 0 value
			// If key doesn't exist, it's a cache miss and we should recalculate
			cacheExists, err := rediscore.CachedTotalMarketOrdersCountExists(ctx, redisClient)
			if err != nil {
				log.Warn("failed to check if cache key exists, assuming cache miss", "error", err)
				// Treat as cache miss and recalculate
				totalItems, err = rediscore.CountTotalMarketOrdersRefreshTimes(ctx, redisClient)
				if err != nil {
					log.Error("failed to count total market orders refresh times", "error", err)
					return err
				}
				ttl := 4*time.Hour + 30*time.Minute
				if err := rediscore.SetCachedTotalMarketOrdersCount(ctx, redisClient, totalItems, ttl); err != nil {
					log.Warn("failed to cache total count", "error", err)
				}
			} else if !cacheExists && totalItems == 0 {
				// Cache key doesn't exist and we got 0 - this is a cache miss
				log.Debug("cache key missing, recalculating total count")
				totalItems, err = rediscore.CountTotalMarketOrdersRefreshTimes(ctx, redisClient)
				if err != nil {
					log.Error("failed to count total market orders refresh times", "error", err)
					return err
				}
				// Cache it for next time
				ttl := 4*time.Hour + 30*time.Minute
				if err := rediscore.SetCachedTotalMarketOrdersCount(ctx, redisClient, totalItems, ttl); err != nil {
					log.Warn("failed to cache total count", "error", err)
				}
				if totalItems > 0 {
					log.Info("recalculated total count after cache miss", "total_items", totalItems)
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
		const runsPer4Hours = 48.0
		const maxBatchSize = 1000
		const bufferMultiplier = 1.15 // 15% buffer to account for growth and ensure we stay ahead

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
			log.Debug("batch size limited by API rate limit",
				"calculated_batch_size", int(math.Ceil(targetBatchSize)),
				"api_limited_batch_size", batchSize,
				"max_items_per_run_by_api", maxItemsPerRunByAPI,
				"avg_pages_per_item", avgPagesPerItem)
		}
		// Also respect the absolute max
		if batchSize > maxBatchSize {
			batchSize = maxBatchSize
		}

		log.Debug("calculated batch size",
			"total_items", totalItems,
			"target_batch_size", int(math.Ceil(targetBatchSize)),
			"final_batch_size", batchSize,
			"dynamic_min_batch_size", dynamicMinBatchSize,
			"max_items_per_run_by_api", maxItemsPerRunByAPI)

		// Fetch outdated items to process (only fetch what we need for this batch)
		// Fetch items older than 4 hours, up to batch size
		// Use a small buffer to account for invalid entries
		queryLimit := batchSize + 100 // Small buffer for invalid entries
		refreshTimes, err := rediscore.GetMarketOrdersRefreshTimesByScoreRange(ctx, redisClient, 0, float64(thresholdTime), queryLimit)
		if err != nil {
			log.Error("failed to get market orders refresh times by score range, falling back to oldest", "error", err)
			// Fallback to original method if score range query fails
			refreshTimes, err = rediscore.GetOldestMarketOrdersRefreshTimes(ctx, redisClient, queryLimit)
			if err != nil {
				log.Error("failed to get oldest market orders refresh times", "error", err)
				return err
			}
		}

		// Publish messages up to the calculated batch size
		var publishedCount int
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

			// Only publish if we haven't reached the batch size limit
			if publishedCount >= batchSize {
				continue
			}

			// Find station_id for this region_id
			stationID, exists := regionToStation[refreshTime.LocationID]
			if !exists {
				log.Debug("no station mapping found for region", "region_id", refreshTime.LocationID, "type_id", refreshTime.TypeID)
				continue
			}

			// Create market prices request
			request := natscore.MarketPricesRequest{
				TypeID:     refreshTime.TypeID,
				LocationID: refreshTime.LocationID,
				StationID:  stationID,
			}

			// Publish message to trigger refresh with retry logic
			subject := natscore.SubjectRefreshMarketPrices
			if err := natscore.PublishTask(jsContext, subject, taskscore.TaskTypeRefreshMarketPrices, request, natsConn); err != nil {
				log.Warn("failed to publish market prices refresh message",
					"type_id", refreshTime.TypeID,
					"location_id", refreshTime.LocationID,
					"station_id", stationID,
					"error", err)
				continue
			}

			publishedCount++
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

				log.Warn("market prices refresh backlog exceeds capacity",
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
				log.Info("market prices refresh triggered",
					"outdated_entries_found", outdatedCount,
					"published_messages", publishedCount,
					"remaining_outdated", remainingOutdated,
					"checked_entries", len(refreshTimes),
					"batch_size", batchSize)
			}
		} else {
			// Normal operation - no backlog, minimal logging
			log.Info("market prices refresh triggered",
				"outdated_entries_found", outdatedCount,
				"published_messages", publishedCount,
				"checked_entries", len(refreshTimes),
				"batch_size", batchSize)
		}

		return nil
	})

	return func() {}, nil
}
