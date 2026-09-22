package esi

import (
	"context"
	"fmt"
	"slices"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/worker/taskrun"
)

const (
	// A market stays tracked for a fortnight after the last time anything asked
	// for it. A reader who prices a job weekly never re-pays their region's first
	// walk, and a break long enough to matter — a holiday — is still covered;
	// what falls out is a market saved once and abandoned.
	unaskedMarketLifetime = 14 * 24 * time.Hour

	// A book is dropped by age alone. Long enough that a region still being
	// walked is never a candidate and a market asked for again can be priced
	// from what is already stored, short enough that a book nothing walks is not
	// held for a month.
	orphanedPageLifetime = 7 * 24 * time.Hour
)

// RetireUnaskedMarkets stops tracking the markets nothing has asked about, and
// drops the books left behind by age.
//
// A retired region keeps its stored book until the backstop below takes it: a
// market asked for again inside that window is priced from those pages with no
// ESI call, and deleting them on retirement would instead leave the next walk
// holding valid ETags for pages it no longer has — 304s it cannot replay, and a
// book that cannot rebuild until ESI's own validator moves.
//
// The four hubs are exempt: every reader prices against them, so a quiet
// fortnight means the planner was quiet rather than that nobody wants Jita.
func RetireUnaskedMarkets(ctx context.Context, deps *taskrun.Dependencies) error {
	if deps == nil || deps.Redis == nil {
		return fmt.Errorf("redis client is required")
	}

	start := time.Now()
	orders := deps.Redis.MarketOrders()
	cutoff := start.Add(-unaskedMarketLifetime)

	regions, err := orders.TrackedRegions(ctx)
	if err != nil {
		return err
	}

	retired := 0
	for _, regionID := range regions {
		if slices.ContainsFunc(models.DefaultMarketLocations, func(hub models.MarketLocation) bool {
			return hub.RegionID == regionID
		}) {
			continue
		}

		remaining, err := orders.DropStationsAskedBefore(ctx, regionID, cutoff)
		if err != nil {
			return err
		}
		if remaining > 0 {
			continue
		}

		stopped, err := orders.StopTrackingRegionIfUnwanted(ctx, regionID)
		if err != nil {
			return err
		}
		if stopped {
			retired++
		}
	}

	// Nothing walks a retired region, so its newest page only ages from here.
	orphaned := 0
	if deps.MarketPages.Available() {
		orphaned, err = deps.MarketPages.DropRegionsOlderThan(ctx, start.Add(-orphanedPageLifetime))
		if err != nil {
			return err
		}
	}

	logs.InfoCtx(ctx, "unasked markets retired",
		"regions_tracked", len(regions),
		"regions_retired", retired,
		"orphaned_books_dropped", orphaned,
		"duration_ms", time.Since(start).Milliseconds())

	return nil
}
