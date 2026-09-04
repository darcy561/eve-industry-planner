package esi

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"time"

	esimetrics "eve-industry-planner/core/metrics/esi"
	"eve-industry-planner/core/scheduler/contract"
	esicore "eve-industry-planner/shared/core/esi"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"

	redislib "github.com/redis/go-redis/v9"
)

// regionSweepInterval is how often a hub's order book is walked again. It is
// the one number that decides how stale hub prices may get, and what they cost:
// a full four-hub pass is roughly 1,674 tokens against an allowance of 12,000
// per fifteen minutes.
const regionSweepInterval = time.Hour

// RegionMarketOrdersRefresh sets up the cron job that refreshes the default
// market regions' order books. Each tick publishes every hub whose book has
// gone stale, oldest first.
//
// Nothing is published while ESI is not answering. A hub whose cost the budget
// cannot absorb is left for a later tick, and the ones behind it are still
// tried — a cheaper book refreshed is better than none.
func RegionMarketOrdersRefresh(deps contract.Dependencies, jobName string) contract.TaskHandler {
	natsHandle := deps.NATS
	redisClient := deps.Redis
	esi := deps.ESI

	return func(ctx context.Context, data json.RawMessage) error {
		if deferred, err := DeferPublicationUntilAfterDowntime(ctx, natsHandle, jobName, esi); err != nil || deferred {
			return err
		}
		return runRegionMarketOrdersRefresh(ctx, natsHandle, redisClient, esi, jobName)
	}
}

func runRegionMarketOrdersRefresh(
	ctx context.Context,
	natsHandle *eipnats.NATS,
	redisClient *redislib.Client,
	esi esiclient.API,
	jobName string,
) error {
	regions := esicore.DefaultMarketLocations
	if len(regions) == 0 {
		return nil
	}

	due, err := regionsDue(ctx, redisClient, regions, time.Now())
	if err != nil {
		return err
	}
	if len(due) == 0 {
		esimetrics.RecordPublicationSkipped(ctx, jobName, esimetrics.SkipFresh)
		logs.DebugCtx(ctx, "no region market order books have gone stale",
			"component", schedulerLogComponent, "regions_total", len(regions))
		return nil
	}

	published := 0
	for _, location := range due {
		if !canAffordRegionRefresh(ctx, esi, redisClient, location.RegionID) {
			esimetrics.RecordPublicationSkipped(ctx, jobName, esimetrics.SkipBudget)
			continue
		}
		if err := eipnats.PublishRefreshRegionMarketOrders(ctx, natsHandle, location.RegionID, location.StationID); err != nil {
			return err
		}
		published++
		logs.InfoCtx(ctx, "published region market orders refresh task",
			"component", schedulerLogComponent,
			"region_id", location.RegionID,
			"station_id", location.StationID)
	}

	logs.DebugCtx(ctx, "region market orders sweep complete",
		"component", schedulerLogComponent,
		"stale", len(due), "published", published, "regions_total", len(regions))
	return nil
}

// regionsDue is every hub whose book should be walked again, stalest first, so
// that a budget too tight for all of them spends what it has on the oldest.
//
// A hub is due once regionSweepInterval has passed since its last pass, and
// never before ESI's own max-age has expired — a call inside that window is
// answered 304 and still costs a token, so it buys nothing. The sweep interval
// is the binding constraint while it stays longer than the max-age; the
// max-age check is what keeps a shorter interval safe to set.
func regionsDue(ctx context.Context, client *redislib.Client, regions []esicore.MarketLocation, now time.Time) ([]esicore.MarketLocation, error) {
	if client == nil {
		return regions, nil
	}

	times, err := rediscore.GetRegionMarketOrdersRefreshTimes(ctx, client)
	if err != nil {
		return nil, err
	}
	lastPass := make(map[int32]time.Time, len(times))
	for _, t := range times {
		lastPass[t.RegionID] = time.UnixMilli(t.LastUpdated)
	}

	var due []esicore.MarketLocation
	for _, location := range regions {
		last, walked := lastPass[location.RegionID]
		if walked && now.Before(last.Add(regionSweepInterval)) {
			continue
		}
		if fresh, _ := regionStillFresh(ctx, client, location.RegionID, now); fresh {
			continue
		}
		due = append(due, location)
	}

	slices.SortStableFunc(due, func(a, b esicore.MarketLocation) int {
		return lastPass[a.RegionID].Compare(lastPass[b.RegionID])
	})
	return due, nil
}

// canAffordRegionRefresh reports whether the bucket can absorb one region
// pagination, costed from what the last pass actually walked: one ETag was
// stored per page, so the page count is measured rather than assumed.
//
// A region never fetched has no page count, and the first pass is what
// establishes it — so it is published and the limiter paces it.
func canAffordRegionRefresh(ctx context.Context, esi esiclient.API, redisClient *redislib.Client, regionID int32) bool {
	if esi == nil {
		return true
	}

	etags, err := rediscore.GetRegionMarketOrdersETags(ctx, redisClient, regionID)
	if err != nil {
		logs.WarnCtx(ctx, "failed reading region page count, publishing without a budget check",
			"component", schedulerLogComponent, "region_id", regionID, "error", err)
		return true
	}
	if len(etags) == 0 {
		return true
	}

	// Every page is a 2xx, and a success costs the same wherever it lands.
	cost := len(etags) * esiclient.SuccessCost

	// The group is learned per exact path, so the question has to name the region
	// the run will actually walk rather than a stand-in.
	path := fmt.Sprintf("/markets/%d/orders/", regionID)

	affordable, room, err := esi.CanAfford(ctx, path, esiclient.Identity{}, esiclient.ClassBackground, cost)
	if err != nil {
		logs.WarnCtx(ctx, "failed reading ESI headroom, publishing without a budget check",
			"component", schedulerLogComponent, "region_id", regionID, "error", err)
		return true
	}
	if affordable {
		return true
	}

	logs.InfoCtx(ctx, "region market orders refresh deferred by token availability",
		"component", schedulerLogComponent,
		"region_id", regionID,
		"pages_last_pass", len(etags),
		"estimated_cost", cost,
		"available", room.Available,
		"resets_at_utc", room.ResetAt.UTC().Format(time.RFC3339))
	return false
}

// regionStillFresh reports whether ESI's own max-age says this region's book
// cannot have changed yet. A region nothing has fetched has no answer, and the
// first pass is what establishes one.
func regionStillFresh(ctx context.Context, client *redislib.Client, regionID int32, now time.Time) (bool, time.Time) {
	due, err := rediscore.NextRefresh(ctx, client, rediscore.RegionMarketOrdersDataset(regionID))
	if err != nil {
		logs.WarnCtx(ctx, "could not read region freshness, publishing anyway",
			"component", schedulerLogComponent, "region_id", regionID, "error", err)
		return false, time.Time{}
	}
	return !due.IsZero() && due.After(now), due
}
