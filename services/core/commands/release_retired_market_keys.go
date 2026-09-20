package commands

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/stackservices"
)

// dropRetiredMarketKeys removes the market keys left behind by the shapes this
// release retires: bookkeeping written per type and per region, and a price
// written per type at a region rather than at a station.
//
// They are not converted because nothing reads them — the prices the running
// code answers from are keyed at a station, and the pages a walk replays from
// are in object storage. What makes this a release step rather than something
// left to age out is that both shapes were written without a lifetime: they
// survive every restart and expire on no clock, so a deploy that does not remove
// them leaves them for ever.
//
// A key is a candidate only if it has no lifetime of its own, which is what
// keeps a price this release writes out of the sweep whatever its shape reads
// like, and what makes a second run find nothing.
func dropRetiredMarketKeys(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	if clients == nil || clients.Redis == nil {
		return "", fmt.Errorf("redis handle is required")
	}

	found, err := clients.Redis.MarketOrders().RetiredMarketKeys(ctx, !dryRun)
	if err != nil {
		return "", fmt.Errorf("sweep retired market keys: %w", err)
	}
	if found == 0 {
		return "no retired market keys are held", nil
	}

	verb := "removed"
	if dryRun {
		verb = "would be removed"
	}
	return fmt.Sprintf("%d retired market key(s) %s", found, verb), nil
}
