package esi

import (
	"testing"
	"time"

	esicore "eve-industry-planner/shared/core/esi"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/testing/redisfake"
)

// The sweep publishes whatever is stale, so nothing in it spaces the hubs out.
// They separate anyway: the dispatcher walks one book at a time, so their passes
// finish seconds apart, and a hub whose hour is up just after a tick waits for
// the next one. Each hour that repeats until every hub owns a tick of its own.
//
// This holds the property because it is emergent rather than written down —
// books small enough to walk inside one tick's resolution would stay clustered
// at one burst an hour, and nothing else would say so.
func TestTheSweepSettlesToOneHubPerTick(t *testing.T) {
	const (
		tickEvery   = 15 * time.Minute
		walkTakes   = 30 * time.Second // one book, serialised behind the last
		settleHours = 6
	)

	fake := redisfake.New(t)
	regions := esicore.DefaultMarketLocations
	if len(regions) < 2 {
		t.Skip("needs at least two hubs to stagger")
	}
	start := time.Date(2026, 9, 4, 0, 0, 0, 0, time.UTC)

	perTick := map[time.Time]int{}
	for tick := range settleHours * int(time.Hour/tickEvery) {
		now := start.Add(time.Duration(tick) * tickEvery)

		due, err := regionsDue(t.Context(), fake.Client, regions, now)
		if err != nil {
			t.Fatalf("regionsDue: %v", err)
		}
		perTick[now] = len(due)

		for i, location := range due {
			done := now.Add(time.Duration(i) * walkTakes)
			if err := rediscore.SaveRegionMarketOrdersRefreshTime(t.Context(), fake.Client,
				location.RegionID, done.UnixMilli()); err != nil {
				t.Fatalf("recording pass: %v", err)
			}
			if err := rediscore.SaveNextRefresh(t.Context(), fake.Client,
				rediscore.RegionMarketOrdersDataset(location.RegionID), done.Add(5*time.Minute)); err != nil {
				t.Fatalf("recording freshness: %v", err)
			}
		}
	}

	// The final hour must be settled: no tick publishing more than one hub, and
	// every hub still refreshed within the interval.
	lastHour := start.Add(time.Duration(settleHours-1) * time.Hour)
	published := 0
	for at, count := range perTick {
		if at.Before(lastHour) {
			continue
		}
		if count > 1 {
			t.Errorf("%s published %d hubs at once; the sweep had not settled after %d hours",
				at.Format("15:04"), count, settleHours-1)
		}
		published += count
	}
	if published != len(regions) {
		t.Errorf("the settled hour refreshed %d hubs, want each of the %d exactly once",
			published, len(regions))
	}
}
