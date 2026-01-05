package esi

import (
	"context"
	"encoding/json"
	"time"

	esicore "eve-industry-planner/shared/core/esi"
	natscore "eve-industry-planner/shared/core/nats"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/scheduler"
	taskscore "eve-industry-planner/shared/tasks"
)

// ScheduleMarketPricesRefresh sets up a static cron job for market prices refresh (every 15 minutes).
// It finds up to 200 locations that are more than 4 hours out of date and triggers refreshes.
// Returns a cleanup function and an error if scheduling fails.
func ScheduleMarketPricesRefresh(deps scheduler.Dependencies, sched scheduler.Scheduler) (func(), error) {
	jsContext := deps.JSContext
	natsConn := deps.NATS
	redisClient := deps.Redis
	log := deps.Log

	// Register the task handler
	sched.RegisterHandler(taskscore.TaskTypeRefreshMarketPrices, func(ctx context.Context, data json.RawMessage) error {
		// Query Redis for oldest refresh times
		// Query a larger batch to ensure we can find entries that need refreshing
		queryLimit := 1000
		log.Debug("checking for outdated market prices", "query_limit", queryLimit)

		refreshTimes, err := rediscore.GetOldestMarketOrdersRefreshTimes(ctx, redisClient, queryLimit)
		if err != nil {
			log.Error("failed to get oldest market orders refresh times", "error", err)
			return err
		}

		// Build a map of region_id -> station_id for quick lookup
		regionToStation := make(map[int32]int64)
		for _, location := range esicore.DefaultMarketLocations {
			regionToStation[location.RegionID] = location.StationID
		}

		// Filter for entries more than 4 hours old
		// thresholdTime is the time 4 hours ago - we want items older than this
		thresholdTime := time.Now().Add(-4 * time.Hour).UnixMilli()
		var outdatedCount int
		var publishedCount int
		maxMessages := 200

		for _, refreshTime := range refreshTimes {
			// Skip if updated within the last 4 hours (i.e., not old enough)
			// LastUpdated >= thresholdTime means it was updated AFTER 4 hours ago, so it's recent
			if refreshTime.LastUpdated >= thresholdTime {
				continue
			}

			// This entry is more than 4 hours old
			outdatedCount++

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
			if err := scheduler.PublishTaskMessage(jsContext, subject, taskscore.TaskTypeRefreshMarketPrices, request, natsConn); err != nil {
				log.Warn("failed to publish market prices refresh message",
					"type_id", refreshTime.TypeID,
					"location_id", refreshTime.LocationID,
					"station_id", stationID,
					"error", err)
				continue
			}

			publishedCount++

			// Stop at 200 messages sent (even if more entries need refreshing)
			if publishedCount >= maxMessages {
				break
			}
		}

		log.Info("market prices refresh triggered",
			"outdated_entries_found", outdatedCount,
			"published_messages", publishedCount,
			"checked_entries", len(refreshTimes),
			"max_messages", maxMessages)

		return nil
	})

	return func() {}, nil
}

